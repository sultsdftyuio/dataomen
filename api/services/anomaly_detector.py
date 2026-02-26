import pandas as pd
import numpy as np
from typing import List, Dict, Any

class AnomalyDetector:
    """
    Phase 4: The Math Engine
    Stateless functional methods for detecting statistically significant deviations.
    """
    
    def __init__(self, variance_threshold: float = 0.20):
        # Default 20% variance threshold
        self.variance_threshold = variance_threshold

    def calculate_ema_baselines(self, df: pd.DataFrame, target_column: str, date_column: str, span: int = 30) -> pd.DataFrame:
        """
        Calculates the Exponential Moving Average (EMA) baseline using vectorized Pandas.
        Includes a day-of-week grouping to prevent weekend false alarms.
        """
        # Ensure date is datetime type
        df[date_column] = pd.to_datetime(df[date_column])
        df['day_of_week'] = df[date_column].dt.dayofweek
        
        # Sort chronologically
        df = df.sort_values(by=date_column).reset_index(drop=True)
        
        # Calculate standard EMA
        df['ema'] = df[target_column].ewm(span=span, adjust=False).mean()
        
        # Calculate day-of-week multiplier to account for seasonal dips (e.g., lower sales on Sunday)
        # We group by day_of_week and find the ratio of the actual target to the raw EMA
        df['ratio'] = df[target_column] / df['ema'].replace(0, np.nan) 
        dow_multipliers = df.groupby('day_of_week')['ratio'].mean().reset_index()
        dow_multipliers.rename(columns={'ratio': 'dow_multiplier'}, inplace=True)
        
        # Merge the multiplier back into the main dataframe
        df = df.merge(dow_multipliers, on='day_of_week', how='left')
        
        # Calculate expected baseline
        df['expected_baseline'] = df['ema'] * df['dow_multiplier']
        
        # Calculate Variance: (Current - Expected) / Expected
        df['variance'] = (df[target_column] - df['expected_baseline']) / df['expected_baseline'].replace(0, np.nan)
        
        return df

    def detect_anomalies(self, df: pd.DataFrame, target_column: str, date_column: str) -> List[Dict[str, Any]]:
        """
        Runs the math engine and filters for rows that breach the variance threshold.
        Returns a list of dictionaries representing the anomalous events.
        """
        processed_df = self.calculate_ema_baselines(df, target_column, date_column)
        
        # Vectorized threshold filtering
        # We only care about the most recent data points (e.g., yesterday's data processed at 2:00 AM)
        latest_date = processed_df[date_column].max()
        recent_data = processed_df[processed_df[date_column] == latest_date]
        
        anomalies = recent_data[
            (recent_data['variance'] > self.variance_threshold) | 
            (recent_data['variance'] < -self.variance_threshold)
        ]
        
        if anomalies.empty:
            return []
            
        return anomalies.to_dict(orient='records')