# api/services/ab_testing.py
import polars as pl
import numpy as np
from scipy import stats
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

class ABTestingIntelligence:
    """
    Automated Vectorized A/B Testing returning plain-English diagnostic insights.
    """
    
    @staticmethod
    def analyze_experiment(
        df: pl.DataFrame, 
        metric_col: str, 
        group_col: str, 
        control_val: str, 
        treatment_val: str,
        alpha: float = 0.05
    ) -> Dict[str, Any]:
        """Conducts a Welch's t-test (assuming unequal variance for robustness)."""
        if metric_col not in df.columns or group_col not in df.columns:
            return {"error": f"Columns {metric_col} or {group_col} missing from dataset."}
            
        try:
            # Polars vectorized filtering & NumPy allocation
            control_data = df.filter(pl.col(group_col) == control_val)[metric_col].drop_nulls().to_numpy()
            treatment_data = df.filter(pl.col(group_col) == treatment_val)[metric_col].drop_nulls().to_numpy()
            
            if len(control_data) < 2 or len(treatment_data) < 2:
                return {"error": "Insufficient sample size for T-test analysis."}

            # Vectorized SciPy statistics
            t_stat, p_val = stats.ttest_ind(treatment_data, control_data, equal_var=False)
            
            mean_control = np.mean(control_data)
            mean_treat = np.mean(treatment_data)
            
            lift = ((mean_treat - mean_control) / mean_control) * 100 if mean_control != 0 else 0
            significant = bool(p_val < alpha)
            
            # Semantic insight generation
            significance_str = "statistically significant" if significant else "non-significant"
            direction_str = "increase" if lift > 0 else "decrease"
            
            insight = (
                f"The treatment group '{treatment_val}' resulted in a {significance_str} "
                f"{abs(lift):.2f}% {direction_str} in {metric_col} compared to the control group "
                f"'{control_val}'. (p-value: {p_val:.4f})"
            )
            
            return {
                "t_statistic": float(t_stat),
                "p_value": float(p_val),
                "lift_percentage": float(lift),
                "is_significant": significant,
                "control_mean": float(mean_control),
                "treatment_mean": float(mean_treat),
                "insight": insight
            }
            
        except Exception as e:
            logger.error(f"A/B Testing analysis failed: {str(e)}")
            return {"error": str(e)}

ab_tester = ABTestingIntelligence()