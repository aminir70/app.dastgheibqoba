"""عیب‌یابی بازیابی: یک سؤال را قدم‌به‌قدم از مسیر جستجو عبور می‌دهد و نشان می‌دهد
کدام مسأله‌ها پیدا و به مدل فرستاده می‌شوند. چیزی ذخیره یا مصرف کاربری ثبت نمی‌کند.

    docker compose exec api python -m app.diag
    docker compose exec api python -m app.diag --want 1458 "متن سؤال"
"""
import sys

from .db import SessionLocal
from .openai_client import chat as chat_once
from .rag import (REWRITE_PROMPT, _parse_rewrite, _query_terms, find_ruling,
                  keyword_search, own_label, retrieve, vector_search)
from .settings_store import get_setting
from .text_norm import normalize_fa

DEFAULT_Q = "سلام خسته نباشید\nآقای دستغیب گفتن میشه پشت زن نماز جماعت بخونیم؟"


def _lbl(c):
    return own_label(c.content) or ("(بدون شماره) " + c.content[:40].replace("\n", " "))


def main(argv):
    want = None
    if "--want" in argv:
        i = argv.index("--want")
        want = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    q = " ".join(argv).strip() or DEFAULT_Q
    if want is None and q == DEFAULT_Q:
        want = "1458"
    s = SessionLocal()
    try:
        print("== تنظیمات")
        for k in ("answer_model", "rewrite_model", "query_rewrite_enabled", "top_k",
                  "max_context_chunks", "max_distance", "embedding_model"):
            print(f"  {k}: {get_setting(s, k, '(پیش‌فرض)')!r}")
        sp = get_setting(s, "system_prompt", "") or ""
        print("  قانون «محاوره‌ای» در دستور سیستمی:", "بله" if "محاوره" in sp else "خیر")

        print("\n== سؤال:", q.replace("\n", " / "))
        print("  کلمه‌های جستجو:", _query_terms(normalize_fa(q)))

        if want:
            r = find_ruling(s, int(want))
            print(f"\n== مسأله {want} در دیتابیس:", "هست" if r else "پیدا نشد!")
            if r:
                print("   ", r.content[:400].replace("\n", " "))

        print("\n== تبدیل سؤال (خروجی خام مدل)")
        model = get_setting(s, "rewrite_model", "") or get_setting(s, "answer_model", "gpt-4o-mini")
        rq, kws = None, []
        try:
            text, p, c = chat_once(model, [{"role": "system", "content": REWRITE_PROMPT},
                                           {"role": "user", "content": q}], 0)
            print("   ", (text or "").strip()[:600])
            rq, kws = _parse_rewrite(text)
            print("  خوانده‌شده → query:", rq, "| keywords:", kws, f"| توکن: {p}+{c}")
        except Exception as e:
            print("  خطا:", repr(e))

        print("\n== جستجوی کلیدواژه")
        for c, _f in keyword_search(s, q, limit=8, extra_terms=kws):
            print("   ", _lbl(c))
        top_k = int(get_setting(s, "top_k", 10))
        phrasings = [normalize_fa(q)] + ([normalize_fa(rq)] if rq else [])
        lists, _ = vector_search(s, phrasings, top_k)
        for name, rows in zip(["متن کاربر", "عبارت رسمی"], lists):
            print(f"\n== جستجوی معنایی ({name})")
            for c, _f, d in rows:
                print(f"    {d:.3f}  {_lbl(c)}")

        chunks, primary, _ = retrieve(s, q, (rq, kws))
        by_id = {c.id: c for c, _ in chunks}
        print("\n== ترتیب نهایی (به مدل فرستاده می‌شود)")
        for n, cid in enumerate(primary[:20], 1):
            mark = "✓" if cid in by_id else "✗ (بیرون از سقف)"
            c = by_id.get(cid)
            print(f"   {n:2d}. {mark} {_lbl(c) if c else cid}")
        if want:
            hit = any((own_label(c.content) or "").endswith(" " + want) for c, _ in chunks)
            print(f"\n== نتیجه: مسأله {want} {'به مدل می‌رسد ✓' if hit else 'به مدل نمی‌رسد ✗'}")
    finally:
        s.close()


if __name__ == "__main__":
    main(sys.argv[1:])
