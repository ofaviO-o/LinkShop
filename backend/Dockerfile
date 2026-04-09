FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /workspace

COPY backend/requirements.txt /workspace/backend/requirements.txt

RUN pip install --upgrade pip \
    && pip install -r /workspace/backend/requirements.txt

COPY backend /workspace/backend

RUN chmod +x /workspace/backend/docker-entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/workspace/backend/docker-entrypoint.sh"]
CMD ["python", "-m", "uvicorn", "app.main:app", "--app-dir", "backend"]
