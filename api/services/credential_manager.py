# api/services/credential_manager.py

import os
import json
import logging
import time
from typing import Dict, Any, Optional, Callable, Awaitable
from cryptography.fernet import Fernet
from pydantic import BaseModel, Field, ValidationError

logger = logging.getLogger(__name__)

class CredentialPayload(BaseModel):
    """
    Strict typing for credential payloads.
    Supports both OAuth 2.0 (Shopify/Salesforce) and Direct DB connections (Snowflake).
    """
    auth_type: str = Field(..., description="'oauth' or 'connection_string'")
    credentials: Dict[str, Any] = Field(..., description="The actual secrets (access_token, refresh_token, or db_password)")
    expires_at: Optional[float] = Field(None, description="Unix timestamp for OAuth token expiration. None for DBs.")

class CredentialManager:
    """
    Phase 1.2: Credential Vaulting & OAuth Governance.
    Centralized service for encrypting, decrypting, and rotating sensitive API keys.
    Ensures credentials are never stored in plaintext, strictly isolated by tenant_id,
    and automatically refreshes stale OAuth tokens.
    """
    
    def __init__(self, db_client: Any):
        """
        Dependency inject the database client (Supabase).
        Initializes the Fernet cipher suite using a master environment key.
        """
        self.db = db_client
        
        # In production, this master key MUST be injected via secure Env variables (Vercel/Render/Cloudflare)
        master_key = os.environ.get("ENCRYPTION_MASTER_KEY")
        if not master_key:
            logger.warning("No ENCRYPTION_MASTER_KEY found. Generating ephemeral key for development.")
            master_key = Fernet.generate_key().decode()
            
        self.cipher_suite = Fernet(master_key.encode())

    def _encrypt(self, payload: CredentialPayload) -> str:
        """Encrypts the validated Pydantic model into a secure URL-safe base64 string."""
        json_data = payload.model_dump_json()
        return self.cipher_suite.encrypt(json_data.encode()).decode()

    def _decrypt(self, encrypted_data: str) -> CredentialPayload:
        """Decrypts a secure string back into a validated Pydantic model."""
        decrypted_json = self.cipher_suite.decrypt(encrypted_data.encode()).decode()
        data_dict = json.loads(decrypted_json)
        return CredentialPayload(**data_dict)

    async def store_credentials(self, tenant_id: str, integration_name: str, payload: CredentialPayload) -> bool:
        """
        Encrypts and securely stores credentials.
        Enforces tenant isolation at the row level.
        """
        logger.info(f"Securing credentials for tenant {tenant_id} | integration: {integration_name}")
        encrypted_payload = self._encrypt(payload)
        
        try:
            # Upsert into a secure credentials table (leveraging Supabase Vault or RLS policies)
            self.db.table("integration_credentials").upsert({
                "tenant_id": tenant_id,
                "integration_name": integration_name,
                "encrypted_tokens": encrypted_payload,
                "updated_at": "now()"
            }).execute()
            
            return True
        except Exception as e:
            logger.error(f"Failed to store credentials for {tenant_id}/{integration_name}: {str(e)}")
            raise

    async def get_credentials(self, tenant_id: str, integration_name: str) -> Optional[CredentialPayload]:
        """
        Retrieves and decrypts the raw credential payload for a specific tenant.
        """
        try:
            response = self.db.table("integration_credentials") \
                .select("encrypted_tokens") \
                .eq("tenant_id", tenant_id) \
                .eq("integration_name", integration_name) \
                .execute()
                
            data = response.data
            if not data:
                return None
                
            encrypted_payload = data[0].get("encrypted_tokens")
            return self._decrypt(encrypted_payload)
            
        except Exception as e:
            logger.error(f"Failed to retrieve credentials for {tenant_id}/{integration_name}: {str(e)}")
            return None

    async def get_valid_oauth_credentials(
        self, 
        tenant_id: str, 
        integration_name: str, 
        refresh_callback: Callable[[Dict[str, Any]], Awaitable[CredentialPayload]]
    ) -> Optional[Dict[str, Any]]:
        """
        The Orchestration Layer for OAuth.
        Fetches credentials. If the token is expired, it dynamically invokes the provided 
        async refresh_callback (passed from the specific integration class), stores the 
        new tokens, and returns the fresh credentials.
        """
        payload = await self.get_credentials(tenant_id, integration_name)
        
        if not payload:
            return None
            
        if payload.auth_type != "oauth":
            # If it's a DB connection string, it doesn't expire in this context
            return payload.credentials
            
        # Check for expiration with a 5-minute safety buffer
        current_time = time.time()
        buffer_seconds = 300 
        
        if payload.expires_at and (current_time + buffer_seconds) >= payload.expires_at:
            logger.info(f"Token expired for {tenant_id}/{integration_name}. Executing refresh callback.")
            try:
                # Execute the connector-specific refresh logic
                new_payload: CredentialPayload = await refresh_callback(payload.credentials)
                
                # Persist the newly refreshed tokens
                await self.store_credentials(tenant_id, integration_name, new_payload)
                return new_payload.credentials
            except Exception as e:
                logger.error(f"OAuth refresh failed for {tenant_id}/{integration_name}: {str(e)}")
                raise
                
        return payload.credentials