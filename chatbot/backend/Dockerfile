FROM python:3.11-slim

# Tesseract + Persian language pack (for OCR of scanned PDFs / images).
# Debian packages are pulled from an Iranian mirror + retries because
# deb.debian.org is slow/unstable from inside Iran. If the mirror is ever
# unavailable, revert the sed line back to deb.debian.org.
RUN set -eux; \
    if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
      sed -i 's|deb.debian.org|mirror.arvancloud.ir|g; s|security.debian.org|mirror.arvancloud.ir|g' /etc/apt/sources.list.d/debian.sources; \
    else \
      sed -i 's|deb.debian.org|mirror.arvancloud.ir|g; s|security.debian.org|mirror.arvancloud.ir|g' /etc/apt/sources.list; \
    fi; \
    printf 'Acquire::Retries "8";\nAcquire::http::Timeout "30";\n' > /etc/apt/apt.conf.d/80retries; \
    apt-get update && apt-get install -y --no-install-recommends \
      tesseract-ocr tesseract-ocr-fas libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# pip: be patient/retry on a slow connection (kept on upstream PyPI)
ENV PIP_DEFAULT_TIMEOUT=60 PIP_RETRIES=8

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV PYTHONUNBUFFERED=1
EXPOSE 8000
