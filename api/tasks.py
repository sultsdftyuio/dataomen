"""
Main Tasks Application
Location: api/tasks.py
"""

# Import cleanly from the emails package interface
from api.emails import RecoverySendRecord, get_supabase_client, send_recovery_email
from api.worker.identify import process_identify_payload

def trigger_password_reset(_user_email: str, _token: str):
    """
    Legacy placeholder retained for import compatibility.
    Recovery email actors require tenant_id, send_id, and dispatch_token; password
    reset mail should be implemented as a separate transactional email flow.
    """
    raise NotImplementedError("Password reset email is not handled by the recovery automation actor.")
