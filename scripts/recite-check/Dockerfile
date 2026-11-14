FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    LAB=/app/lab RECITE_HARNESS=/app/harness/scripts/recite-eval OMP_NUM_THREADS=1 THREADS=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Fails the build if the checker doesn't import, or a test fails (the protocol, and the live checker on the model).
RUN python -c "import engine, live" && python -m unittest discover -s tests && rm -rf tests
# Pings every 10 s: a phone gone without closing its socket is noticed within 20 s (the instance is then free).
CMD exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --log-level warning \
    --ws-ping-interval 10 --ws-ping-timeout 10
