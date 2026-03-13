# api/database.py

import os
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError

# Configure logging for backend observability
logger = logging.getLogger(__name__)

# 1. Fetch the Database URL from environment variables.
# For SaaS on Vercel/Render, ensure this points to a Connection Pooler (like Supabase Transaction Pooler)
# rather than the direct database URL to prevent connection exhaustion.
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://postgres:postgres@localhost:5432/dataomen"
)

# 2. SaaS-Optimized SQLAlchemy Engine
engine = create_engine(
    DATABASE_URL,
    # Verifies the connection is still alive before executing (Crucial for PaaS/Serverless)
    pool_pre_ping=True, 
    # Dynamically scale pool based on environment variables for flexible deployments
    pool_size=int(os.getenv("DB_POOL_SIZE", 10)),
    max_overflow=int(os.getenv("DB_MAX_OVERFLOW", 20)),
    # Recycle connections after 1 hour to prevent stale connections from firewalls/load balancers
    pool_recycle=3600, 
    connect_args={
        # SaaS Protection: 
        # - statement_timeout=30000 (30 seconds): Prevents 'noisy neighbors' from locking up the DB.
        # - application_name: Helps trace queries in Supabase/PgBouncer dashboards.
        "options": "-c statement_timeout=30000 -c application_name=dataomen_api"
    }
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
    Yields a pure database session, ensures transaction rollback on application errors,
    and guarantees the connection is returned to the pool to prevent leaks.
    """
    db = SessionLocal()
    try:
        yield db
    except SQLAlchemyError as e:
        logger.error(f"Database transaction error: {e}")
        db.rollback()
        raise
    finally:
        db.close()

def init_db():
    """
    Orchestrator method to initialize the database natively.
    Called during app startup (e.g., in FastAPI lifecycle events).
    """
    # Important: Import models here to avoid circular dependencies
    from models import Base
    
    try:
        with engine.connect() as conn:
            # Crucial: Enable the pgvector extension for Postgres natively
            # This allows cosine similarity math directly in SQL for AI workloads
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.commit()
            logger.info("Successfully ensured pgvector extension is active.")
        
        # Safely create all tables that do not exist yet
        Base.metadata.create_all(bind=engine)
        logger.info("Successfully synchronized database schema.")
        
    except Exception as e:
        logger.critical(f"Failed to initialize database schema: {e}")
        raise