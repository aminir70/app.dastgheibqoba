import logging
import re

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import Chunk, Document
from .openai_client import embed_texts
from .settings_store import get_setting
from .text_norm import normalize_fa

log = logging.getLogger("rag")

NOT_FOUND = "در منابع موجود پاسخی برای این سؤال پیدا نشد."

# normalize Persian/Arabic digits to Latin so "۱۳" and "13" match
_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
_STOP = {"بگو", "چیه", "این", "اون", "که", "از", "به", "با", "را", "رو",
         "یه", "هست", "کن", "بده", "درباره", "مورد", "چی", "میشه", "بگید"}

# structural markers inside the text, e.g. "مسأله ۱۷", "ماده 5", "بند ۳"
_LABEL_RE = re.compile(
    r"(مسأله|مسئله|مساله|مسله|ماده|بند|اصل|فصل|سؤال|سوال)\s*[:\-ـ]?\s*([0-9۰-۹٠-٩]{1,4})"
)


def extract_labels(text: str):
    """Find structural references like 'مسأله ۱۷' inside a chunk."""
    out, seen = [], set()
    for m in _LABEL_RE.finditer(text):
        label = f"{m.group(1)} {_norm_digits(m.group(2))}"
        if label not in seen:
            seen.add(label)
            out.append(label)
    return out


def _norm_digits(s: str) -> str:
    return s.translate(_DIGITS)


def vector_search(db: Session, query: str, top_k: int):
    """Semantic search. Returns (rows, embedding_tokens) where each row is
    (Chunk, filename, cosine_distance)."""
    emb_model = get_setting(db, "embedding_model", "text-embedding-3-large")
    emb_dims = int(get_setting(db, "embedding_dims", 1536))
    vectors, emb_tokens = embed_texts([query], emb_model, emb_dims)
    qvec = vectors[0]
    rows = (
        db.query(
            Chunk,
            Document.filename,
            Chunk.embedding.cosine_distance(qvec).label("distance"),
        )
        .join(Document, Document.id == Chunk.document_id)
        .filter(Document.status == "ready")
        .order_by("distance")
        .limit(top_k)
        .all()
    )
    return rows, emb_tokens


# small numbers digit->word: users type "نماز ۳ رکعتی" while the source text
# writes "نماز سه رکعتی" — expand digits so both keyword and vector search match
_NUM_WORDS = {
    "1": "یک", "2": "دو", "3": "سه", "4": "چهار", "5": "پنج", "6": "شش",
    "7": "هفت", "8": "هشت", "9": "نه", "10": "ده", "11": "یازده", "12": "دوازده",
}

# an explicit reference the user asks for directly: "مساله 7", "ماده 12"
_REF_RE = re.compile(r"(مساله|ماده)\s*[:\-ـ]?\s*([0-9]{1,5})")


def _number_word_terms(q_norm: str):
    """Persian word forms for standalone small numbers in the query."""
    out = []
    for m in re.finditer(r"(?<![0-9])([0-9]{1,2})(?![0-9])", q_norm):
        w = _NUM_WORDS.get(m.group(1))
        if w and w not in out:
            out.append(w)
    return out


def _norm_content_expr():
    """SQL expression: chunk content normalized the same way as queries, so
    Arabic-script source text matches Persian-typed terms."""
    return func.translate(
        Chunk.content,
        "۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩كيىةأإآٱؤئًٌٍَُِّْٰـ",
        "01234567890123456789کییهااااوی",
    )


def reference_search(db: Session, q_norm: str, limit: int = 3):
    """Direct lookup when the user names a ruling explicitly ('مساله 7'):
    fetch the chunk(s) that contain that exact heading. These hits are
    authoritative and are placed at the very top of the context."""
    hits, seen = [], set()
    norm_content = _norm_content_expr()
    for m in _REF_RE.finditer(q_norm):
        kind, num = m.group(1), m.group(2)
        pattern = r"\m" + kind + r"\s*[:\-ـ]?\s*" + num + r"\M"
        rows = (
            db.query(Chunk, Document.filename)
            .join(Document, Document.id == Chunk.document_id)
            .filter(Document.status == "ready")
            .filter(norm_content.op("~")(pattern))
            .order_by(Chunk.id.asc())
            .limit(limit)
            .all()
        )
        for c, f in rows:
            if c.id not in seen:
                seen.add(c.id)
                hits.append((c, f))
    return hits


def keyword_search(db: Session, query: str, per_term: int = 2):
    """Literal keyword/number lookup — complements semantic search for things
    like exact numbers ('مسأله ۱۳') or distinctive words. Uses whole-word
    matching so 'کر' doesn't match 'فکر'/'شکر'. Deterministic (ordered by id)."""
    q = normalize_fa(query)
    terms = re.findall(r"[0-9]{1,6}|[^\W\d_]{2,}", q, flags=re.UNICODE)
    terms = [t for t in terms if t not in _STOP][:6]
    terms += [w for w in _number_word_terms(q) if w not in terms]
    hits, seen = [], set()
    norm_content = _norm_content_expr()
    for term in terms:
        pattern = r"\m" + term + r"\M"   # whole-word match
        rows = (
            db.query(Chunk, Document.filename)
            .join(Document, Document.id == Chunk.document_id)
            .filter(Document.status == "ready")
            .filter(norm_content.op("~")(pattern))
            .order_by(Chunk.id.asc())
            .limit(per_term)
            .all()
        )
        for c, f in rows:
            if c.id not in seen:
                seen.add(c.id)
                hits.append((c, f))
    return hits


def _neighbors(db: Session, chunk, radius: int):
    """Return the `radius` chunks immediately before and after `chunk` within
    the same document (ordered by id, which follows document order)."""
    prev = (
        db.query(Chunk)
        .filter(Chunk.document_id == chunk.document_id, Chunk.id < chunk.id)
        .order_by(Chunk.id.desc()).limit(radius).all()
    )
    nxt = (
        db.query(Chunk)
        .filter(Chunk.document_id == chunk.document_id, Chunk.id > chunk.id)
        .order_by(Chunk.id.asc()).limit(radius).all()
    )
    return prev + nxt


def retrieve(db: Session, query: str):
    """Hybrid retrieval + neighbor expansion. Returns (chunks, embedding_tokens)
    where chunks is a list of (Chunk, filename), sorted in document order so
    content spanning several chunks reads coherently. Empty list = nothing
    relevant found."""
    top_k = int(get_setting(db, "top_k", 10))
    max_distance = float(get_setting(db, "max_distance", 0.85))
    max_chunks = int(get_setting(db, "max_context_chunks", 16))
    radius = int(get_setting(db, "neighbor_radius", 1))

    # canonicalize the query (Arabic->Persian letters, strip harakat, digits)
    query = normalize_fa(query)

    # append word forms of digits so "نماز 3 رکعتی" also matches "سه رکعتی"
    num_words = _number_word_terms(query)
    emb_query = query + (" " + " ".join(num_words) if num_words else "")

    vec_rows, emb_tokens = vector_search(db, emb_query, top_k)
    best = vec_rows[0][2] if vec_rows else None
    ref_hits = reference_search(db, query)   # explicit "مساله N" lookups
    kw_hits = keyword_search(db, query)

    is_relevant = bool(ref_hits) or bool(kw_hits) or \
        (best is not None and best <= max_distance)
    if not is_relevant:
        return [], set(), emb_tokens

    # primary chunks: explicit references first (authoritative), then vector
    # results by relevance, then keyword hits
    primary, seen = [], set()
    for c, f in ref_hits:
        if c.id not in seen:
            seen.add(c.id)
            primary.append((c, f))
    for c, f, _dist in vec_rows:
        if c.id not in seen:
            seen.add(c.id)
            primary.append((c, f))
    for c, f in kw_hits:
        if c.id not in seen:
            seen.add(c.id)
            primary.append((c, f))

    primary_ids = {c.id for c, _ in primary}

    # keep primary chunks (up to cap), then fill with neighbors so that
    # content split across chunk boundaries (lists, multi-part answers) stays whole
    chosen = {}
    for c, f in primary:
        if len(chosen) >= max_chunks:
            break
        chosen[c.id] = (c, f)
    if radius > 0:
        for c, f in primary:
            for n in _neighbors(db, c, radius):
                if len(chosen) >= max_chunks:
                    break
                chosen.setdefault(n.id, (n, f))

    # sort by document then id so multi-chunk answers read in order
    final = sorted(chosen.values(), key=lambda t: (t[0].document_id, t[0].id))
    return final, primary_ids, emb_tokens


def _lookback_label(db: Session, chunk):
    """Find the nearest 'مسأله N'-style heading at or before this chunk in the
    document, by scanning a few preceding chunks."""
    prev_chunks = (
        db.query(Chunk)
        .filter(Chunk.document_id == chunk.document_id, Chunk.id < chunk.id)
        .order_by(Chunk.id.desc()).limit(8).all()
    )
    for pc in prev_chunks:
        labels = extract_labels(pc.content)
        if labels:
            return labels[-1]
    return None


def format_sources(db: Session, chunks, primary_ids=None):
    """Return (context_string, sources_list). Context keeps one numbered entry
    per chunk. Each matched (primary) chunk is tagged with its page and the
    structural label (e.g. 'مسأله ۱۷') that governs it — found from the chunk
    itself or the nearest preceding chunk in the same document."""
    if primary_ids is None:
        primary_ids = {c.id for c, _ in chunks}
    context_parts, sources, seen = [], [], set()
    for idx, (chunk, fname) in enumerate(chunks, start=1):
        loc = f" (صفحه {chunk.page})" if chunk.page else ""
        context_parts.append(f"[{idx}] منبع: {fname}{loc}\n{chunk.content}")
        if chunk.id not in primary_ids:
            continue
        own = extract_labels(chunk.content)
        label = own[0] if own else _lookback_label(db, chunk)
        key = (fname, chunk.page, label)
        if key not in seen:
            seen.add(key)
            sources.append({"filename": fname, "page": chunk.page, "label": label})
    return "\n\n---\n\n".join(context_parts), sources


def build_messages(db: Session, history, context: str, question: str):
    """system prompt + recent history + current question with its context."""
    system_prompt = get_setting(db, "system_prompt", "")
    messages = [{"role": "system", "content": system_prompt}]
    for h in history:
        messages.append({"role": h.role, "content": h.content})
    messages.append({
        "role": "user",
        "content": f"منابع:\n{context}\n\n----\nسؤال کاربر: {question}",
    })
    return messages
