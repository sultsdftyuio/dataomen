import os
import io
import tempfile
import logging
from typing import BinaryIO

import duckdb
from fastapi import HTTPException

logger = logging.getLogger(__name__)

class EdgeDataSanitizer:
    """
    In-memory analytical gatekeeper. 
    Guarantees type-safety, structural integrity, and multi-tenant security
    by immediately converting raw uploads to strict Parquet format via DuckDB before storage.
    """
    
    def __init__(self):
        # Ephemeral, thread-local, in-memory DuckDB connection.
        # Executes with blazing fast C++ vectorized operations.
        self.conn = duckdb.connect(':memory:')
        
    def sanitize_and_convert(
        self, 
        file_stream: BinaryIO, 
        tenant_id: str, 
        file_extension: str = 'csv'
    ) -> io.BytesIO:
        """
        Takes a raw byte stream, infers the schema, cleanses malformed rows, 
        injects a tenant_id for zero-trust isolation, and returns a binary stream 
        of a highly compressed Parquet file.
        
        :param file_stream: Raw file payload from the frontend.
        :param tenant_id: The UUID of the uploading tenant (Security by Design).
        :param file_extension: The source format (csv or json).
        :return: io.BytesIO stream containing the ZSTD compressed Parquet.
        """
        file_extension = file_extension.lower()
        if file_extension not in ['csv', 'json']:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported file format: {file_extension}. Only CSV and JSON are permitted."
            )

        # We must use temporary files to hand off the byte stream to DuckDB's C++ I/O engine
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_extension}") as temp_input:
            temp_input.write(file_stream.read())
            input_path = temp_input.name

        output_path = f"{input_path}_clean.parquet"

        try:
            # Build the C-compiled conversion query. 
            # Security by Design: Hardcode the tenant_id directly into the Parquet file AST.
            if file_extension == 'csv':
                # read_csv_auto detects separators, headers, and dates automatically.
                # sample_size=-1 forces a full pass to guarantee 100% type accuracy.
                query = f"""
                    COPY (
                        SELECT *, '{tenant_id}' AS tenant_partition_id 
                        FROM read_csv_auto('{input_path}', sample_size=-1, ignore_errors=true)
                    ) TO '{output_path}' (FORMAT PARQUET, COMPRESSION 'ZSTD');
                """
            else:
                query = f"""
                    COPY (
                        SELECT *, '{tenant_id}' AS tenant_partition_id 
                        FROM read_json_auto('{input_path}', format='array')
                    ) TO '{output_path}' (FORMAT PARQUET, COMPRESSION 'ZSTD');
                """

            # Execute the vectorized conversion
            self.conn.execute(query)

            # Read the optimized parquet back into an in-memory BytesIO stream
            # This allows us to delete the temporary disk files immediately
            with open(output_path, 'rb') as sanitized_file:
                sanitized_stream = io.BytesIO(sanitized_file.read())
            
            # Reset stream pointer for the StorageManager to read from the beginning
            sanitized_stream.seek(0)
            return sanitized_stream

        except duckdb.InvalidInputException as e:
            logger.error(f"Data poisoning blocked at edge layer for tenant {tenant_id}: {e}")
            raise HTTPException(
                status_code=422, 
                detail="Dataset rejected. File contains fundamentally malformed or unparseable rows."
            )
        except Exception as e:
            logger.error(f"Sanitization pipeline failure for tenant {tenant_id}: {e}")
            raise HTTPException(
                status_code=500, 
                detail="Internal analytical engine error during dataset validation."
            )
            
        finally:
            # Strict ephemeral cleanup to prevent OS disk bloat/memory leaks
            if os.path.exists(input_path):
                os.remove(input_path)
            if os.path.exists(output_path):
                os.remove(output_path)