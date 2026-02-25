# api/database.py

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator
from dotenv import load_dotenv

# Force Python to read your .env file
load_dotenv()

# We set the default directly to 'postgres' so it matches your Docker container perfectly
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://postgres:password@localhost:5432/dataomen"
)

# Create the SQLAlchemy Engine
engine = create_engine(SQLALCHEMY_DATABASE_URL)

# Create a local session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db() -> Generator[Session, None, None]:
    """Dependency to yield a database session for our API routes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()