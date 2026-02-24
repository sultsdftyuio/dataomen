import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

# Use environment variables for security
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5432/dataomen")

# The engine handles the connection pool to PostgreSQL
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# Each request will get its own local session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that provides a database session to a route 
    and ensures it is closed after the request is finished.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()