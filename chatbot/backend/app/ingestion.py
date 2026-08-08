import io
import logging

import fitz  # PyMuPDF
import pytesseract
import tiktoken
from PIL import Image
from docx import Document as DocxDocument

from .db import SessionLocal
from .models import Chunk, Document
from .openai_client import embed_texts
from .settings_store import get_setting
from .text_norm import normalize_fa

log = logging.getLogger("ingestion")

# A page with fewer than this many extractable characters is treated as scanned
# and routed through OCR instead.
MIN_TEXT_CHARS_PER_PAGE = 40
OCR_DPI = 200

try:
    _enc = tiktoken.get_encoding("o200k_base")
except Exception:  # pragma: no cover
    _enc = tiktoken.get_encoding("cl100k_base")


def _count_tokens(text: str) -> int:
    return len(_enc.encode(text))


# ---------- extraction ----------
def _ocr_image(img: Image.Image) -> str:
    return pytesseract.image_to_string(img, lang="fas")


def _extract_pdf(path: str):
    """Yield (page_number, text). Falls back to OCR for scanned pages."""
    used_ocr = False
    doc = fitz.open(path)
    for i, page in enumerate(doc, start=1):
        text = page.get_text("text").strip()
        if len(text) < MIN_TEXT_CHARS_PER_PAGE:
            pix = page.get_pixmap(dpi=OCR_DPI)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            text = _ocr_image(img).strip()
            if text:
                used_ocr = True
        if text:
            yield i, text
    doc.close()
    return used_ocr


def _extract_docx(path: str):
    d = DocxDocument(path)
    parts = [p.text for p in d.paragraphs if p.text.strip()]
    for table in d.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells if c.text.strip()]
            if cells:
                parts.append(" | ".join(cells))
    text = "\n".join(parts).strip()
    if text:
        yield None, text


def _extract_image(path: str):
    text = _ocr_image(Image.open(path)).strip()
    if text:
        yield None, text


def extract(path: str, mime: str):
    """Return (list_of_(page,text), used_ocr)."""
    used_ocr = False
    pages = []
    if mime == "application/pdf" or path.lower().endswith(".pdf"):
        gen = _extract_pdf(path)
        try:
            while True:
                pages.append(next(gen))
        except StopIteration as stop:
            used_ocr = bool(stop.value)
    elif path.lower().endswith((".docx",)):
        pages = list(_extract_docx(path))
    elif path.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp")):
        pages = list(_extract_image(path))
        used_ocr = True
    else:
        raise ValueError(f"نوع فایل پشتیبانی نمی‌شود: {mime}")
    return pages, used_ocr


# ---------- chunking ----------
def chunk_text(text: str, page, max_tokens: int, overlap: int):
    """Split text into ~max_tokens windows with overlap, respecting token counts."""
    tokens = _enc.encode(text)
    chunks = []
    start = 0
    step = max(1, max_tokens - overlap)
    while start < len(tokens):
        window = tokens[start:start + max_tokens]
        chunk_str = _enc.decode(window).strip()
        if chunk_str:
            chunks.append((chunk_str, page, len(window)))
        start += step
    return chunks


# ---------- main task ----------
def ingest_document(document_id: int):
    """Called by the worker. Extracts, chunks, embeds and stores the document."""
    db = SessionLocal()
    try:
        doc = db.query(Document).get(document_id)
        if not doc:
            return
        doc.status = "processing"
        db.commit()

        max_tokens = int(get_setting(db, "chunk_tokens", 800))
        overlap = int(get_setting(db, "chunk_overlap", 150))
        emb_model = get_setting(db, "embedding_model", "text-embedding-3-large")
        emb_dims = int(get_setting(db, "embedding_dims", 1536))

        pages, used_ocr = extract(doc.stored_path, doc.mime)
        # canonicalize to Persian forms so stored chunks + embeddings match
        # Persian-typed queries (ك→ک, ي/ى→ی, ة→ه, strip harakat, digits)
        pages = [(pg, normalize_fa(txt)) for pg, txt in pages]

        all_chunks = []
        for page_no, text in pages:
            all_chunks.extend(chunk_text(text, page_no, max_tokens, overlap))

        if not all_chunks:
            doc.status = "error"
            doc.error = "هیچ متنی از فایل استخراج نشد."
            db.commit()
            return

        # embed in batches
        BATCH = 64
        for i in range(0, len(all_chunks), BATCH):
            batch = all_chunks[i:i + BATCH]
            vectors, _ = embed_texts([c[0] for c in batch], emb_model, emb_dims)
            for (content, page_no, tok), vec in zip(batch, vectors):
                db.add(Chunk(
                    document_id=doc.id,
                    content=content,
                    page=page_no,
                    token_count=tok,
                    embedding=vec,
                ))
            db.commit()

        doc.pages = len({p for p, _ in pages if p is not None})
        doc.chunk_count = len(all_chunks)
        doc.used_ocr = used_ocr
        doc.status = "ready"
        doc.error = None
        db.commit()
        log.info("Document %s ingested: %s chunks", doc.id, len(all_chunks))
    except Exception as e:  # pragma: no cover
        log.exception("ingest failed")
        doc = db.query(Document).get(document_id)
        if doc:
            doc.status = "error"
            doc.error = str(e)[:1000]
            db.commit()
    finally:
        db.close()
