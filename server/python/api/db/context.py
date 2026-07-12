from contextvars import ContextVar

# Correlation ID ContextVar for request tracking and logs
correlation_id_ctx: ContextVar[str] = ContextVar("correlation_id", default="")
