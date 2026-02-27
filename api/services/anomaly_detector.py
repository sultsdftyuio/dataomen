import pandas as pd
import numpy as np
from typing import List, Dict, Any, Union

class AnomalyDetector:
    """
    Phase 4: The Math Engine
    Stateless functional methods for detecting statistically significant deviations.
    
    Methodology Applied:
    - Vectorization over Loops: 100% Pandas/NumPy C-extension execution.
    - Mathematical Precision: Utilizes Exponential Moving Average (EMA) and rolling 
      volatility to respect local trends and seasonality, preventing false positives 
      on naturally trending datasets.
    """
    
    @staticmethod
    def detect_outliers(
        data: List[Union[int, float]], 
        threshold: float = 2.0, 
        span: int = 14
    ) -> Dict[str, Any]:
        """
        Detect anomalies using a Dynamic Z-Score based on EMA and Rolling Variance.
        
        Args:
            data (List[float]): Raw chronological data points.
            threshold (float): Z-score sigma limit (default 2.0). 
                               Values > 2.0 are typically statistically significant.
            span (int): The lookback window for the EMA and rolling std (default 14).
            
        Returns:
            Dict[str, Any]: A dictionary containing global baselines and detected anomalies.
        """
        # Edge Case: Insufficient data to calculate variance
        if not data or len(data) < 2:
            return {
                "global_mean": 0.0,
                "global_std": 0.0,
                "anomalies": [], 
                "indices": [], 
                "count": 0
            }

        # Cast to vectorized Pandas Series
        series = pd.Series(data, dtype=float)
        
        # Calculate global metrics for payload metadata
        global_mean = series.mean()
        global_std = series.std()

        # Edge Case: Flatline data (Zero variance)
        if global_std == 0:
            return {
                "global_mean": float(global_mean),
                "global_std": float(global_std),
                "anomalies": [], 
                "indices": [], 
                "count": 0
            }

        # 1. Dynamic Baseline: Exponential Moving Average (EMA)
        # Tracks local trends so natural growth isn't flagged as anomalous
        ema = series.ewm(span=span, adjust=False).mean()

        # 2. Local Volatility: Rolling Standard Deviation
        # Adapts the sensitivity based on current market/data turbulence
        rolling_std = series.rolling(window=span, min_periods=1).std()
        
        # Fill early sequence NaNs (where window is too small) with the global std
        rolling_std = rolling_std.fillna(global_std)
        
        # Prevent division-by-zero errors in highly stable data pockets
        rolling_std = rolling_std.replace(0, 1e-9)

        # 3. Dynamic Vectorized Z-Score Calculation
        # Z = (x - local_mean) / local_std
        dynamic_z_scores = (series - ema) / rolling_std
        
        # 4. Boolean Indexing for Outliers (Vectorized Filter)
        anomalies = series[abs(dynamic_z_scores) > threshold]

        return {
            "global_mean": float(global_mean),
            "global_std": float(global_std),
            "anomalies": anomalies.tolist(),
            "indices": anomalies.index.tolist(),
            "count": len(anomalies)
        }