import os

ALLOWED_EXTENSIONS = {".csv", ".txt", ".raw", ".xy", ".dat"}

ALLOWED_CONTENT_TYPES = {
    "text/csv",
    "text/plain",
    "application/octet-stream",
    "application/x-raw",
}

MAX_FILE_SIZE = int(os.getenv("DIFARYX_MAX_FILE_SIZE_BYTES", "268435456"))
