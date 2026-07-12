import logging
from typing import Protocol, Optional
import firebase_admin
from firebase_admin import auth
from api.auth.models import VerifiedExternalIdentity

logger = logging.getLogger("difaryx.auth.verifier")


class AuthTokenVerifier(Protocol):
    """Protocol defining token verification behaviors."""
    async def verify(self, token: str) -> VerifiedExternalIdentity:
        """Decodes and validates JWT claims, returning a verified identity."""
        ...


class FirebaseTokenVerifier:
    """Production token verifier utilizing the official Firebase Admin SDK."""

    def __init__(self, project_id: Optional[str] = None):
        self.project_id = project_id
        try:
            if not firebase_admin._apps:
                # Initialize Firebase Admin using default credentials (ADC)
                firebase_admin.initialize_app()
                logger.info("Firebase Admin SDK successfully initialized.")
        except Exception as e:
            logger.error(f"[-] Failed to initialize Firebase Admin SDK: {e}")
            raise

    async def verify(self, token: str) -> VerifiedExternalIdentity:
        try:
            # verify_id_token performs signature, expiration, issuer, and audience checks
            decoded_claims = auth.verify_id_token(token, check_revoked=True)
            subject = decoded_claims.get("uid")
            email = decoded_claims.get("email")

            if not subject:
                raise ValueError("Token missing subject (uid) claim")

            return VerifiedExternalIdentity(
                provider="firebase",
                subject=subject,
                email=email
            )
        except Exception as e:
            logger.warning(f"Firebase token verification failed: {e}")
            raise ValueError(f"Invalid authentication token: {e}")


class TestTokenVerifier:
    """Mock verifier used only for testing and development scopes."""

    def __init__(self, app_env: str):
        if app_env not in ("test", "development"):
            raise RuntimeError(f"Security Violation: TestTokenVerifier instantiated under forbidden environment: '{app_env}'")
        logger.warning(f"Active Mock Authenticator: TestTokenVerifier running in environment '{app_env}'")

    async def verify(self, token: str) -> VerifiedExternalIdentity:
        # Expected mock token format: "mock:provider_name|provider_subject|email"
        if not token.startswith("mock:"):
            raise ValueError("Invalid mock token format (must start with 'mock:')")

        payload = token[5:]
        parts = payload.split("|")
        if len(parts) < 2:
            raise ValueError("Malformed mock token payload")

        provider = parts[0].strip()
        subject = parts[1].strip()
        email = parts[2].strip() if len(parts) > 2 else None

        return VerifiedExternalIdentity(
            provider=provider,
            subject=subject,
            email=email
        )


def get_token_verifier(app_env: str, provider: str, project_id: Optional[str] = None) -> AuthTokenVerifier:
    """Token verifier factory with strict security environment guards."""
    if provider == "test":
        if app_env in ("production", "staging"):
            raise RuntimeError(f"Security Violation: Test authentication provider is prohibited in environment '{app_env}'.")
        return TestTokenVerifier(app_env)
    elif provider == "firebase":
        return FirebaseTokenVerifier(project_id)
    else:
        raise ValueError(f"Unsupported authentication provider: '{provider}'")
