import os
import secrets
import hashlib
import hmac
from datetime import datetime, timezone
from typing import Optional, Dict, Any


class ApiKeyVault:
    """
    Production-grade API key cryptography engine.

    Design goals:
    - One-time plaintext exposure
    - O(1) authentication via key_id
    - HMAC-based hashing (peppered)
    - Constant-time verification
    - UTC-aware timestamps
    - Cross-platform parity with Next.js/Node.js validation
    """

    PREFIX = "arcli_live"

    KEY_ID_BYTES = 8          # 64-bit identifier (16 hex chars)
    SECRET_BYTES = 32         # 256-bit secret (64 hex chars)

    HASH_ALGORITHM = hashlib.sha256

    @classmethod
    def _get_hash_secret(cls) -> bytes:
        """
        Retrieves the application secret used for HMAC hashing.

        This secret must be stable across deployments and stored
        in your secrets manager or environment variables. 
        Aligns with Node.js process.env.API_KEY_PEPPER.
        """
        secret = os.getenv("API_KEY_PEPPER") or os.getenv("API_KEY_HASH_SECRET")

        if not secret:
            raise RuntimeError(
                "API_KEY_PEPPER environment variable is not configured."
            )

        return secret.encode("utf-8")

    @classmethod
    def generate_key_pair(
        cls,
        *,
        name: str,
        tenant_id: str,
        expires_at: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Generates a new API key.

        Returns:
            {
                "plaintext_key": "arcli_live_<key_id>_<secret>",
                "masked_key": "arcli_live_<key_id>_...<last4>",
                "name": "...",
                "db_record": {...}
            }

        The plaintext key should only ever be shown once.
        """

        if not tenant_id or not tenant_id.strip():
            raise ValueError("tenant_id is required.")

        if not name or not name.strip():
            raise ValueError("name is required.")

        key_id = secrets.token_hex(cls.KEY_ID_BYTES)
        secret = secrets.token_hex(cls.SECRET_BYTES)

        plaintext_key = f"{cls.PREFIX}_{key_id}_{secret}"

        # SECURITY: We hash ONLY the secret portion to match the Next.js implementation
        key_hash = cls.hash_key(secret)

        masked_key = (
            f"{cls.PREFIX}_{key_id}_...{secret[-4:]}"
        )

        now = datetime.now(timezone.utc)

        return {
            "plaintext_key": plaintext_key,
            "masked_key": masked_key,
            "name": name.strip(),
            "db_record": {
                "tenant_id": tenant_id,
                "label": name.strip(),        # Aligns with DB schema
                "key_id": key_id,
                "key_hash": key_hash,
                "key_last4": secret[-4:],     # Aligns with DB schema
                "created_at": now.isoformat(),
                "revoked_at": None,           # Aligns with DB schema (replaces is_revoked)
                "last_used_at": None,
                # Note: 'created_by' should be injected by the router layer.
            },
        }

    @classmethod
    def hash_key(cls, secret: str) -> str:
        """
        Computes an HMAC-SHA256 digest of the API key secret.
        """
        return hmac.new(
            cls._get_hash_secret(),
            secret.encode("utf-8"),
            cls.HASH_ALGORITHM,
        ).hexdigest()

    @classmethod
    def extract_key_id(cls, plaintext_key: str) -> str:
        """
        Extracts the key_id from the plaintext key.

        Expected format:
            arcli_live_<key_id>_<secret>
        """

        try:
            prefix_full = f"{cls.PREFIX}_"
            if not plaintext_key.startswith(prefix_full):
                raise ValueError("Invalid key prefix.")

            body = plaintext_key[len(prefix_full):]
            parts = body.split("_")
            
            if len(parts) != 2:
                raise ValueError("Missing or invalid key/secret separator.")

            key_id, secret = parts

            # Validate lengths to match the Node.js parser expectations
            if not key_id or len(key_id) != cls.KEY_ID_BYTES * 2:
                raise ValueError("Invalid key_id length.")
                
            if not secret or len(secret) != cls.SECRET_BYTES * 2:
                raise ValueError("Invalid secret length.")

            return key_id

        except Exception as exc:
            raise ValueError("Invalid API key format.") from exc

    @classmethod
    def verify_key(
        cls,
        *,
        provided_key: str,
        stored_hash: str,
        is_revoked: bool = False,
        expires_at: Optional[datetime] = None,
    ) -> bool:
        """
        Verifies an incoming API key.

        Returns False if:
        - format is invalid
        - key is revoked
        - key is expired
        - hashes do not match
        """

        try:
            prefix_full = f"{cls.PREFIX}_"
            if not provided_key.startswith(prefix_full):
                return False
            
            body = provided_key[len(prefix_full):]
            parts = body.split("_")
            
            if len(parts) != 2:
                return False
                
            key_id, secret = parts
        except ValueError:
            return False

        if is_revoked:
            return False

        if (
            expires_at is not None
            and datetime.now(timezone.utc) >= expires_at
        ):
            return False

        # Hash only the secret for comparison
        expected_hash = cls.hash_key(secret)

        return hmac.compare_digest(
            expected_hash,
            stored_hash,
        )