from openai import OpenAI

from .config import settings

_client = None


def client() -> OpenAI:
    global _client
    if _client is None:
        base_url = (settings.OPENAI_BASE_URL or "").strip()
        if base_url and not base_url.startswith(("http://", "https://")):
            base_url = "https://" + base_url
        # Always pass an explicit, valid base_url. An empty OPENAI_BASE_URL
        # env var would otherwise make the SDK build an invalid URL.
        kwargs = {
            "api_key": settings.OPENAI_API_KEY,
            "base_url": base_url or "https://api.openai.com/v1",
            "timeout": 60.0,     # be patient on slow/unstable connections
            "max_retries": 4,    # retry transient connection errors
        }
        _client = OpenAI(**kwargs)
    return _client


def embed_texts(texts, model: str, dims: int):
    """Return (list_of_vectors, total_tokens)."""
    resp = client().embeddings.create(model=model, input=texts, dimensions=dims)
    vectors = [d.embedding for d in resp.data]
    return vectors, resp.usage.total_tokens


def _create_chat(messages, model, temperature, stream):
    """Create a chat completion, retrying without temperature if the model
    rejects a custom temperature (some newer reasoning models do)."""
    kwargs = dict(model=model, messages=messages, stream=stream)
    if stream:
        kwargs["stream_options"] = {"include_usage": True}
    try:
        return client().chat.completions.create(temperature=temperature, **kwargs)
    except Exception as e:
        if "temperature" in str(e).lower():
            return client().chat.completions.create(**kwargs)
        raise


def chat(model: str, messages: list, temperature: float = 0.1):
    """Non-streaming. Return (text, prompt_tokens, completion_tokens)."""
    resp = _create_chat(messages, model, temperature, stream=False)
    return (resp.choices[0].message.content or "",
            resp.usage.prompt_tokens, resp.usage.completion_tokens)


def chat_stream(model: str, messages: list, temperature: float = 0.1):
    """Streaming. Yields ('delta', text) for each token chunk and finally
    ('usage', (prompt_tokens, completion_tokens))."""
    stream = _create_chat(messages, model, temperature, stream=True)
    prompt_tokens = completion_tokens = 0
    for chunk in stream:
        if chunk.choices:
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield ("delta", delta.content)
        if getattr(chunk, "usage", None):
            prompt_tokens = chunk.usage.prompt_tokens
            completion_tokens = chunk.usage.completion_tokens
    yield ("usage", (prompt_tokens, completion_tokens))


def estimate_cost(prices: dict, model: str, input_tokens: int, output_tokens: int) -> float:
    p = prices.get(model, {"input": 0.0, "output": 0.0})
    return (input_tokens / 1_000_000) * p.get("input", 0.0) + \
           (output_tokens / 1_000_000) * p.get("output", 0.0)
