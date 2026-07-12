import uuid
import logging
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from api.db.context import correlation_id_ctx

logger = logging.getLogger("difaryx.middleware.request_id")


class RequestIdMiddleware(BaseHTTPMiddleware):
    """FastAPI Middleware to track and propagate correlation IDs across incoming requests."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Extract existing correlation ID or generate a new UUID
        corr_id = request.headers.get("X-Correlation-ID") or request.headers.get("X-Request-ID")
        if not corr_id:
            corr_id = str(uuid.uuid4())

        # Set ContextVar
        token = correlation_id_ctx.set(corr_id)

        try:
            logger.info(f"Incoming request: {request.method} {request.url.path} (Correlation ID: {corr_id})")
            response: Response = await call_next(request)
            # Propagate back in response headers
            response.headers["X-Correlation-ID"] = corr_id
            return response
        finally:
            # Reset ContextVar
            correlation_id_ctx.reset(token)
