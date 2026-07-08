FROM python:3.11-slim

WORKDIR /app

# Install Python runtime dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend engine packages and bundled SQLite reference DB
COPY api/ ./api/
COPY xrd_engine/ ./xrd_engine/
COPY xps_engine/ ./xps_engine/
COPY ftir_engine/ ./ftir_engine/
COPY raman_engine/ ./raman_engine/
COPY data/ ./data/

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV XRD_PORT=7860
ENV XRD_HOST=0.0.0.0

EXPOSE 7860

CMD ["uvicorn", "api.gateway:app", "--host", "0.0.0.0", "--port", "7860"]
