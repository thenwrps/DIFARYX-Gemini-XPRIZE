import logging
from fastapi import APIRouter, status, Response
from api.db.engine import engine, verify_database_readiness

logger = logging.getLogger("difaryx.routes.health")
router = APIRouter(prefix="/health", tags=["Health Checks"])


@router.get("/live", status_code=status.HTTP_200_OK)
async def liveness_check():
    """Liveness check: process is alive. Does not query database."""
    return {"status": "alive"}


@router.get("/ready")
async def readiness_check(response: Response):
    """Readiness check: validates database connectivity, RLS role isolation, and Alembic revision 0009."""
    try:
        await verify_database_readiness(engine)
        return {"status": "ready"}
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "unavailable", "detail": "Database readiness checks failed"}
