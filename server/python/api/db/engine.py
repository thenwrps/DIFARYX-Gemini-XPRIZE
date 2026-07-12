import logging
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine, AsyncEngine
from api.db.settings import settings

logger = logging.getLogger("difaryx.db.engine")

# Create async engine configured with psycopg3 driver
engine: AsyncEngine = create_async_engine(
    settings.get_database_url_str(),
    pool_size=settings.DATABASE_POOL_SIZE,
    max_overflow=settings.DATABASE_MAX_OVERFLOW,
    pool_pre_ping=True
)


async def verify_database_readiness(async_engine: AsyncEngine) -> None:
    """Performs strict database connectivity, role capabilities, and migration version validations."""
    logger.info("Initializing database startup and readiness verification checks...")
    try:
        async with async_engine.connect() as conn:
            # 1. Check database connectivity
            res = await conn.execute(sa.text("SELECT version()"))
            db_version = res.scalar()
            logger.info(f"Database reachable: {db_version}")

            # 2. Check current role capabilities
            role_res = await conn.execute(sa.text("""
                SELECT rolname, rolsuper, rolbypassrls
                FROM pg_catalog.pg_roles
                WHERE rolname = CURRENT_USER
            """))
            role_info = role_res.fetchone()
            if role_info:
                rolname, rolsuper, rolbypassrls = role_info
                logger.info(f"Connected as user: '{rolname}' (Superuser={rolsuper}, BypassRLS={rolbypassrls})")
                if rolsuper:
                    raise RuntimeError("Security Violation: API runtime connected using a database SUPERUSER role.")
                if rolbypassrls:
                    raise RuntimeError("Security Violation: API runtime connected using a role with BYPASSRLS privilege.")
            else:
                # If CURRENT_USER is not in pg_roles directly (e.g. group member), check roles table
                logger.info("CURRENT_USER role metadata not found directly in pg_roles. Checking session user privileges...")
                super_check = await conn.execute(sa.text("SELECT pg_is_superuser()"))
                if super_check.scalar():
                    raise RuntimeError("Security Violation: API runtime connected using a database SUPERUSER role.")

            # 3. Assert exact Alembic revision is exactly '0009'
            # Do not use numerical comparison; match string exactly
            try:
                version_res = await conn.execute(sa.text("SELECT version_num FROM public.alembic_version"))
                rows = version_res.fetchall()
                if not rows:
                    raise RuntimeError("alembic_version table is empty")
                if len(rows) > 1:
                    raise RuntimeError(f"Multiple migration heads found: {[r[0] for r in rows]}")
                active_revision = rows[0][0]
            except Exception as e:
                raise RuntimeError(f"Database Readiness Failure: alembic_version table is missing, empty, or unreadable: {e}")

            logger.info(f"Current Alembic revision verified: '{active_revision}'")
            if active_revision != "0009":
                raise RuntimeError(f"Database Migration Mismatch: expected revision '0009', got '{active_revision}'")

            # 4. Check function existence
            funcs_to_check = [
                ("identity", "resolve_external_identity"),
                ("governance", "append_audit_event")
            ]
            for schema, func in funcs_to_check:
                func_check = await conn.execute(sa.text("""
                    SELECT 1
                    FROM pg_catalog.pg_proc p
                    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = :schema AND p.proname = :func
                """), {"schema": schema, "func": func})
                if not func_check.fetchone():
                    raise RuntimeError(f"Database Readiness Failure: required function '{schema}.{func}' does not exist.")

            logger.info("[SUCCESS] All database runtime readiness checks successfully passed!")

    except Exception as e:
        logger.error(f"[-] Database readiness validation failed: {e}")
        raise
