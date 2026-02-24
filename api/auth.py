import os
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
# from database import get_db
from models import User

# Standard FastAPI utility to extract the Bearer token from the header
security = HTTPBearer()

# Your Supabase JWT Secret (Found in Supabase Dashboard -> Project Settings -> API)
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    # db: Session = Depends(get_db)
) -> User:
    """
    FastAPI Dependency to verify the Supabase JWT and extract the user.
    Inject this into any route that needs tenant isolation.
    """
    token = credentials.credentials

    try:
        # Decode the token using your Supabase secret.
        # Supabase uses the "aud": "authenticated" claim for logged-in users.
        payload = jwt.decode(
            token, 
            SUPABASE_JWT_SECRET, 
            algorithms=["HS256"], 
            audience="authenticated"
        )
        
        # Extract the Supabase user UUID
        user_id = payload.get("sub")
        if user_id is None:
            raise ValueError("No subject in token")

        # Mocking DB lookup for architecture demonstration:
        # user = db.query(User).filter(User.id == user_id).first()
        # if not user:
        #     raise HTTPException(status_code=404, detail="User not found in public schema")
        
        # return user

        # Returning a mock user for now based on our Step 1 Model
        return User(id=user_id, email=payload.get("email"))

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")