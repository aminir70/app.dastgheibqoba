"""Persian/Arabic text normalization.

Religious/legal source texts are frequently typed with Arabic-script letters
(ك ي ى ة) and full diacritics (شكّ), while users type the Persian forms
(ک ی) without diacritics (شک). Without normalization neither keyword nor
vector search reliably matches. We normalize BOTH the indexed text (at
ingestion) and the query (at retrieval) to the same canonical Persian form.
"""

import re

# tanwin / harakat / tashdid, superscript alef, tatweel(kashida)
_HARAKAT = re.compile(r"[ً-ْٰـ]")

# Arabic letter variants -> canonical Persian
_LETTER_MAP = {
    "ك": "ک",  # ك -> ک
    "ي": "ی",  # ي -> ی
    "ى": "ی",  # ى -> ی
    "ة": "ه",  # ة -> ه
    "أ": "ا",  # أ -> ا
    "إ": "ا",  # إ -> ا
    "آ": "ا",  # آ -> ا
    "ٱ": "ا",  # ٱ -> ا
    "ؤ": "و",  # ؤ -> و
    "ئ": "ی",  # ئ -> ی
}

# Arabic-Indic and Persian digits -> Latin
_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def normalize_fa(s: str) -> str:
    if not s:
        return s
    s = _HARAKAT.sub("", s)
    for a, b in _LETTER_MAP.items():
        s = s.replace(a, b)
    s = s.translate(_DIGITS)
    return s
