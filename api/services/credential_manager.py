# api/services/credential_manager.py

import os
import json
import logging
from typing import Dict, Any, Optional
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

class CredentialManager:
    """
    Phase 1: OAuth & Token Governance
    Centralized service for encrypting and decrypting sensitive API keys and OAuth tokens.
    Ensures credentials are never stored in plaintext and are strictly isolated by tenant_id.
    """
    def __init__(self, db_client: Any):
        """
        Dependency inject the database client (Supabase).
        Initializes the Fernet cipher suite using a master environment key.
        """
        self.db = db_client
        
        # In production, this master key is injected via secure Env variables (e.g., Vercel/Render)
        master_key = os.environ.get("ENCRYPTION_MASTER_KEY")
        if not master_key:
            logger.warning("No ENCRYPTION_MASTER_KEY found. Generating ephemeral key for development.")
            # DO NOT use ephemeral keys in prod; tokens will be lost on server restart.
            master_key = Fernet.generate_key().decode()
            
        self.cipher_suite = Fernet(master_key.encode())

    def _encrypt(self, data: Dict[str, Any]) -> str:
        """Encrypts a dictionary into a secure URL-safe base64-encoded string."""
        json_data = json.dumps(data)
        return self.cipher_suite.encrypt(json_data.encode()).decode()

    def _decrypt(self, encrypted_data: str) -> Dict[str, Any]:
        """Decrypts a secure string back into a Python dictionary."""
        decrypted_json = self.cipher_suite.decrypt(encrypted_data.encode()).decode()
        return json.loads(decrypted_json)

    async def store_credentials(self, tenant_id: str, integration_id: str, credentials: Dict[str, Any]) -> bool:
        """
        Encrypts and stores credentials for a specific tenant and integration.
        Called right after a successful OAuth exchange.
        """
        logger.info(f"Securing credentials for tenant {tenant_id} | integration: {integration_id}")
        encrypted_payload = self._encrypt(credentials)
        
        try:
            # Upsert into a secure credentials table (simulating Supabase Vault)
            self.db.table("integration_credentials").upsert({
                "tenant_id": tenant_id,
                "integration_id": integration_id,
                "encrypted_tokens": encrypted_payload
            }).execute()
            
            return True
        except Exception as e:
            logger.error(f"Failed to store credentials for {tenant_id}: {str(e)}")
            raise

    async def get_credentials(self, tenant_id: str, integration_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves and decrypts credentials for a specific tenant.
        Called just-in-time by the SyncEngine right before fetching SaaS data.
        """
        try:
            response = self.db.table("integration_credentials") \
                .select("encrypted_tokens") \
                .eq("tenant_id", tenant_id) \
                .eq("integration_id", integration_id) \
                .execute()
                
            data = response.data
            if not data:
                return None
                
            encrypted_payload = data[0].get("encrypted_tokens")
            return self._decrypt(encrypted_payload)
            
        except Exception as e:
            logger.error(f"Failed to retrieve credentials for {tenant_id}: {str(e)}")
            return None