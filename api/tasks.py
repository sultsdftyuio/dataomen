"""
Main Tasks Application
Location: api/tasks.py
"""

# Import cleanly from the emails package interface
from api.emails import send_recovery_email, RecoverySendRecord

def trigger_password_reset(user_email: str, token: str):
    """
    Example function showing how to trigger the email actor.
    """
    # 1. Build the payload
    record_data = {
        "email": user_email,
        "recovery_token": token,
        # ... add any other fields required by your RecoverySendRecord model
    }
    
    # 2. Send the job to Dramatiq's background queue
    send_recovery_email.send(record_data)
    
    return {"status": "Recovery email queued"}