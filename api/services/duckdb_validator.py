import os
import duckdb
import logging

logger = logging.getLogger(__name__)

class DuckDBValidator:
    """
    Validates that a newly uploaded Parquet file in S3/R2 is correctly 
    formatted and readable by the DuckDB engine.
    """

    def __init__(self):
        # Create an ephemeral, in-memory DuckDB connection
        self.conn = duckdb.connect(database=':memory:')
        self._configure_s3_credentials()

    def _configure_s3_credentials(self):
        """
        Installs the httpfs extension and injects AWS/R2 credentials so 
        DuckDB can read directly from the object storage bucket.
        """
        try:
            # Install and load the extension required for S3/R2 reading
            self.conn.execute("INSTALL httpfs;")
            self.conn.execute("LOAD httpfs;")
            
            # Configure credentials (DuckDB syntax)
            self.conn.execute(f"SET s3_endpoint='{os.getenv('S3_ENDPOINT_URL', 's3.amazonaws.com').replace('https://', '')}';")
            self.conn.execute(f"SET s3_access_key_id='{os.getenv('S3_ACCESS_KEY')}';")
            self.conn.execute(f"SET s3_secret_access_key='{os.getenv('S3_SECRET_KEY')}';")
            self.conn.execute(f"SET s3_region='{os.getenv('S3_REGION', 'auto')}';")
            
            # Use path-style addressing if using Cloudflare R2 or MinIO
            self.conn.execute("SET s3_url_style='path';") 
        except Exception as e:
            logger.error(f"Failed to configure DuckDB S3 credentials: {e}")
            raise

    def validate_and_count(self, s3_uri: str) -> int:
        """
        Runs a quick validation query against the remote Parquet file.
        Returns the total row count if successful.
        """
        logger.info(f"Running DuckDB sanity check on {s3_uri}")
        
        try:
            # The read_parquet function streams metadata from S3 to get the count instantly
            query = f"SELECT COUNT(*) FROM read_parquet('{s3_uri}');"
            result = self.conn.execute(query).fetchone()
            
            row_count = result[0]
            logger.info(f"Validation successful. File contains {row_count} rows.")
            return row_count
            
        except Exception as e:
            logger.error(f"DuckDB failed to read Parquet file at {s3_uri}: {e}")
            raise Exception("Corrupt Parquet file or unreadable S3 URI.")
        finally:
            self.conn.close()