FROM python:3.11-slim

# Tesseract + Persian language pack (for OCR of scanned PDFs / images).
# apt retries make the slow deb.debian.org connection from Iran more resilient.
RUN printf 'Acquire::Retries "8";\nAcquire::http::Timeout "40";\n' > /etc/apt/apt.conf.d/80retries \
    && apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-fas \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# pip: be patient/retry on a slow connection
ENV PIP_DEFAULT_TIMEOUT=60 PIP_RETRIES=8

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV PYTHONUNBUFFERED=1
EXPOSE 8000
