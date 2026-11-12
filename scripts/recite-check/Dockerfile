FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    LAB=/app/lab RECITE_HARNESS=/app/harness/scripts/recite-eval OMP_NUM_THREADS=2
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Fails the build if the checker doesn't import.
RUN python -c "import engine"
CMD exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --log-level warning
