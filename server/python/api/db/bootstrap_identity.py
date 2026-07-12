import logging
import sqlalchemy as sa
from typing import List, Dict, Any
from api.db.engine import engine

logger = logging.getLogger("difaryx.db.bootstrap_identity")


class BootstrapIdentityRepository:
    """Handles external identity resolution before RLS organization context is established."""

    @staticmethod
    async def resolve(provider_name: str, provider_subject: str) -> List[Dict[str, Any]]:
        """Invokes resolve_external_identity SECURITY DEFINER function under a short-lived connection."""
        # 1. Defense-in-depth: Trim and normalize parameters
        norm_provider = provider_name.strip().lower()
        norm_subject = provider_subject.strip()

        # Input validations matching database constraint lengths
        if not norm_provider or len(norm_provider) > 100:
            raise ValueError("Invalid provider_name format or length")
        if not norm_subject or len(norm_subject) > 512:
            raise ValueError("Invalid provider_subject format or length")

        try:
            async with engine.connect() as conn:
                res = await conn.execute(
                    sa.text("""
                        SELECT
                            organization_id,
                            organization_name,
                            user_id,
                            email,
                            user_display_name,
                            role
                        FROM identity.resolve_external_identity(:provider_name, :provider_subject)
                    """),
                    {"provider_name": norm_provider, "provider_subject": norm_subject}
                )
                mappings = [dict(row._mapping) for row in res.fetchall()]
                logger.info(f"Resolved external identity mappings count: {len(mappings)}")
                return mappings

        except Exception as e:
            logger.error(f"[-] Bootstrap identity resolution failed: {e}")
            raise
