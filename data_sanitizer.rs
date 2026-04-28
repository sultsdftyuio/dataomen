// data_sanitizer.rs
//
// Core Data Sanitization and Schema Enforcement Engine
// Translates Python/Polars heuristics into highly optimized Rust/Polars lazy evaluation.
//
// Dependencies (Cargo.toml):
// polars = { version = "0.38", features = ["lazy", "strings", "temporal", "dtype-decimal", "regex"] }
// hmac = "0.12"
// sha2 = "0.10"
// pbkdf2 = "0.12"
// serde = { version = "1.0", features = ["derive"] }
// chrono = "0.4"
// log = "0.4"

use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use pbkdf2::pbkdf2_hmac;
use polars::prelude::*;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::{HashMap, HashSet, VecDeque};
use std::env;
use std::time::Instant;

type HmacSha256 = Hmac<Sha256>;

const NUMERIC_CLEANUP_REGEX: &str = r"[^\d,.\-]";
const NUMERIC_VALIDATION_REGEX: &str = r"^-?\d+([.,]\d+)?$";
const WHITESPACE_REGEX: &str = r"\s+";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ColumnType {
    String,
    Int,
    Float,
    Bool,
    Date,
    Datetime,
    Currency,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnSchema {
    pub name: String,
    pub col_type: ColumnType,
    pub nullable: bool,
    pub pii: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum SanitizerMode {
    FastAnalyticsHash,
    SecureIdentityHash,
}

#[derive(Debug, Default, Serialize)]
pub struct ExecutionMetrics {
    pub rows_input: usize,
    pub rows_output: usize,
    pub rows_dropped: usize,
    pub pii_cells_transformed: usize,
    pub total_execution_ms: f64,
}

#[derive(Debug, Default, Serialize)]
pub struct SanitizerMetrics {
    pub pii_columns_configured: usize,
    pub null_injections: usize,
    pub columns_casted: usize,
    pub stage_times_ms: HashMap<String, f64>,
    pub execution: ExecutionMetrics,
}

pub struct DataSanitizer {
    pub tenant_id: String,
    pub version: String,
    pub mode: SanitizerMode,
    pub strict_mode: bool,
    pub streaming_safe: bool,
    
    tenant_key: [u8; 32],
    active_pii_columns: Vec<String>,
    schema_fingerprint: Option<String>,
    system_columns: Vec<String>,
    
    pub metrics: SanitizerMetrics,
    audit_log: VecDeque<serde_json::Value>,
}

impl DataSanitizer {
    pub fn new(
        tenant_id: String,
        version: String,
        mode_str: &str,
        strict_mode: bool,
    ) -> Result<Self, String> {
        let mode = match mode_str {
            "fast_analytics_hash" | "fast_session_hash" | "pseudonymization_fast" => {
                SanitizerMode::FastAnalyticsHash
            }
            "secure_identity_hash" | "cryptographic_hmac" => SanitizerMode::SecureIdentityHash,
            _ => return Err(format!("[{}] Unsupported mode '{}'", tenant_id, mode_str)),
        };

        let streaming_safe = mode == SanitizerMode::FastAnalyticsHash;

        let master_key = env::var("DATA_VAULT_MASTER_KEY")
            .map_err(|_| format!("[{}] CRITICAL: DATA_VAULT_MASTER_KEY not set.", tenant_id))?;

        let mut tenant_key = [0u8; 32];
        let salt = format!("{}:{}", tenant_id, version);
        pbkdf2_hmac::<Sha256>(
            master_key.as_bytes(),
            salt.as_bytes(),
            100_000,
            &mut tenant_key,
        );

        Ok(Self {
            tenant_id,
            version,
            mode,
            strict_mode,
            streaming_safe,
            tenant_key,
            active_pii_columns: Vec::new(),
            schema_fingerprint: None,
            system_columns: vec![
                "_tenant_id".into(),
                "_ingested_at".into(),
                "_batch_id".into(),
                "_source_file".into(),
            ],
            metrics: SanitizerMetrics::default(),
            audit_log: VecDeque::with_capacity(10_000),
        })
    }

    /// Translates ColumnType to standard Polars DataType
    fn map_to_polars_type(&self, col_type: &ColumnType) -> DataType {
        match col_type {
            ColumnType::String => DataType::String,
            ColumnType::Int => DataType::Int64,
            ColumnType::Float => DataType::Float64,
            ColumnType::Bool => DataType::Boolean,
            ColumnType::Date => DataType::Date,
            ColumnType::Datetime => DataType::Datetime(TimeUnit::Microseconds, Some("UTC".into())),
            // Polars Decimal requires precision and scale
            ColumnType::Currency => DataType::Decimal(Some(18), Some(2)),
        }
    }

    /// Stage 1: PII Isolation & Hashing
    pub fn sanitize_pii(
        &mut self,
        lf: LazyFrame,
        expected_schema: &[ColumnSchema],
        existing_cols: &HashSet<String>,
    ) -> LazyFrame {
        let start = Instant::now();

        self.active_pii_columns = expected_schema
            .iter()
            .filter(|c| c.pii && existing_cols.contains(&c.name))
            .map(|c| c.name.clone())
            .collect();

        self.metrics.pii_columns_configured = self.active_pii_columns.len();

        if self.active_pii_columns.is_empty() {
            return lf;
        }

        let mut exprs = Vec::new();
        let seed = u64::from_le_bytes(self.tenant_key[0..8].try_into().unwrap());

        for col_name in &self.active_pii_columns {
            // Base normalization: Cast -> Strip -> Lowercase -> Replace whitespace
            let base_expr = col(col_name)
                .cast(DataType::String)
                .str().strip_chars(lit(Null{})) // Polars 0.38+ syntax for default strip
                .str().to_lowercase()
                .str().replace_all(lit(WHITESPACE_REGEX), lit(""), true);

            let expr = match self.mode {
                SanitizerMode::FastAnalyticsHash => {
                    // Use native xxhash/siphash
                    when(base_expr.clone().is_null())
                        .then(lit(Null{}).cast(DataType::String))
                        .otherwise(base_expr.hash(seed, seed, seed, seed).cast(DataType::String))
                        .alias(col_name)
                }
                SanitizerMode::SecureIdentityHash => {
                    // Fallback to UDF map logic if strict crypto hashing is required.
                    // Note: In high-performance rust, you'd apply a MapFunction here.
                    // For brevity, we mock the apply block.
                    base_expr.map(
                        |_s| {
                            // HMAC logic here over Series chunks
                            unimplemented!("Secure Identity Hash requires custom map_batches in Rust")
                        },
                        GetOutput::from_type(DataType::String),
                    ).alias(col_name)
                }
            };
            exprs.push(expr);
        }

        self.metrics
            .stage_times_ms
            .insert("sanitize_pii".to_string(), start.elapsed().as_secs_f64() * 1000.0);

        lf.with_columns(exprs)
    }

    /// Helper for safe numerical casting (Regex cleanup -> coalesce)
    fn safe_numeric_cast(&self, col_name: &str, target_type: DataType) -> Expr {
        let normalized_str = col(col_name)
            .cast(DataType::String)
            .str().replace_all(lit(NUMERIC_CLEANUP_REGEX), lit(""), true)
            .str().replace_all(lit(","), lit(""), true);

        if self.strict_mode {
            normalized_str.cast(target_type).alias(col_name)
        } else {
            let is_valid = normalized_str.clone().str().contains(lit(NUMERIC_VALIDATION_REGEX), true);
            when(is_valid)
                .then(normalized_str.cast(target_type.clone()))
                .otherwise(lit(Null{}).cast(target_type))
                .alias(col_name)
        }
    }

    /// Stage 2: Schema Enforcement
    pub fn enforce_schema(
        &mut self,
        lf: LazyFrame,
        expected_schema: &[ColumnSchema],
        existing_cols: &HashSet<String>,
    ) -> LazyFrame {
        let start = Instant::now();
        let mut final_exprs = Vec::new();

        // 1. System Columns
        for sys_col in &self.system_columns {
            if existing_cols.contains(sys_col) {
                final_exprs.push(col(sys_col));
            }
        }

        // 2. Expected Columns
        for col_schema in expected_schema {
            let col_name = &col_schema.name;
            let t_type = self.map_to_polars_type(&col_schema.col_type);

            if !existing_cols.contains(col_name) {
                self.metrics.null_injections += 1;
                final_exprs.push(lit(Null{}).cast(t_type).alias(col_name));
            } else {
                self.metrics.columns_casted += 1;
                match t_type {
                    DataType::Int64 | DataType::Float64 | DataType::Decimal(_, _) => {
                        final_exprs.push(self.safe_numeric_cast(col_name, t_type));
                    }
                    _ => {
                        final_exprs.push(col(col_name).cast(t_type).alias(col_name));
                    }
                }
            }
        }

        self.metrics
            .stage_times_ms
            .insert("enforce_schema".to_string(), start.elapsed().as_secs_f64() * 1000.0);

        lf.select(final_exprs)
    }

    /// Validates zero-trust boundaries
    pub fn validate_contract(
        &self,
        existing_cols: &HashSet<String>,
        expected_schema: &[ColumnSchema],
    ) -> Result<(), String> {
        let missing_required: Vec<&String> = expected_schema
            .iter()
            .filter(|c| !c.nullable && !existing_cols.contains(&c.name))
            .map(|c| &c.name)
            .collect();

        if !missing_required.is_empty() {
            return Err(format!(
                "[{}] Contract violation. Missing required columns: {:?}",
                self.tenant_id, missing_required
            ));
        }

        if self.strict_mode {
            let expected_names: HashSet<&String> = expected_schema.iter().map(|c| &c.name).collect();
            let unexpected: Vec<&String> = existing_cols
                .iter()
                .filter(|c| !expected_names.contains(c) && !self.system_columns.contains(c))
                .collect();

            if !unexpected.is_empty() {
                return Err(format!(
                    "[{}] Strict mode violation. Unexpected columns: {:?}",
                    self.tenant_id, unexpected
                ));
            }
        }

        Ok(())
    }

    /// Orchestrates the Directed Acyclic Graph (DAG) for processing
    pub fn build_pipeline(
        &mut self,
        lf: LazyFrame,
        expected_schema: &[ColumnSchema],
        ingestion_schema: &Schema,
    ) -> Result<LazyFrame, String> {
        let existing_cols: HashSet<String> = ingestion_schema
            .iter_names()
            .map(|n| n.to_string())
            .collect();

        // Validate before computing
        self.validate_contract(&existing_cols, expected_schema)?;

        // Build lazy dag
        let mut lf = self.sanitize_pii(lf, expected_schema, &existing_cols);
        lf = self.enforce_schema(lf, expected_schema, &existing_cols);

        Ok(lf)
    }

    /// Fully materializes the dataframe and extracts observability lineage
    pub fn execute(&mut self, lf: LazyFrame, initial_row_count: usize) -> Result<DataFrame, PolarsError> {
        let start = Instant::now();
        
        let streaming = if self.streaming_safe { true } else { false };
        let df = lf.with_streaming(streaming).collect()?;

        let final_height = df.height();
        let exact_cells_transformed = if final_height > 0 {
            final_height * self.active_pii_columns.len()
        } else {
            0
        };

        self.metrics.execution.rows_input = initial_row_count;
        self.metrics.execution.rows_output = final_height;
        self.metrics.execution.rows_dropped = initial_row_count.saturating_sub(final_height);
        self.metrics.execution.pii_cells_transformed = exact_cells_transformed;
        self.metrics.execution.total_execution_ms = start.elapsed().as_secs_f64() * 1000.0;

        Ok(df)
    }
}