import os
from functools import lru_cache

import jwt
from fastapi import Header, HTTPException
from jwt import PyJWKClient


from demo_config import DEMO_MODE


def _issuer() -> str:
    return os.getenv("CLERK_ISSUER_URL", "").rstrip("/")


@lru_cache(maxsize=2)
def _jwks_client(issuer: str) -> PyJWKClient:
    return PyJWKClient(f"{issuer}/.well-known/jwks.json", cache_jwk_set=True, lifespan=300)


def require_clerk_user(authorization: str | None = Header(default=None)) -> dict:
    """Validate a Clerk session JWT and return its claims."""
    if DEMO_MODE and authorization == "Bearer demo-token-bengaluru":
        return {
            "sub": "demo_user_bengaluru",
            "email": "demo@pathrak.local",
            "name": "Demo User (Bengaluru)",
        }
    issuer = _issuer()
    if not issuer:
        raise HTTPException(status_code=503, detail="CLERK_ISSUER_URL is not configured on the API.")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="A signed-in Clerk session is required.")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        signing_key = _jwks_client(issuer).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=issuer,
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="The Clerk session has expired.") from exc
    except Exception as exc:
        raise HTTPException(status_code=401, detail="The Clerk session token is invalid.") from exc

    if not claims.get("sub"):
        raise HTTPException(status_code=401, detail="The Clerk session has no user identity.")
    return claims
