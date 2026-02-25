import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# 1. Fetch the Database URL from environment variables. 
# It expects a standard PostgreSQL connection string.
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://postgres:postgres@localhost:5432/dataomen"
)

# 2. Create the strict SQLAlchemy Engine
engine = create_engine(
    DATABASE_URL,
    # Pool pre_ping verifies the connection is still alive before executing
    pool_pre_ping=True, 
    # Adjust pool size according to your deployment scale
    pool_size=10,
    max_overflow=20
)

# 3. Create the strictly-typed session factory
SessionLocal = sessionmaker(
    autocommit=False, 
    autoflush=False, 
    bind=engine
)

def get_db():
    """
    Dependency Injection for FastAPI.
    Yields a pure database session and automatically closes it after the request.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """
    Orchestrator method to initialize the database natively.
    Called during app startup (e.g., in FastAPI lifecycle events).
    """
    # Important: Import models here to avoid circular dependencies
    from models import Base
    
    with engine.connect() as conn:
        # Crucial: Enable the pgvector extension for Postgres natively
        # This allows cosine similarity math directly in SQL
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
    
    # Safely create all tables that do not exist yet
    Base.metadata.create_all(bind=engine)