"""Default editable settings + pricing table.

Prices are USD per 1M tokens and are used ONLY to estimate cost for the
global daily budget cap. Verify them against OpenAI's current pricing page;
they can be adjusted any time from the admin panel (model_prices).
"""

DEFAULT_SYSTEM_PROMPT = (
    "تو یک دستیار پاسخگو هستی که فقط و فقط بر اساس «منابع» داده‌شده پاسخ می‌دهی.\n"
    "قوانین:\n"
    "۱. فقط از متنی که در بخش منابع آمده استفاده کن. از دانش عمومی خودت استفاده نکن.\n"
    "۲. اگر پاسخ در منابع نبود، دقیقاً بنویس: «در منابع موجود پاسخی برای این سؤال پیدا نشد.»\n"
    "۳. پاسخ را به زبان فارسی، روشن و خلاصه بده.\n"
    "۴. چیزی از خودت اضافه یا حدس نزن.\n"
    "۵. اگر پاسخ را پیدا کردی، در پایان شماره منبع(های) استفاده‌شده را داخل کروشه ذکر کن، مثل [۱]. اگر پاسخ پیدا نشد، هیچ شماره‌ی منبعی ننویس.\n"
)

DEFAULT_SETTINGS = {
    "answer_model": "gpt-4o-mini",
    "embedding_model": "text-embedding-3-large",
    "embedding_dims": 1536,
    "top_k": 10,
    "max_distance": 0.85,         # cosine distance; higher = more lenient recall
    "max_context_chunks": 16,     # max chunks (incl. neighbors) sent to the model
    "neighbor_radius": 1,         # also include N chunks before/after each hit
    "chunk_tokens": 800,
    "chunk_overlap": 150,
    "temperature": 0.1,
    "system_prompt": DEFAULT_SYSTEM_PROMPT,

    # small talk / greetings: when nothing relevant is found in the documents,
    # answer greetings & social pleasantries warmly, but still refuse real
    # questions that aren't in the sources.
    "smalltalk_enabled": True,
    "bot_persona": "یک دستیار پاسخگوی دوستانه که بر اساس اسناد به کاربران کمک می‌کند",
    "smalltalk_prompt": (
        "تو {persona} هستی.\n"
        "کاربر پیامی فرستاده که در اسناد، محتوای مرتبطی برایش پیدا نشد.\n"
        "اگر پیام او صرفاً احوال‌پرسی، سلام، تشکر، خداحافظی یا گفت‌وگوی اجتماعی ساده است، "
        "کوتاه و گرم و مؤدبانه به فارسی پاسخ بده و او را دعوت کن سؤالش را درباره‌ی محتوا بپرسد.\n"
        "اما اگر پیام یک سؤال اطلاعاتی یا واقعی است (که در اسناد نبود)، فقط و فقط دقیقاً این جمله را بنویس: "
        "«در منابع موجود پاسخی برای این سؤال پیدا نشد.»\n"
        "هرگز از دانش عمومی خودت برای پاسخ به سؤالات واقعی استفاده نکن."
    ),

    # limits
    "require_auth": True,
    "per_user_daily_messages": 20,
    "per_user_monthly_tokens": 100000,
    "global_daily_budget_usd": 10.0,

    # pricing (USD / 1M tokens) — edit to match OpenAI's current rates
    "model_prices": {
        "gpt-4o-mini": {"input": 0.15, "output": 0.6},
        "gpt-4o": {"input": 2.5, "output": 10.0},
        "text-embedding-3-large": {"input": 0.13, "output": 0.0},
        "text-embedding-3-small": {"input": 0.02, "output": 0.0},
    },
}
