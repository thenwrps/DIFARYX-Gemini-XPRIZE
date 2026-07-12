import logging
import sqlalchemy as sa
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from api.db.engine import engine

logger = logging.getLogger("difaryx.db.uow")

# Create sessionmaker
async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)


class UnitOfWork:
    """Manages transactional boundaries and sets RLS context for database operations."""

    def __init__(self, organization_id: sa.UUID, user_id: sa.UUID):
        if not organization_id:
            raise ValueError("organization_id is required to initialize UnitOfWork context")
        if not user_id:
            raise ValueError("user_id is required to initialize UnitOfWork context")

        self.organization_id = organization_id
        self.user_id = user_id
        self.session: AsyncSession = None

    async def __aenter__(self) -> AsyncSession:
        # 1. Open a new session
        self.session = async_session_factory()

        # 2. Begin transaction
        await self.session.begin()

        # 3. Immediately set the transaction-local RLS contexts
        # Convert UUID to string representation
        org_str = str(self.organization_id)
        user_str = str(self.user_id)

        await self.session.execute(
            sa.text("SELECT set_config('app.organization_id', :org_id, true)"),
            {"org_id": org_str}
        )
        await self.session.execute(
            sa.text("SELECT set_config('app.user_id', :user_id, true)"),
            {"user_id": user_str}
        )

        return self.session

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        import asyncio
        if self.session:
            try:
                if exc_type is not None:
                    # Roll back transaction on exception
                    logger.warning(f"Exception encountered inside UnitOfWork, rolling back transaction: {exc_val}")
                    await asyncio.shield(self.session.rollback())
                else:
                    # Commit transaction if no exception occurred
                    await self.session.commit()
            except Exception as e:
                logger.error(f"Error terminating transaction: {e}")
                try:
                    await asyncio.shield(self.session.rollback())
                except Exception:
                    pass
                raise
            finally:
                # Close the session to return connection back to pool
                try:
                    await asyncio.shield(self.session.close())
                except Exception:
                    pass
                self.session = None
