import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import init_db
from .routers import admin, chat

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Persian RAG Chatbot")

# Public widget can be embedded anywhere, so allow cross-origin calls.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(admin.router)

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")


class NoCacheStaticFiles(StaticFiles):
    """Serve static files without browser caching, so updated widget.js /
    admin.html are always fetched fresh during development."""
    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return response


@app.on_event("startup")
def on_startup():
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    init_db()


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Return JSON (not Starlette's plain-text 500) so clients can always parse
    # and show a meaningful message. Real detail only in DEBUG.
    logging.exception("Unhandled error")
    detail = str(exc) if settings.DEBUG else "خطای داخلی سرور رخ داد."
    return JSONResponse(status_code=500, content={"detail": detail})


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/")
def root():
    return RedirectResponse(url="/admin")


@app.get("/admin")
def admin_page():
    return FileResponse(os.path.join(STATIC_DIR, "admin.html"))


@app.get("/demo")
def demo_page():
    return FileResponse(os.path.join(STATIC_DIR, "demo.html"))


app.mount("/static", NoCacheStaticFiles(directory=STATIC_DIR), name="static")
