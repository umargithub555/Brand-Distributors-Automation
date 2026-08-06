FROM python:3.12.12-slim

ENV PYTHONDONTWRITEBYTECODE=1     PYTHONUNBUFFERED=1     PIP_NO_CACHE_DIR=1     PYTHONPATH=/app

WORKDIR /app

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --upgrade pip     && pip install -r /tmp/requirements.txt

COPY backend ./backend

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
