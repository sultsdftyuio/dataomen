# api/services/dataset_service.py

def process_file_background(self, dataset_id: uuid.UUID, file_path: Path):
    """
    The master Phase 1 pipeline: Clean -> Compress -> Upload -> Validate -> Ready.
    """
    # Use a fresh context manager for the DB session inside background tasks
    from api.database import SessionLocal 
    db = SessionLocal()
    
    try:
        dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if not dataset: return

        dataset.status = DatasetStatus.PROCESSING
        db.commit()

        # 1. Clean (Pandas)
        from api.services.data_sanitizer import DataSanitizer
        sanitizer = DataSanitizer(file_path)
        clean_df = sanitizer.clean()

        # 2. Upload (Parquet to S3/R2)
        from api.services.storage_manager import S3StorageManager
        storage = S3StorageManager()
        s3_uri = storage.upload_dataframe(clean_df, dataset.user_id, dataset.id)

        # 3. Validate (DuckDB)
        from api.services.duckdb_validator import DuckDBValidator
        validator = DuckDBValidator()
        row_count = validator.validate_and_count(s3_uri)

        # 4. Finalize Metadata
        dataset.storage_uri = s3_uri
        dataset.row_count = row_count
        dataset.status = DatasetStatus.READY
        db.commit()
        
    except Exception as e:
        db.rollback()
        dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if dataset:
            dataset.status = DatasetStatus.FAILED
            db.commit()
        print(f"❌ Phase 1 Pipeline Failed: {e}")
    finally:
        db.close()