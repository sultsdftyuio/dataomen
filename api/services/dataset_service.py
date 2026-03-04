import duckdb
import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import NoResultFound

# Assuming a standard Pydantic schema for inputs and SQLAlchemy model for ORM
from pydantic import BaseModel

class QueryRequest(BaseModel):
    tenant_id: str
    dataset_id: str
    dimensions: List[str]
    metrics: List[str]

class DatasetService:
    """
    Hybrid Performance Service: 
    - SQLAlchemy for Metadata & Tenant Orchestration
    - DuckDB & Pandas for Vectorized Analytical Computation
    """

    def __init__(self, db_session: Session):
        self.db = db_session
        
        # Initialize an in-memory DuckDB connection. 
        # In a real setup with Cloudflare R2, you would load the httpfs extension here.
        self.duck = duckdb.connect(database=':memory:')
        # self.duck.execute("INSTALL httpfs; LOAD httpfs;")
        # self.duck.execute("SET s3_endpoint='<cloudflare_r2_endpoint>';")

    def _get_dataset_metadata(self, dataset_id: str, tenant_id: str) -> Dict[str, Any]:
        """
        Orchestration Layer: Uses SQLAlchemy to enforce tenant isolation 
        and fetch file routing data.
        """
        # NOTE: Replace `DatasetModel` with your actual SQLAlchemy model import
        # metadata = self.db.query(DatasetModel).filter_by(
        #     id=dataset_id, 
        #     tenant_id=tenant_id
        # ).first()
        #
        # if not metadata:
        #     raise ValueError("Dataset not found or access denied.")
        # return {"file_uri": metadata.file_uri}

        # Mocking the ORM return for demonstration
        return {
            "file_uri": f"s3://tenant-data-{tenant_id}/{dataset_id}.parquet"
        }

    def execute_analytical_query(self, request: QueryRequest) -> pd.DataFrame:
        """
        Compute Layer: Uses DuckDB to run high-speed analytics directly on Parquet files,
        falling back to Pandas for vectorized post-processing.
        """
        # 1. Orchestrate & Secure
        metadata = self._get_dataset_metadata(
            dataset_id=request.dataset_id, 
            tenant_id=request.tenant_id
        )
        file_uri = metadata["file_uri"]

        # 2. Query Generation (In-Process Analytics)
        # DuckDB will intelligently read ONLY the required columns from the Parquet file
        dims_str = ", ".join(request.dimensions) if request.dimensions else "1"
        metrics_str = ", ".join([f"SUM({m}) AS total_{m}" for m in request.metrics])
        
        query = f"""
            SELECT 
                {dims_str}, 
                {metrics_str}
            FROM read_parquet('{file_uri}')
            GROUP BY {dims_str}
            ORDER BY {request.dimensions[0] if request.dimensions else '1'} DESC
        """

        try:
            # Execute query and convert directly to a Pandas DataFrame in C++ memory space
            # (In a real scenario, you'd handle the case where the S3 file doesn't exist yet)
            # df = self.duck.execute(query).df()
            
            # MOCK DATAFRAME for demonstration so the code doesn't crash on dummy S3 paths
            df = pd.DataFrame({
                request.dimensions[0]: ['A', 'B', 'C'],
                f"total_{request.metrics[0]}": [100, 250, 50],
                f"total_{request.metrics[1]}": [80, 200, 45]
            })

            # 3. Vectorized Post-Processing (Mathematical Precision over Loops)
            # Example: Calculating a dynamic variance or ratio column across millions of rows instantly
            m1, m2 = f"total_{request.metrics[0]}", f"total_{request.metrics[1]}"
            if m1 in df.columns and m2 in df.columns:
                # Vectorized operation (No iterrows!)
                df['metric_ratio'] = np.where(df[m2] == 0, 0, df[m1] / df[m2])

            return df

        except Exception as e:
            # Log exact analytical failure for debugging
            raise RuntimeError(f"Analytical compute failed: {str(e)}")

    def close(self):
        """Clean up in-process analytical engine resources"""
        self.duck.close()