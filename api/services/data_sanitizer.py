import logging
import pandas as pd
from pathlib import Path

logger = logging.getLogger(__name__)

class DataSanitizer:
    """
    Deterministically cleans raw CSV data to prepare it for 
    analytical Parquet storage and DuckDB querying.
    """

    def __init__(self, file_path: Path | str):
        self.file_path = Path(file_path)
        if not self.file_path.exists():
            raise FileNotFoundError(f"Cannot sanitize. File not found at {self.file_path}")

    def clean(self) -> pd.DataFrame:
        """
        Executes the master cleaning pipeline.
        Returns a sanitized Pandas DataFrame ready for Parquet conversion.
        """
        logger.info(f"Starting sanitization for {self.file_path.name}")
        
        # Load CSV (Using low_memory=False to let Pandas aggressively infer dtypes)
        df = pd.read_csv(self.file_path, low_memory=False)

        df = self._standardize_columns(df)
        df = self._drop_nulls(df)
        df = self._enforce_iso_dates(df)

        logger.info(f"Sanitization complete. Final shape: {df.shape}")
        return df

    def _standardize_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Forces column names to lowercase, strips trailing spaces, 
        and replaces internal spaces with underscores.
        """
        df.columns = (
            df.columns
            .str.strip()
            .str.lower()
            .str.replace(r'\s+', '_', regex=True)
            .str.replace(r'[^\w]', '', regex=True) # Strip special characters
        )
        return df

    def _drop_nulls(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Strict Phase 1 Rule: Drop rows with missing values to ensure 
        deterministic querying in DuckDB later.
        """
        initial_rows = len(df)
        df = df.dropna()
        dropped_rows = initial_rows - len(df)
        
        if dropped_rows > 0:
            logger.warning(f"Dropped {dropped_rows} rows containing null values.")
            
        return df

    def _enforce_iso_dates(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Heuristically detects date columns and forces them into ISO 8601 string format.
        """
        for col in df.columns:
            # We check if the column datatype is object (string) to avoid converting 
            # purely numeric IDs or floats into dates unexpectedly.
            if df[col].dtype == 'object':
                try:
                    # Attempt to convert to datetime. 
                    # errors='ignore' ensures non-date columns remain untouched.
                    parsed_dates = pd.to_datetime(df[col], errors='ignore')
                    
                    # If conversion succeeded (dtype changed to datetime64)
                    if pd.api.types.is_datetime64_any_dtype(parsed_dates):
                        # Force to ISO 8601 string format (YYYY-MM-DDTHH:MM:SS)
                        df[col] = parsed_dates.dt.strftime('%Y-%m-%dT%H:%M:%S')
                        logger.info(f"Converted column '{col}' to ISO 8601 dates.")
                except Exception as e:
                    logger.debug(f"Skipped date conversion for column '{col}': {e}")
                    
        return df