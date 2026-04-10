# api/services/ab_testing.py
import polars as pl
import numpy as np
from scipy import stats
from scipy.stats.mstats import winsorize
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List, Tuple, Literal
import logging

logger = logging.getLogger(__name__)

# --- Statistical Constants ---
SKEW_THRESHOLD = 2.0
KURTOSIS_THRESHOLD = 4.0  # Lowered from 7.0 for better sensitivity to heavy tails typical in SaaS
MIN_SAMPLE_SIZE = 50
VARIANCE_RATIO_THRESHOLD = 4.0

# --- Data Contracts (Runtime Enforced) ---
class ABTestDiagnostics(BaseModel):
    variance_control: float
    variance_treatment: float
    skewness_control: float
    skewness_treatment: float
    kurtosis_control: float
    kurtosis_treatment: float
    mde_warning: Optional[str] = None

class ABTestResult(BaseModel):
    test_used: str = Field(description="The statistical test dynamically selected based on data properties.")
    decision_path: List[str] = Field(description="The logical steps taken to select the statistical test.")
    
    t_statistic: Optional[float] = None
    p_value: Optional[float] = Field(description="Safely bounded [0, 1] p-value.")
    alpha_used: float = Field(description="Alpha after any multiple-testing corrections.")
    is_significant: bool
    power: Optional[float] = Field(description="[Diagnostic Only] Post-hoc statistical power estimate (1 - β). Consider MDE for strict planning.")
    
    # Standardized Taxonomy for Effect Sizes
    absolute_effect: Optional[float] = Field(description="Raw difference between treatment and control (e.g., mean/median/proportion diff).")
    relative_effect: Optional[float] = Field(description="Percentage change relative to control (Lift).")
    normalized_effect: Optional[float] = Field(description="Standardized effect size (Cohen's d, h, Rank-Biserial, or Odds Ratio).")
    effect_size_metric: str = Field(description="The name of the normalized effect size metric used.")
    effect_size_family: Literal["standardized", "ratio", "rank", "raw"] = Field(description="Family of effect size for downstream comparability.")
    
    confidence_interval: Optional[Tuple[float, float]] = None
    confidence_interval_metric: str = Field(description="What the CI represents (e.g., Diff of Means, Log-Odds, Bootstrap Median).")
    
    control_mean: Optional[float] = Field(description="Mean (or proportion) of control group.")
    treatment_mean: Optional[float] = Field(description="Mean (or proportion) of treatment group.")
    sample_sizes: Dict[str, int]
    diagnostics: ABTestDiagnostics
    insight: str
    warnings: List[str]
    error: Optional[str] = None

class ABTestingIntelligence:
    """
    Automated Vectorized A/B Testing Engine.
    
    Statistical Decision Tree:
    1. Binary Domain {0, 1} -> Proportion Z-Test (or Fisher's Exact + Log-Odds CI).
    2. Continuous, Skew > 2 OR Kurtosis > 4 -> Mann-Whitney U Test + Bootstrap CI.
    3. Continuous, Variance Ratio > 4 -> Welch's T-Test.
    4. Default -> Welch's T-Test (safer default than Student's).
    """

    @staticmethod
    def _is_binary(data: np.ndarray) -> bool:
        if data.size == 0:
            return False
        try:
            # Pre-normalize to handle string/int mix properly
            data_float = data.astype(float)
        except (ValueError, TypeError):
            return False
            
        unique_vals = np.unique(data_float[~np.isnan(data_float)])
        if len(unique_vals) > 2:
            return False
        return all(np.isclose(v, 0.0, atol=1e-8) or np.isclose(v, 1.0, atol=1e-8) for v in unique_vals)

    @staticmethod
    def _clean_nan(value: Any) -> Optional[float]:
        if value is None or isinstance(value, (list, tuple, np.ndarray, dict)):
            return None
        try:
            val_float = float(value)
            if np.isnan(val_float) or np.isinf(val_float):
                return None
            return val_float
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _compute_post_hoc_power(absolute_diff: float, se: float, alpha: float) -> float:
        """Approximates post-hoc power based on standard normal distribution."""
        if np.isnan(absolute_diff) or np.isnan(se) or se == 0:
            return np.nan
        z_effect = abs(absolute_diff) / se
        z_crit = stats.norm.ppf(1 - alpha / 2)
        power = stats.norm.cdf(z_effect - z_crit)
        return float(max(0.0, min(1.0, power)))

    @staticmethod
    def analyze_experiment(
        df: pl.DataFrame, 
        metric_col: str, 
        group_col: str, 
        control_val: str, 
        treatment_val: str,
        alpha: float = 0.05,
        num_tests: int = 1,
        winsorize_pct: float = 0.0
    ) -> Dict[str, Any]:
        """Conducts context-aware statistical testing with rigorous statistical contracts."""
        
        # 1. Structural Validation
        if metric_col not in df.columns or group_col not in df.columns:
            return {"error": f"Columns '{metric_col}' or '{group_col}' missing from dataset."}
            
        if not df.schema[metric_col].is_numeric():
            return {"error": f"Column '{metric_col}' must be numeric."}
            
        try:
            # 2. Optimized Extraction
            valid_df = df.select([group_col, metric_col]).filter(
                pl.col(metric_col).is_not_null() & pl.col(group_col).is_not_null()
            )
            
            control_data = valid_df.filter(pl.col(group_col) == control_val).select(metric_col).to_numpy().flatten()
            treatment_data = valid_df.filter(pl.col(group_col) == treatment_val).select(metric_col).to_numpy().flatten()
            
            # 3. Sample Size Handling
            if control_data.size == 0 or treatment_data.size == 0:
                return {"error": "Missing rows for control or treatment group."}
                
            n_control, n_treat = len(control_data), len(treatment_data)
            if n_control < 2 or n_treat < 2:
                return {"error": "Insufficient sample size (minimum 2 per group)."}

            if winsorize_pct > 0.0:
                control_data = np.asarray(winsorize(control_data, limits=[winsorize_pct]*2), dtype=np.float64)
                treatment_data = np.asarray(winsorize(treatment_data, limits=[winsorize_pct]*2), dtype=np.float64)

            mean_control, mean_treat = np.mean(control_data), np.mean(treatment_data)
            median_control, median_treat = np.median(control_data), np.median(treatment_data)
            var_control, var_treat = np.var(control_data, ddof=1), np.var(treatment_data, ddof=1)
            
            skew_control = float(stats.skew(control_data)) if n_control > 2 else 0.0
            skew_treat = float(stats.skew(treatment_data)) if n_treat > 2 else 0.0
            kurt_control = float(stats.kurtosis(control_data)) if n_control > 3 else 0.0
            kurt_treat = float(stats.kurtosis(treatment_data)) if n_treat > 3 else 0.0
            
            warnings = []
            if var_control == 0 and var_treat == 0:
                return {"error": "Both groups have zero variance; cannot perform test."}
                
            alpha_adj = alpha / max(1, num_tests)
            if num_tests > 1:
                warnings.append(f"Applied Bonferroni correction for {num_tests} comparisons (α_adj={alpha_adj:.4f}).")

            # 4. Inferential Branching & Initialization
            is_binary = ABTestingIntelligence._is_binary(control_data) and ABTestingIntelligence._is_binary(treatment_data)
            decision_path = []
            
            p_val = np.nan
            t_stat = np.nan
            ci_low, ci_high = np.nan, np.nan
            ci_metric = "Undefined"
            abs_effect = np.nan
            rel_effect = np.nan
            norm_effect = np.nan
            effect_metric = "Undefined"
            effect_family: Literal["standardized", "ratio", "rank", "raw"] = "standardized"
            power = np.nan
            
            if is_binary:
                decision_path.append("Domain evaluated as binary {0, 1}")
                count_control, count_treat = np.sum(control_data), np.sum(treatment_data)
                prop_control, prop_treat = mean_control, mean_treat
                prop_pool = (count_control + count_treat) / (n_control + n_treat)
                
                abs_effect = prop_treat - prop_control
                rel_effect = (abs_effect / prop_control * 100) if prop_control > 1e-6 else np.nan
                
                if np.isclose(prop_pool, 0.0) or np.isclose(prop_pool, 1.0):
                    test_name = "Fisher's Exact Test"
                    decision_path.append("Complete separation (zero variance) -> Fisher's Exact")
                    
                    odds_ratio, p_val = stats.fisher_exact([
                        [count_treat, n_treat - count_treat],
                        [count_control, n_control - count_control]
                    ])
                    t_stat = np.nan
                    
                    # Log-Odds CI (Haldane-Anscombe Correction for zero cells)
                    a = count_treat if count_treat > 0 else 0.5
                    b = (n_treat - count_treat) if (n_treat - count_treat) > 0 else 0.5
                    c = count_control if count_control > 0 else 0.5
                    d = (n_control - count_control) if (n_control - count_control) > 0 else 0.5
                    
                    log_or = np.log((a * d) / (b * c))
                    se_log_or = np.sqrt(1/a + 1/b + 1/c + 1/d)
                    z_crit = stats.norm.ppf(1 - alpha_adj / 2)
                    
                    ci_low = np.exp(log_or - z_crit * se_log_or)
                    ci_high = np.exp(log_or + z_crit * se_log_or)
                    ci_metric = "Exact Odds Ratio CI (Haldane-Anscombe)"
                    decision_path.append("CI method: Analytic Log-Odds")
                    
                    norm_effect = odds_ratio
                    effect_metric = "Odds Ratio"
                    effect_family = "ratio"

                else:
                    test_name = "Proportion Z-Test"
                    decision_path.append("Standard binary distribution -> Z-Test")
                    
                    se_pool = np.sqrt(prop_pool * (1 - prop_pool) * (1/n_control + 1/n_treat))
                    t_stat = abs_effect / se_pool
                    p_val = 2 * (1 - stats.norm.cdf(abs(t_stat)))
                    
                    se_diff = np.sqrt((prop_control*(1-prop_control)/n_control) + (prop_treat*(1-prop_treat)/n_treat))
                    z_crit = stats.norm.ppf(1 - alpha_adj / 2)
                    
                    ci_low, ci_high = abs_effect - z_crit * se_diff, abs_effect + z_crit * se_diff
                    ci_metric = "Difference of Proportions"
                    decision_path.append("CI method: Analytic Normal Approximation")
                    
                    norm_effect = 2 * np.arcsin(np.sqrt(prop_treat)) - 2 * np.arcsin(np.sqrt(prop_control))
                    effect_metric = "Cohen's h"
                    effect_family = "standardized"
                    power = ABTestingIntelligence._compute_post_hoc_power(abs_effect, se_diff, alpha_adj)

            elif (abs(skew_control) > SKEW_THRESHOLD or abs(skew_treat) > SKEW_THRESHOLD) or \
                 (kurt_control > KURTOSIS_THRESHOLD or kurt_treat > KURTOSIS_THRESHOLD):
                test_name = "Mann-Whitney U Test"
                decision_path.append(f"Skew > {SKEW_THRESHOLD} or Kurtosis > {KURTOSIS_THRESHOLD} -> Non-parametric Rank Test")
                
                u_stat, p_val = stats.mannwhitneyu(treatment_data, control_data, alternative='two-sided')
                t_stat = float(u_stat)
                warnings.append("Heavy-tailed or skewed data detected; applied non-parametric Mann-Whitney U test.")
                
                abs_effect = median_treat - median_control
                rel_effect = (abs_effect / median_control * 100) if median_control > 1e-6 else np.nan
                
                # Bootstrap CI for Median Difference (with safety fallback)
                if hasattr(stats, 'bootstrap'):
                    try:
                        def _median_diff(x, y): return np.median(x) - np.median(y)
                        boot_res = stats.bootstrap(
                            (treatment_data, control_data), 
                            statistic=_median_diff, 
                            confidence_level=1-alpha_adj, 
                            method='basic',
                            n_resamples=1000,
                            random_state=42
                        )
                        ci_low, ci_high = boot_res.confidence_interval.low, boot_res.confidence_interval.high
                        ci_metric = "Bootstrap Median Difference CI"
                        decision_path.append("CI method: Basic Bootstrap")
                    except Exception as boot_err:
                        ci_low, ci_high = np.nan, np.nan
                        ci_metric = "Bootstrap CI Failed"
                        decision_path.append(f"CI method fallback: Bootstrap failed ({str(boot_err)})")
                else:
                    ci_low, ci_high = np.nan, np.nan
                    ci_metric = "Bootstrap Unavailable (SciPy < 1.7)"
                    decision_path.append("CI method fallback: No CI available")
                
                norm_effect = 1 - (2 * u_stat / (n_control * n_treat))
                effect_metric = "Rank-Biserial Correlation"
                effect_family = "rank"
                
            else:
                test_name = "Welch's T-Test"
                var_ratio = max(var_control, var_treat) / min(var_control, var_treat) if min(var_control, var_treat) > 0 else float('inf')
                if var_ratio > VARIANCE_RATIO_THRESHOLD:
                    decision_path.append(f"Variance ratio ({var_ratio:.1f}) > {VARIANCE_RATIO_THRESHOLD} -> Welch's T-Test")
                else:
                    decision_path.append("Continuous, moderately symmetric data -> Welch's T-Test")
                    
                t_stat, p_val = stats.ttest_ind(treatment_data, control_data, equal_var=False)
                
                abs_effect = mean_treat - mean_control
                rel_effect = (abs_effect / mean_control * 100) if mean_control > 1e-6 else np.nan
                
                se = np.sqrt(var_control/n_control + var_treat/n_treat)
                df_num = (var_control/n_control + var_treat/n_treat)**2
                df_den = ((var_control/n_control)**2)/(n_control-1) + ((var_treat/n_treat)**2)/(n_treat-1)
                df_welch = df_num / df_den if df_den > 0 else (n_control + n_treat - 2)
                
                t_crit = stats.t.ppf(1 - alpha_adj/2, df_welch)
                ci_low, ci_high = abs_effect - t_crit * se, abs_effect + t_crit * se
                ci_metric = "Difference of Means"
                decision_path.append("CI method: Analytic T-Distribution")
                
                pooled_std = np.sqrt((var_control + var_treat) / 2)
                norm_effect = abs_effect / pooled_std if pooled_std > 0 else 0.0
                effect_metric = "Cohen's d (Approx)"
                effect_family = "standardized"
                power = ABTestingIntelligence._compute_post_hoc_power(abs_effect, se, alpha_adj)

            # 5. Result Normalization
            p_val = max(0.0, min(1.0, float(p_val))) if not np.isnan(p_val) else np.nan
            significant = False if np.isnan(p_val) else bool(p_val < alpha_adj)
            
            mde_warning = None
            if n_control < MIN_SAMPLE_SIZE or n_treat < MIN_SAMPLE_SIZE:
                mde_warning = "Low sample size. Test may be underpowered to detect minimum practical effects."
                warnings.append(mde_warning)

            if np.isnan(rel_effect):
                lift_str = "Undefined Lift"
            elif rel_effect > 0:
                lift_str = f"{abs(rel_effect):.2f}% increase"
            elif rel_effect < 0:
                lift_str = f"{abs(rel_effect):.2f}% decrease"
            else:
                lift_str = "0.00% change"
            
            insight = (
                f"The treatment group '{treatment_val}' resulted in a "
                f"{'statistically significant' if significant else 'non-significant'} "
                f"{lift_str} in {metric_col} compared to '{control_val}'. "
                f"(p={p_val:.4f}, {effect_metric}={norm_effect:.2f})"
            )

            result = ABTestResult(
                test_used=test_name,
                decision_path=decision_path,
                t_statistic=ABTestingIntelligence._clean_nan(t_stat),
                p_value=ABTestingIntelligence._clean_nan(p_val),
                alpha_used=alpha_adj,
                is_significant=significant,
                power=ABTestingIntelligence._clean_nan(power),
                absolute_effect=ABTestingIntelligence._clean_nan(abs_effect),
                relative_effect=ABTestingIntelligence._clean_nan(rel_effect),
                normalized_effect=ABTestingIntelligence._clean_nan(norm_effect),
                effect_size_metric=effect_metric,
                effect_size_family=effect_family,
                confidence_interval=(
                    ABTestingIntelligence._clean_nan(ci_low), 
                    ABTestingIntelligence._clean_nan(ci_high)
                ) if not (np.isnan(ci_low) or np.isnan(ci_high)) else None,
                confidence_interval_metric=ci_metric,
                control_mean=ABTestingIntelligence._clean_nan(mean_control),
                treatment_mean=ABTestingIntelligence._clean_nan(mean_treat),
                sample_sizes={"control": n_control, "treatment": n_treat},
                diagnostics=ABTestDiagnostics(
                    variance_control=ABTestingIntelligence._clean_nan(var_control) or 0.0,
                    variance_treatment=ABTestingIntelligence._clean_nan(var_treat) or 0.0,
                    skewness_control=ABTestingIntelligence._clean_nan(skew_control) or 0.0,
                    skewness_treatment=ABTestingIntelligence._clean_nan(skew_treat) or 0.0,
                    kurtosis_control=ABTestingIntelligence._clean_nan(kurt_control) or 0.0,
                    kurtosis_treatment=ABTestingIntelligence._clean_nan(kurt_treat) or 0.0,
                    mde_warning=mde_warning
                ),
                insight=insight,
                warnings=warnings
            )
            
            return result.model_dump()
            
        except Exception as e:
            logger.exception(
                "A/B Testing analysis failed", 
                extra={
                    "metric": metric_col, 
                    "group": group_col, 
                    "control": control_val, 
                    "treatment": treatment_val, 
                    "error": str(e)
                }
            )
            return {"error": str(e)}

# Export an instantiated service boundary default
ab_tester = ABTestingIntelligence()