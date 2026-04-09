#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS_ON_STARTUP:-false}" = "true" ]; then
  alembic -c backend/alembic.ini upgrade head
fi

if [ "$#" -eq 0 ] || [ "$1" = "python" -a "$2" = "-m" -a "$3" = "uvicorn" ]; then
  HOST="${APP_HOST:-0.0.0.0}"
  PORT="${PORT:-${APP_PORT:-8000}}"
  WORKERS="${WEB_CONCURRENCY:-1}"
  export APP_PORT="$PORT"

  exec python -m uvicorn app.main:app \
    --app-dir backend \
    --host "$HOST" \
    --port "$PORT" \
    --workers "$WORKERS"
fi

exec "$@"
