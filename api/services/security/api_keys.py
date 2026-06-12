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
    - HMAC-based hashing
    - Constant-time verification
    - UTC-aware timestamps
    """

    PREFIX = "sk_live_arc"

    KEY_ID_BYTES = 8          # 64-bit identifier
    SECRET_BYTES = 32         # 256-bit secret

    HASH_ALGORITHM = hashlib.sha256

    @classmethod
    def _get_hash_secret(cls) -> bytes:
        """
        Retrieves the application secret used for HMAC hashing.

        This secret must be stable across deployments and stored
        in your secrets manager or environment variables.
        """
        secret = os.getenv("API_KEY_HASH_SECRET")

        if not secret:
            raise RuntimeError(
                "API_KEY_HASH_SECRET environment variable is not configured."
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
                "plaintext_key": "...",
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

        key_hash = cls.hash_key(plaintext_key)

        masked_key = (
            f"{cls.PREFIX}_{key_id}_...{secret[-4:]}"
        )

        now = datetime.now(timezone.utc)

        return {
            "plaintext_key": plaintext_key,
            "db_record": {
                "tenant_id": tenant_id,
                "name": name.strip(),
                "key_id": key_id,
                "key_hash": key_hash,
                "masked_key": masked_key,
                "is_revoked": False,
                "created_at": now,
                "expires_at": expires_at,
                "revoked_at": None,
                "last_used_at": None,
            },
        }

    @classmethod
    def hash_key(cls, plaintext_key: str) -> str:
        """
        Computes an HMAC-SHA256 digest of the API key.
        """

        return hmac.new(
            cls._get_hash_secret(),
            plaintext_key.encode("utf-8"),
            cls.HASH_ALGORITHM,
        ).hexdigest()

    @classmethod
    def extract_key_id(cls, plaintext_key: str) -> str:
        """
        Extracts the key_id from the plaintext key.

        Expected format:

            sk_live_arc_<key_id>_<secret>
        """

        try:
            prefix, environment, product, key_id, secret = (
                plaintext_key.split("_", 4)
            )

            expected_prefix = (
                prefix == "sk"
                and environment == "live"
                and product == "arc"
            )

            if not expected_prefix:
                raise ValueError

            if not key_id:
                raise ValueError

            if not secret:
                raise ValueError

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
            cls.extract_key_id(provided_key)
        except ValueError:
            return False

        if is_revoked:
            return False

        if (
            expires_at is not None
            and datetime.now(timezone.utc) >= expires_at
        ):
            return False

        expected_hash = cls.hash_key(provided_key)

        return hmac.compare_digest(
            expected_hash,
            stored_hash,
        )