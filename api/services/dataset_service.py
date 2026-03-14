import logging
from typing import Dict, Any
import duckdb
import polars as pl
from sqlalchemy.orm import Session

# Import your modern SQLAlchemy models
from models import Dataset

logger = logging.getLogger(__name__)

class DatasetService:
    """
    Phase 4+: Enterprise Data Profiling & Contextual RAG Orchestrator.
    
    Upgraded Engineering:
    - Semantic Grounding: Extracts actual data samples to prevent LLM hallucination.
    - Zero-Copy Polars: Bypasses Pandas entirely for memory-safe iteration.
    - Contextual Safety: Guaranteed DuckDB memory release via context managers.
    """

    @staticmethod
    def extract_schema_from_local_file(file_path: str) -> Dict[str, Any]:
        """
        Core Computation: Extracts table structure and semantic categorical samples 
        purely from a local temporary file or directly from S3/R2 paths.
        """
        # Security: Escape single quotes to prevent injection if the filename is messy
        safe_path = file_path.replace("'", "''")
        
        try:
            # Context Manager guarantees memory is released even if extraction crashes
            with duckdb.connect(':memory:') as con:
                
                # DuckDB dynamically uses the correct vectorized reader
                read_function = "read_parquet" if safe_path.endswith('.parquet') else "read_csv_auto"
                
                # 1. Base Schema Extraction
                query = f"DESCRIBE SELECT * FROM {read_function}('{safe_path}')"
                
                # ZERO-COPY: Direct Arrow to Polars handoff (No Pandas)
                schema_df = con.execute(query).pl()
                
                columns_meta = {}
                
                # 2. Iterate via fast Rust dictionaries
                for row in schema_df.to_dicts():
                    col_name = str(row['column_name'])
                    col_type = str(row['column_type'])
                    
                    col_info = {
                        "type": col_type,
                        "description": f"Auto-inferred field: {col_name}",
                        "samples": []
                    }
                    
                    # 3. Semantic Grounding (The Enterprise Edge)
                    # We sample 3-5 distinct values from categorical columns. 
                    # This tells the LLM exactly what strings to use in WHERE clauses.
                    if "VARCHAR" in col_type.upper() or "STRING" in col_type.upper():
                        try:
                            # Safely quote column names
                            safe_col = col_name.replace('"', '""')
                            sample_query = f"""
                                SELECT DISTINCT "{safe_col}" 
                                FROM {read_function}('{safe_path}') 
                                WHERE "{safe_col}" IS NOT NULL 
                                LIMIT 5
                            """
                            # Fetch directly to a Polars list
                            samples = con.execute(sample_query).pl().get_column(col_name).to_list()
                            col_info["samples"] = [str(s) for s in samples if s]
                        except Exception as e:
                            logger.debug(f"Could not extract semantic samples for {col_name}: {e}")
                    
                    # Map exactly to what the upgraded SemanticRouter expects
                    columns_meta[col_name] = col_info
                    
                return {"columns": columns_meta}
                
        except Exception as e:
            logger.error(f"Failed to extract schema locally from {file_path}: {str(e)}")
            # Return an empty schema block so the upstream pipeline doesn't crash
            return {"columns": {}}

    def process_and_save_schema(self, db: Session, dataset_id: str, tenant_id: str, local_file_path: str) -> None:
        """
        Orchestration: Reads the local optimized file, extracts the enhanced schema, 
        and patches the database record. 
        This is the bridge that makes the LLM's Contextual RAG instantly ready.
        """
        try:
            # 1. Fetch the strictly jailed dataset (Tenant Isolation)
            dataset = db.query(Dataset).filter(
                Dataset.id == dataset_id,
                Dataset.tenant_id == tenant_id
            ).first()
            
            if not dataset:
                logger.warning(f"Security/State mismatch: Attempted to process schema for missing dataset {dataset_id}")
                return
                
            # 2. Extract Schema & Samples Lightning Fast
            schema_data = self.extract_schema_from_local_file(local_file_path)
            
            # 3. Save it to the JSON Database Column
            if schema_data.get("columns"):
                dataset.schema_metadata = schema_data
                db.commit()
                logger.info(f"✅ Contextual RAG schema initialized and grounded for dataset: {dataset_id}")
            else:
                logger.warning(f"Schema extraction yielded empty columns for dataset: {dataset_id}")
                
        except Exception as e:
            db.rollback()
            logger.error(f"Error updating schema metadata for dataset {dataset_id}: {str(e)}")
            # Note: We intentionally do not raise an HTTP Exception here.
            # If schema extraction fails, we still want the dataset to be successfully uploaded.
            # The LLM will fall back to zero-shot guessing if schema_metadata is missing.

# Export Singleton instance for easy import and dependency injection
dataset_service = DatasetService()