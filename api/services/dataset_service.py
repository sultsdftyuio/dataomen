# api/services/dataset_service.py
import logging
from typing import Dict, Any
import duckdb
from sqlalchemy.orm import Session

# Import your modern SQLAlchemy models
from models import Dataset

logger = logging.getLogger(__name__)

class DatasetService:
    """
    Orchestrates high-performance data profiling and schema extraction.
    Designed to feed strictly isolated context into the NL2SQL AI Pipeline.
    """

    @staticmethod
    def extract_schema_from_local_file(file_path: str) -> Dict[str, Any]:
        """
        Core Computation: Extracts table structure purely from a local temporary file.
        Uses DuckDB's DESCRIBE to read only the metadata headers of a Parquet/CSV file.
        This operates in milliseconds and avoids loading the full dataset into memory.
        """
        try:
            # Ephemeral, in-memory connection
            con = duckdb.connect(':memory:')
            
            # DuckDB dynamically uses the correct reader based on file extension
            read_function = "read_parquet" if file_path.endswith('.parquet') else "read_csv_auto"
            
            # DESCRIBE returns: column_name, column_type, null, key, default, extra
            query = f"DESCRIBE SELECT * FROM {read_function}('{file_path}')"
            
            # Vectorized execution into Pandas for quick iteration
            df = con.execute(query).df()
            
            columns = []
            for _, row in df.iterrows():
                columns.append({
                    "name": str(row['column_name']),
                    "type": str(row['column_type'])
                })
                
            return {"columns": columns}
            
        except Exception as e:
            logger.error(f"Failed to extract schema locally from {file_path}: {str(e)}")
            # Return an empty schema block so the caller doesn't break
            return {"columns": []}
            
        finally:
            if 'con' in locals():
                con.close()

    def process_and_save_schema(self, db: Session, dataset_id: str, tenant_id: str, local_file_path: str) -> None:
        """
        Orchestration: Reads the local optimized file, extracts the schema, 
        and patches the database record with the exact structure.
        This ensures the LLM's Contextual RAG is instantly ready.
        """
        try:
            # 1. Fetch the strictly jailed dataset
            dataset = db.query(Dataset).filter(
                Dataset.id == dataset_id,
                Dataset.tenant_id == tenant_id
            ).first()
            
            if not dataset:
                logger.warning(f"Attempted to process schema for missing dataset {dataset_id}")
                return
                
            # 2. Extract Schema Lightning Fast
            schema_data = self.extract_schema_from_local_file(local_file_path)
            
            # 3. Save it to the JSON Database Column
            if schema_data.get("columns"):
                dataset.schema_metadata = schema_data
                db.commit()
                logger.info(f"Contextual RAG schema initialized for dataset: {dataset_id}")
            else:
                logger.warning(f"Schema extraction yielded empty columns for dataset: {dataset_id}")
                
        except Exception as e:
            db.rollback()
            logger.error(f"Error updating schema metadata for dataset {dataset_id}: {str(e)}")
            # Note: We intentionally do not raise an HTTP Exception here.
            # If schema extraction fails, we still want the dataset to be successfully 
            # uploaded. The LLM will fall back to "guessing" the columns if schema_metadata is missing.

# Export Singleton instance for easy import and dependency injection
dataset_service = DatasetService()