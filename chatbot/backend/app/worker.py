import logging

from redis import Redis
from rq import Queue, Worker

from .config import settings

logging.basicConfig(level=logging.INFO)

redis_conn = Redis.from_url(settings.REDIS_URL)
queue = Queue("ingestion", connection=redis_conn)


def enqueue_ingest(document_id: int):
    # Import path as string so the worker imports it in its own process.
    queue.enqueue("app.ingestion.ingest_document", document_id, job_timeout=3600)


if __name__ == "__main__":
    worker = Worker([queue], connection=redis_conn)
    worker.work(with_scheduler=True)
