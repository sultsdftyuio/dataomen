// data_sanitizer.rs
//
// Production-grade PII sanitisation and schema enforcement for Polars (Rust).
//
// Cargo.toml
// ────────
// [dependencies]
// polars = { version = "0.41", features = ["lazy", "strings", "temporal", "dtype-decimal", "performant", "regex"] }
// regex = "1.10"
// hmac = "0.12"
// sha2 = "0.10"
// pbkdf2 = "0.12"
// serde = { version = "1.0", features = ["derive"] }
// serde_json = "1.0"
// chrono = "0.4"
// log = "0.4"
// sysinfo = "0.30"
// thiserror = "1.0"
// once_cell = "1.19"
// ahash = "0.8"
// rand = { version = "0.8", features = ["small_rng"] }

use std::collections::{HashMap, HashSet, VecDeque};
use std::env;
use std::sync::{Arc, RwLock};
use std::hash::{Hash, Hasher};
use std::time::Instant;

use ahash::{AHasher, HashMap as AHashMap, HashMapExt};
use chrono::Utc;
use hmac::{Hmac, Mac};
use log::{debug, info, warn};
use once_cell::sync::Lazy;
use pbkdf2::pbkdf2_hmac;
use polars::prelude::*;
use rand::rngs::SmallRng;
use rand::SeedableRng;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sysinfo::{get_current_pid, ProcessRefreshKind, RefreshKind, System};
use thiserror::Error;

type HmacSha256 = Hmac<Sha256>;

// ─────────────────────────────────────────────────────────────────────────────
// Precompiled regex – used ONLY in batch functions, never inside Polars exprs.
// Polars string expressions recompile regex internally; we avoid that entirely.
// ─────────────────────────────────────────────────────────────────────────────
static NUMERIC_CLEANUP_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"[^\d.\-]").unwrap());
static NUMERIC_VALIDATION_RE: Lazy<Regex> = Regex::new(r"^-?\d+(\.\d+)?$").unwrap();
static WHITESPACE_RE: Lazy<Regex> = Regex::new(r"\s+").unwrap();

thread_local! {
    static AUDIT_RNG: std::cell::RefCell<SmallRng> = std::cell::RefCell::new(SmallRng::seed_from_u64(
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos() as u64
    ));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

pub type AuditEntry = serde_json::Map<String, Value>;
pub type AuditSink = Arc<dyn Fn(AuditEntry) + Send + Sync>;

fn noop_sink(_: AuditEntry) {}

fn null_of(dtype: DataType) -> Expr {
    Expr::Literal(LiteralValue::Null).cast(dtype)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SanitizerMode {
    FastAnalyticsHash,
    StableAnalyticsHash,
    SecureIdentityHash,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct ColumnMetrics {
    pub null_count: usize,
    pub null_rate: f64,
    pub pii: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct ExecutionMetrics {
    pub rows_input: usize,
    pub rows_output: usize,
    pub rows_dropped: usize,
    pub pii_columns_configured: usize,
    /// Approximate upper bound of cells transformed (includes nulls and pre-hashed values)
    pub pii_cells_transformed: usize,
    pub null_injections: usize,
    pub columns_casted: usize,
    pub total_execution_ms: f64,
    pub stage_times_ms: HashMap<String, f64>,
    pub per_column: HashMap<String, ColumnMetrics>,
}

#[derive(Error, Debug)]
pub enum SanitizerError {
    #[error("[{tenant_id}] Contract violation. Missing required columns: {missing:?}")]
    ContractViolation { tenant_id: String, missing: Vec<String> },

    #[error("[{tenant_id}] Strict mode violation. Unexpected columns: {unexpected:?}")]
    StrictModeViolation { tenant_id: String, unexpected: Vec<String> },

    #[error("[{tenant_id}] Unsupported mode '{mode}'")]
    UnsupportedMode { tenant_id: String, mode: String },

    #[error("[{tenant_id}] CRITICAL: DATA_VAULT_MASTER_KEY not set")]
    MissingMasterKey { tenant_id: String },

    #[error("[{tenant_id}] Cardinality limit exceeded for column '{column}': {cardinality} > {limit}. Consider fast_analytics_hash or increase limit.")]
    CardinalityExceeded {
        tenant_id: String,
        column: String,
        cardinality: usize,
        limit: usize,
    },

    #[error("[{tenant_id}] Memory telemetry at '{context}': {rss_mb:.1f} MB > soft limit {max_mb} MB")]
    MemoryTelemetryExceeded {
        tenant_id: String,
        context: String,
        rss_mb: f64,
        max_mb: usize,
    },

    #[error("Polars error: {0}")]
    Polars(#[from] PolarsError),
}

// ─────────────────────────────────────────────────────────────────────────────
// DataSanitizer
// ─────────────────────────────────────────────────────────────────────────────

pub struct DataSanitizer {
    tenant_id: Arc<str>,
    version: Arc<str>,
    mode: SanitizerMode,
    strict_mode: bool,
    preserve_unknown_columns: bool,

    /// Soft memory telemetry limit (MB). NOT a hard guarantee. 0 = disabled.
    telemetry_memory_mb: usize,

    /// Max unique values allowed per PII column for join-based hashing.
    /// Exceeding this fails fast so you don't OOM on high-cardinality columns.
    cardinality_limit: usize,

    /// Output length for stable hash hex truncation. Default 16 (64-bit).
    /// ⚠️  Collision risk: 16 hex = 64 bits (fine <10M rows). 24 hex = 96 bits safer.
    hash_output_len: usize,

    tenant_key: [u8; 32],
    fast_hash_seed: u64,

    streaming_safe: bool,
    system_columns: Vec<(String, DataType)>,

    // [ARCH-7] Mutable pipeline state — write-once per build, then read-only.
    active_pii_columns: RwLock<Vec<String>>,
    schema_fingerprint: RwLock<Option<String>>,

    // [SUBTLE-9] Expression cache — read-heavy, so RwLock.
    // Key: (schema_fingerprint, mode, sorted_pii_columns)
    pii_expr_cache: RwLock<AHashMap<(u64, SanitizerMode), Vec<Expr>>>,

    // [ARCH-8] Audit
    audit_enabled: bool,
    audit_sample_rate: f64,
    audit_sink: AuditSink,
    audit_log: RwLock<VecDeque<AuditEntry>>,
    audit_buffer_size: usize,
}

impl DataSanitizer {
    const STREAMING_UNSAFE: &[SanitizerMode] = &[
        SanitizerMode::StableAnalyticsHash,
        SanitizerMode::SecureIdentityHash,
    ];

    /// Prefixes for idempotent hash detection (fixes SUBTLE-11 false positives).
    const PREFIX_STABLE: &'static str = "h1_";
    const PREFIX_SECURE: &'static str = "h2_";

    #[allow(clippy::too_many_arguments)]
    pub fn new(
        tenant_id: impl Into<Arc<str>>,
        version: impl Into<Arc<str>>,
        mode: &str,
        strict_mode: bool,
        preserve_unknown_columns: bool,
        audit_enabled: bool,
        audit_sample_rate: f64,
        audit_sink: Option<AuditSink>,
        audit_buffer_size: usize,
        telemetry_memory_mb: usize,
        cardinality_limit: usize,
        hash_output_len: usize,
    ) -> Result<Self, SanitizerError> {
        let tenant_id = tenant_id.into();
        let version = version.into();
        let mode = Self::normalize_mode(&tenant_id, mode)?;

        let master_key = env::var("DATA_VAULT_MASTER_KEY").map_err(|_| {
            SanitizerError::MissingMasterKey {
                tenant_id: tenant_id.to_string(),
            }
        })?;

        let mut tenant_key = [0u8; 32];
        let salt = format!("{}:{}", tenant_id, version);
        pbkdf2_hmac::<Sha256>(
            master_key.as_bytes(),
            salt.as_bytes(),
            100_000,
            &mut tenant_key,
        );

        let fast_hash_seed = u64::from_le_bytes(tenant_key[..8].try_into().unwrap());

        Ok(Self {
            tenant_id: tenant_id.clone(),
            version,
            mode,
            strict_mode,
            preserve_unknown_columns,
            telemetry_memory_mb,
            cardinality_limit,
            hash_output_len: hash_output_len.clamp(24, 64),
            tenant_key,
            fast_hash_seed,
            streaming_safe: !Self::STREAMING_UNSAFE.contains(&mode),
            system_columns: vec![
                ("_tenant_id".into(), DataType::String),
                ("_ingested_at".into(), DataType::Datetime(TimeUnit::Microseconds, Some("UTC".into()))),
                ("_batch_id".into(), DataType::String),
                ("_source_file".into(), DataType::String),
            ],
            active_pii_columns: RwLock::new(Vec::new()),
            schema_fingerprint: RwLock::new(None),
            pii_expr_cache: RwLock::new(AHashMap::new()),
            audit_enabled,
            audit_sample_rate: audit_sample_rate.clamp(0.0, 1.0),
            audit_sink: audit_sink.unwrap_or_else(|| Arc::new(noop_sink)),
            audit_log: RwLock::new(VecDeque::with_capacity(audit_buffer_size)),
            audit_buffer_size,
        })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal: mode normalisation
    // ─────────────────────────────────────────────────────────────────────────

    fn normalize_mode(tenant_id: &str, mode: &str) -> Result<SanitizerMode, SanitizerError> {
        let normalized = match mode {
            "fast_analytics_hash" | "fast_session_hash" | "pseudonymization_fast" => {
                SanitizerMode::FastAnalyticsHash
            }
            "stable_analytics_hash" | "stable_pseudonymization" => {
                SanitizerMode::StableAnalyticsHash
            }
            "secure_identity_hash" | "cryptographic_hmac" => {
                SanitizerMode::SecureIdentityHash
            }
            _ => {
                return Err(SanitizerError::UnsupportedMode {
                    tenant_id: tenant_id.to_string(),
                    mode: mode.to_string(),
                })
            }
        };

        if normalized == SanitizerMode::FastAnalyticsHash {
            warn!(
                "[{}] 'fast_analytics_hash' uses the Polars built-in hash which is NOT \
                 stable across Polars versions or CPU architectures. Use \
                 'stable_analytics_hash' for anything beyond ephemeral workloads.",
                tenant_id
            );
        }
        Ok(normalized)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal: audit  ([ARCH-8] + deterministic RNG fix)
    // ─────────────────────────────────────────────────────────────────────────

    fn audit(&self, entry: AuditEntry) {
        if !self.audit_enabled {
            return;
        }
        if self.audit_sample_rate < 1.0 {
            let sample: f64 = AUDIT_RNG.with(|rng| rand::Rng::gen(&mut *rng.borrow_mut()));
            if sample > self.audit_sample_rate {
                return;
            }
        }
        let mut stamped = entry;
        stamped.insert(
            "timestamp_utc".to_string(),
            Value::String(Utc::now().to_rfc3339()),
        );

        {
            let mut log = self.audit_log.write().unwrap();
            if log.len() >= self.audit_buffer_size {
                log.pop_front();
            }
            log.push_back(stamped.clone());
        }

        (self.audit_sink)(stamped);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal: idempotency guard  ([SUBTLE-11] prefix-based, not regex)
    // ─────────────────────────────────────────────────────────────────────────

    fn is_already_hashed(&self, value: &str) -> bool {
        match self.mode {
            SanitizerMode::StableAnalyticsHash => value.starts_with(Self::PREFIX_STABLE),
            SanitizerMode::SecureIdentityHash => value.starts_with(Self::PREFIX_SECURE),
            _ => false,
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal: PII hash production (eager, on unique values only)
    // ─────────────────────────────────────────────────────────────────────────

    /// [CRIT-1, CRIT-2, 🔴#1] Build hash lookup DataFrames via eager unique scan.
    /// This avoids `.map()` / `.map_batches()` UDFs entirely — the pipeline uses
    /// native vectorized left joins instead.
    fn build_hash_lookups(
        &self,
        lf: &LazyFrame,
        pii_columns: &[String],
    ) -> Result<Vec<(String, DataFrame)>, SanitizerError> {
        let mut lookups = Vec::with_capacity(pii_columns.len());

        for col_name in pii_columns {
            let stage_start = Instant::now();

            // Eager cardinality scan. This is the intentional tradeoff: we lose
            // full laziness for crypto/stable modes but gain full vectorization.
            let unique_df = lf
                .clone()
                .select([col(col_name)])
                .unique(None, UniqueKeepStrategy::First)
                .collect()?;

            let unique_series = unique_df.column(col_name)?.str()?;
            let cardinality = unique_series.len();

            if cardinality > self.cardinality_limit {
                return Err(SanitizerError::CardinalityExceeded {
                    tenant_id: self.tenant_id.to_string(),
                    column: col_name.clone(),
                    cardinality,
                    limit: self.cardinality_limit,
                });
            }

            // Hash unique values in pure Rust (no Polars UDF overhead).
            let hashed: Series = match self.mode {
                SanitizerMode::StableAnalyticsHash => {
                    let prefix = format!("{}:", self.tenant_id);
                    let out: StringChunked = unique_series
                        .into_iter()
                        .map(|opt| {
                            opt.map(|val| {
                                if self.is_already_hashed(val) {
                                    return val.to_string();
                                }
                                let mut hasher = Sha256::new();
                                hasher.update(prefix.as_bytes());
                                hasher.update(val.as_bytes());
                                let hex = format!("{:x}", hasher.finalize());
                                format!(
                                    "{}{}",
                                    Self::PREFIX_STABLE,
                                    &hex[..self.hash_output_len]
                                )
                            })
                        })
                        .collect();
                    out.into_series()
                }
                SanitizerMode::SecureIdentityHash => {
                    let key = self.tenant_key;
                    let out: StringChunked = unique_series
                        .into_iter()
                        .map(|opt| {
                            opt.map(|val| {
                                if self.is_already_hashed(val) {
                                    return val.to_string();
                                }
                                let mut mac =
                                    HmacSha256::new_from_slice(key.as_slice())
                                        .expect("HMAC accepts any key length");
                                mac.update(val.as_bytes());
                                let hex = format!("{:x}", mac.finalize().into_bytes());
                                format!("{}{}", Self::PREFIX_SECURE, hex)
                            })
                        })
                        .collect();
                    out.into_series()
                }
                _ => unreachable!(),
            };

            let lookup = df! {
                "__pii_k_7a3f" => unique_series,
                "__pii_h_7a3f" => hashed
            }
            .map_err(SanitizerError::Polars)?;

            debug!(
                "[{}] Hash lookup for '{}': {} uniques in {:.2}ms",
                self.tenant_id,
                col_name,
                cardinality,
                stage_start.elapsed().as_secs_f64() * 1000.0
            );

            lookups.push((col_name.clone(), lookup));
        }

        Ok(lookups)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Stage 1 — PII sanitisation  (NO UDFs for stable/secure modes)
    // ─────────────────────────────────────────────────────────────────────────

    fn build_fast_hash_exprs(&self, pii_columns: &[String]) -> Vec<Expr> {
        let seed = self.fast_hash_seed;
        pii_columns
            .iter()
            .map(|col_name| {
                let base_expr = col(col_name)
                    .cast(DataType::String)
                    .str()
                    .strip_chars(lit(" ")) // [🔴#5] idiomatic, no null_of()
                    .str()
                    .to_lowercase()
                    .str()
                    .replace_all(lit(WHITESPACE_RE.as_str()), lit(" "), true);

                when(base_expr.clone().is_null())
                    .then(null_of(DataType::String))
                    .otherwise(base_expr.hash(seed, seed, seed, seed).cast(DataType::String))
                    .alias(col_name)
            })
            .collect()
    }

    fn sanitize_pii_stage(
        &mut self,
        lf: LazyFrame,
        expected_schema: &[ColumnSchema],
        existing_cols: &HashSet<String>,
        fingerprint: &str,
        metrics: &mut ExecutionMetrics,
    ) -> Result<LazyFrame, SanitizerError> {
        let stage_start = Instant::now();

        let mut pii_columns: Vec<String> = expected_schema
            .iter()
            .filter(|c| c.pii && existing_cols.contains(&c.name))
            .map(|c| c.name.clone())
            .collect();
        pii_columns.sort_unstable(); // [🔴#7] deterministic cache key

        {
            let mut active = self.active_pii_columns.write().unwrap();
            *active = pii_columns.clone();
        }

        metrics.pii_columns_configured = pii_columns.len();

        if pii_columns.is_empty() {
            return Ok(lf);
        }

        let lf = match self.mode {
            // [🔴#1] Fast mode: fully native, vectorized, streaming-safe.
            SanitizerMode::FastAnalyticsHash => {
                let mut hasher = AHasher::default();
                fingerprint.hash(&mut hasher);
                pii_columns.hash(&mut hasher);
                let cache_key = (hasher.finish(), self.mode);
                let exprs = {
                    let cache = self.pii_expr_cache.read().unwrap();
                    cache.get(&cache_key).cloned()
                };

                let exprs = match exprs {
                    Some(e) => e,
                    None => {
                        let e = self.build_fast_hash_exprs(&pii_columns);
                        let mut cache = self.pii_expr_cache.write().unwrap();
                        cache.insert(cache_key, e.clone());
                        e
                    }
                };

                lf.with_columns(exprs)
            }

            // [🔴#1] Stable/Secure modes: eager unique scan + left join.
            // Fully vectorized, no Python/Rust UDFs inside the lazy DAG.
            _ => {
                let lookups = self.build_hash_lookups(&lf, &pii_columns)?;
                let mut lf = lf;
                for (col_name, lookup) in lookups {
                    let lookup_lf = lookup.lazy().unique(Some(vec!["__pii_k_7a3f".into()]), UniqueKeepStrategy::First);
                    lf = lf
                        .join(
                            lookup_lf,
                            [col(&col_name)],
                            [col("__pii_k_7a3f")],
                            JoinType::Left,
                        )
                        .with_column(col("__pii_h_7a3f").alias(&col_name))
                        .drop(["__pii_k_7a3f", "__pii_h_7a3f"]);
                }
                lf
            }
        };

        self.audit({
            let mut entry = AuditEntry::new();
            entry.insert("stage".into(), "sanitize_pii".into());
            entry.insert("mode".into(), format!("{:?}", self.mode).into());
            entry.insert(
                "columns_hashed".into(),
                serde_json::to_value(&pii_columns).unwrap(),
            );
            entry.insert("fingerprint".into(), fingerprint.into());
            entry
        });

        metrics.stage_times_ms.insert(
            "sanitize_pii".to_string(),
            stage_start.elapsed().as_secs_f64() * 1000.0,
        );

        Ok(lf)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Stage 2 — Numeric cast helper  ([🔴#3] integer cents, no float intermediate)
    // ─────────────────────────────────────────────────────────────────────────

    /// [CRIT-3, 🔴#3] Financial-grade currency parsing.
    /// String → i64 cents → Decimal(18,2). Zero float intermediate.
    fn parse_currency_batch(s: Series) -> Result<Option<Series>, PolarsError> {
        let ca = s.str()?;
        let cents: Vec<Option<i128>> = ca
            .into_iter()
            .map(|opt| {
                opt.and_then(|raw| {
                    // Strip everything except digits, dot, minus.
                    let cleaned: String = raw
                        .chars()
                        .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
                        .collect();
                    if cleaned.is_empty() || cleaned == "-" {
                        return None;
                    }

                    let negative = cleaned.starts_with('-');
                    let body = cleaned.trim_start_matches('-');

                    let (whole_str, frac_str) = match body.split_once('.') {
                        Some((w, f)) => (w, f),
                        None => (body, ""),
                    };

                    // Reject multiple dots or empty whole part.
                    if whole_str.is_empty() || body.matches('.').count() > 1 {
                        return None;
                    }

                    let whole: i128 = whole_str.parse().ok()?;
                    let frac: i128 = match frac_str.len() {
                        0 => 0,
                        1 => frac_str.parse::<i128>().ok()? * 10,
                        2 => frac_str.parse::<i128>().ok()?,
                        _ => {
                            let digits = &frac_str[..3];
                            let val: i128 = digits.parse().ok()?;
                            (val + 5) / 10 // round 3 digits to 2
                        }
                    };

                    let total = whole * 100 + frac;
                    Some(if negative { -total } else { total })
                })
            })
            .collect();

        // i128 cents directly encodes Decimal(18,2) unscaled values.
        let series = Series::new(s.name(), cents);
        Ok(Some(series.cast(&DataType::Decimal(Some(18), Some(2)))?))
    }

    /// [CRIT-4, 🔴#2] Batch-level numeric normalization using precompiled regex.
    /// Avoids Polars internal regex recompilation entirely.
    fn parse_numeric_batch(s: Series, target_type: DataType) -> Result<Option<Series>, PolarsError> {
        let ca = s.str()?;
        let cleaned: Vec<Option<String>> = ca
            .into_iter()
            .map(|opt| {
                opt.map(|raw| {
                    NUMERIC_CLEANUP_RE
                        .replace_all(raw, "")
                        .replace(',', "")
                        .to_string()
                })
            })
            .collect();

        let cleaned_series = Series::new(s.name(), cleaned);
        Ok(Some(cleaned_series.cast(&target_type)?))
    }

    fn safe_numeric_cast(&self, col_name: &str, target_type: DataType) -> Expr {
        match target_type {
            // [🔴#3] Currency never touches Float64.
            DataType::Decimal(_, _) => col(col_name)
                .cast(DataType::String)
                .map(
                    Self::parse_currency_batch,
                    GetOutput::from_type(DataType::Decimal(Some(18), Some(2))),
                )
                .alias(col_name),

            // [🔴#2] Other numerics: batch regex cleanup + cast.
            DataType::Int64 | DataType::Float64 => {
                let dtype = target_type.clone();
                col(col_name)
                    .cast(DataType::String)
                    .map(
                        move |s| Self::parse_numeric_batch(s, dtype.clone()),
                        GetOutput::from_type(dtype.clone()),
                    )
                    .alias(col_name)
            }

            _ => col(col_name).cast(target_type.clone()).alias(col_name),
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Stage 3 & 4 — Schema enforcement
    // ─────────────────────────────────────────────────────────────────────────

    fn build_schema_exprs(
        &self,
        expected_schema: &[ColumnSchema],
        existing_cols: &HashSet<String>,
        metrics: &mut ExecutionMetrics,
    ) -> (Vec<Expr>, Vec<Expr>) {
        let mut schema_exprs = Vec::new();
        let mut unknown_exprs = Vec::new();
        let system_col_set: HashSet<&str> =
            self.system_columns.iter().map(|(s, _)| s.as_str()).collect();
        let declared_names: HashSet<&str> =
            expected_schema.iter().map(|c| c.name.as_str()).collect();

        // [ARCH-6] HEAD: system columns in deterministic order
        for (sys_col, dtype) in &self.system_columns {
            if existing_cols.contains(sys_col) {
                schema_exprs.push(col(sys_col));
            } else {
                schema_exprs.push(null_of(dtype.clone()).alias(sys_col));
            }
        }

        // MIDDLE: declared schema columns
        for col_schema in expected_schema {
            let col_name = &col_schema.name;
            let t_type = map_to_polars_type(&col_schema.col_type);

            if !existing_cols.contains(col_name) {
                warn!(
                    "[{}] Missing column injected as null: {}",
                    self.tenant_id, col_name
                );
                metrics.null_injections += 1;
                schema_exprs.push(null_of(t_type.clone()).alias(col_name));
            } else {
                metrics.columns_casted += 1;
                if is_numeric_or_decimal(&t_type) {
                    schema_exprs.push(self.safe_numeric_cast(col_name, t_type.clone()));
                } else {
                    schema_exprs.push(col(col_name).cast(t_type.clone()).alias(col_name));
                }
            }
        }

        // [ARCH-5] TAIL: unknown columns (only when preserve_unknown_columns=True)
        if self.preserve_unknown_columns {
            let mut unknown_names: Vec<&str> = existing_cols
                .iter()
                .map(|s| s.as_str())
                .filter(|c| !declared_names.contains(c) && !system_col_set.contains(c))
                .collect();
            unknown_names.sort_unstable();
            for col_name in unknown_names {
                unknown_exprs.push(col(col_name));
            }
        }

        (schema_exprs, unknown_exprs)
    }

    fn enforce_schema_stage(
        &mut self,
        lf: LazyFrame,
        expected_schema: &[ColumnSchema],
        existing_cols: &HashSet<String>,
        metrics: &mut ExecutionMetrics,
    ) -> LazyFrame {
        let stage_start = Instant::now();

        let (schema_exprs, unknown_exprs) =
            self.build_schema_exprs(expected_schema, existing_cols, metrics);

        self.audit({
            let mut entry = AuditEntry::new();
            entry.insert("stage".into(), "enforce_schema".into());
            entry.insert(
                "columns_retained".into(),
                serde_json::to_value(
                    expected_schema.iter().map(|c| &c.name).collect::<Vec<_>>(),
                )
                .unwrap(),
            );
            entry.insert(
                "unknown_columns_preserved".into(),
                self.preserve_unknown_columns.into(),
            );
            entry
        });

        metrics.stage_times_ms.insert(
            "enforce_schema".to_string(),
            stage_start.elapsed().as_secs_f64() * 1000.0,
        );

        let all_exprs = if self.preserve_unknown_columns {
            let mut all = schema_exprs;
            all.extend(unknown_exprs);
            all
        } else {
            schema_exprs
        };

        lf.select(all_exprs)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Contract validation
    // ─────────────────────────────────────────────────────────────────────────

    fn validate_contract(
        &self,
        existing_cols: &HashSet<String>,
        expected_schema: &[ColumnSchema],
    ) -> Result<(), SanitizerError> {
        let missing: Vec<String> = expected_schema
            .iter()
            .filter(|c| !c.nullable && !existing_cols.contains(&c.name))
            .map(|c| c.name.clone())
            .collect();

        if !missing.is_empty() {
            return Err(SanitizerError::ContractViolation {
                tenant_id: self.tenant_id.to_string(),
                missing,
            });
        }

        if self.strict_mode {
            let expected_names: HashSet<&str> =
                expected_schema.iter().map(|c| c.name.as_str()).collect();
            let unexpected: Vec<String> = existing_cols
                .iter()
                .filter(|c| {
                    !expected_names.contains(c.as_str())
                        && !self.system_columns.contains(c)
                })
                .cloned()
                .collect();

            if !unexpected.is_empty() {
                return Err(SanitizerError::StrictModeViolation {
                    tenant_id: self.tenant_id.to_string(),
                    unexpected,
                });
            }
        }

        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────
    // [SUBTLE-12, 🔴#4] Soft memory telemetry — NOT a hard guarantee.
    // ─────────────────────────────────────────────────────────────────────────

    fn telemetry_memory(&self, context: &str) -> Result<(), SanitizerError> {
        if self.telemetry_memory_mb == 0 {
            return Ok(());
        }
        let mut sys = System::new_with_specifics(
            RefreshKind::new().with_processes(ProcessRefreshKind::new()),
        );
        sys.refresh_processes();
        let pid = get_current_pid().expect("valid pid");
        if let Some(process) = sys.process(pid) {
            let rss_mb = process.memory() as f64 / 1024.0 / 1024.0;
            if rss_mb > self.telemetry_memory_mb as f64 {
                // Soft telemetry only — log and emit audit, but don't kill the process.
                warn!(
                    "[{}] Soft memory limit exceeded at '{}': {:.1f} MB > {} MB",
                    self.tenant_id, context, rss_mb, self.telemetry_memory_mb
                );
                self.audit({
                    let mut entry = AuditEntry::new();
                    entry.insert("event".into(), "memory_telemetry_exceeded".into());
                    entry.insert("context".into(), context.into());
                    entry.insert("rss_mb".into(), rss_mb.into());
                    entry.insert("limit_mb".into(), self.telemetry_memory_mb.into());
                    entry
                });
                // Optionally hard-fail if you truly want:
                // return Err(SanitizerError::MemoryTelemetryExceeded { ... });
            }
        }
        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pipeline orchestration
    // ─────────────────────────────────────────────────────────────────────────

    pub fn build_pipeline(
        &mut self,
        lf: LazyFrame,
        expected_schema: &[ColumnSchema],
        ingestion_schema: Option<&Schema>,
    ) -> Result<(LazyFrame, ExecutionMetrics), SanitizerError> {
        let ingestion_schema = match ingestion_schema {
            Some(s) => s.clone(),
            None => {
                warn!(
                    "[{}] build_pipeline called without ingestion_schema snapshot; \
                     falling back to lf.schema() which may partially evaluate.",
                    self.tenant_id
                );
                lf.schema().map_err(SanitizerError::Polars)?
            }
        };

        let existing_cols: HashSet<String> =
            ingestion_schema.iter_names().map(|n| n.to_string()).collect();
        let fingerprint = compute_schema_fingerprint(&ingestion_schema);

        {
            let mut fp = self.schema_fingerprint.write().unwrap();
            *fp = Some(fingerprint.clone());
        }

        info!(
            "[{}] Schema boundary locked. Fingerprint: {}",
            self.tenant_id, fingerprint
        );

        self.validate_contract(&existing_cols, expected_schema)?;

        let mut metrics = ExecutionMetrics::default();

        let lf = self.sanitize_pii_stage(
            lf,
            expected_schema,
            &existing_cols,
            &fingerprint,
            &mut metrics,
        )?;
        let lf = self.enforce_schema_stage(lf, expected_schema, &existing_cols, &mut metrics);

        Ok((lf, metrics))
    }

    pub fn execute(
        &mut self,
        lf: LazyFrame,
        initial_row_count: usize,
        streaming: Option<bool>,
        metrics: &mut ExecutionMetrics,
    ) -> Result<DataFrame, SanitizerError> {
        let requested_streaming = streaming.unwrap_or(self.streaming_safe);
        let streaming_val = requested_streaming && self.streaming_safe;
        if requested_streaming && !self.streaming_safe {
            warn!(
                "[{}] Streaming disabled: mode '{:?}' requires join-based hashing \
                 (stable/secure) or is explicitly streaming-unsafe.",
                self.tenant_id, self.mode
            );
        }

        self.telemetry_memory("pre-collect")?;

        let exec_start = Instant::now();
        let df = if streaming_val {
            lf.with_streaming(true).collect()?
        } else {
            lf.with_streaming(false).collect()?
        };

        self.telemetry_memory("post-collect")?;

        let final_height = df.height();
        let exec_ms = exec_start.elapsed().as_secs_f64() * 1000.0;

        // [SUBTLE-10] Per-column null rate + PII flag
        let mut per_column = HashMap::new();
        let active_pii = {
            let guard = self.active_pii_columns.read().unwrap();
            guard.clone()
        };

        for series in df.get_columns() {
            let null_count = series.null_count();
            let null_rate = if final_height > 0 {
                null_count as f64 / final_height as f64
            } else {
                0.0
            };
            per_column.insert(
                series.name().to_string(),
                ColumnMetrics {
                    null_count,
                    null_rate,
                    pii: active_pii.contains(series.name()),
                },
            );
        }

        metrics.rows_input = initial_row_count;
        metrics.rows_output = final_height;
        metrics.rows_dropped = initial_row_count.saturating_sub(final_height);
        metrics.pii_cells_transformed =
            if !active_pii.is_empty() && final_height > 0 {
                final_height * active_pii.len()
            } else {
                0
            };
        metrics.total_execution_ms = exec_ms;
        metrics.per_column = per_column;

        info!(
            "[{}] Execution complete. Fingerprint: {:?}. rows_in={} rows_out={} \
             dropped={} pii_cells={} exec_ms={:.2}",
            self.tenant_id,
            self.schema_fingerprint.read().unwrap().as_ref(),
            metrics.rows_input,
            metrics.rows_output,
            metrics.rows_dropped,
            metrics.pii_cells_transformed,
            metrics.total_execution_ms,
        );

        Ok(df)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Backward-compatible surface APIs
    // ─────────────────────────────────────────────────────────────────────────

    pub fn process_batch(
        &mut self,
        df: &DataFrame,
        pii_columns: &[String],
        expected_schema: &HashMap<String, String>,
    ) -> Result<(DataFrame, ExecutionMetrics), SanitizerError> {
        let pii_set: HashSet<String> = pii_columns.iter().cloned().collect();
        let schema_contract: Vec<ColumnSchema> = expected_schema
            .iter()
            .map(|(name, col_type)| ColumnSchema {
                name: name.clone(),
                col_type: normalize_semantic_type(col_type),
                nullable: true,
                pii: pii_set.contains(name),
            })
            .collect();

        let (pipeline, mut metrics) =
            self.build_pipeline(df.clone().lazy(), &schema_contract, Some(&df.schema()))?;

        let result_df = self.execute(pipeline, df.height(), None, &mut metrics)?;
        Ok((result_df, metrics))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Observability export
    // ─────────────────────────────────────────────────────────────────────────

    pub fn export_metrics(&self, metrics: &ExecutionMetrics) -> Value {
        serde_json::json!({
            "tenant_id": self.tenant_id.as_ref(),
            "version": self.version.as_ref(),
            "schema_fingerprint": self.schema_fingerprint.read().unwrap().as_ref(),
            "mode": format!("{:?}", self.mode),
            "strict_mode": self.strict_mode,
            "preserve_unknown_columns": self.preserve_unknown_columns,
            "hash_output_len": self.hash_output_len,
            "metrics": metrics,
            "timestamp_utc": Utc::now().to_rfc3339(),
        })
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Free functions
// ─────────────────────────────────────────────────────────────────────────────

fn map_to_polars_type(col_type: &ColumnType) -> DataType {
    match col_type {
        ColumnType::String => DataType::String,
        ColumnType::Int => DataType::Int64,
        ColumnType::Float => DataType::Float64,
        ColumnType::Bool => DataType::Boolean,
        ColumnType::Date => DataType::Date,
        ColumnType::Datetime => DataType::Datetime(TimeUnit::Microseconds, Some("UTC".into())),
        ColumnType::Currency => DataType::Decimal(Some(18), Some(2)),
    }
}

fn normalize_semantic_type(s: &str) -> ColumnType {
    match s.trim().to_lowercase().as_str() {
        "string" | "varchar" | "text" => ColumnType::String,
        "int" | "integer" | "bigint" | "smallint" => ColumnType::Int,
        "float" | "double" | "double precision" | "real" | "numeric" | "decimal" => {
            ColumnType::Float
        }
        "bool" | "boolean" => ColumnType::Bool,
        "date" => ColumnType::Date,
        "datetime" | "timestamp" => ColumnType::Datetime,
        "currency" => ColumnType::Currency,
        _ => ColumnType::String,
    }
}

fn is_numeric_or_decimal(dtype: &DataType) -> bool {
    matches!(
        dtype,
        DataType::Int64
            | DataType::Decimal(_, _)
            | DataType::Int8
            | DataType::Int16
            | DataType::Int32
            | DataType::UInt8
            | DataType::UInt16
            | DataType::UInt32
            | DataType::UInt64
            | DataType::Float32
            | DataType::Float64
    )
}

/// [🔴#12] Explicit dtype encoding — stable across Polars versions.
fn encode_dtype(dtype: &DataType) -> String {
    match dtype {
        DataType::String => "str".into(),
        DataType::Int64 => "i64".into(),
        DataType::Int32 => "i32".into(),
        DataType::Int16 => "i16".into(),
        DataType::Int8 => "i8".into(),
        DataType::UInt64 => "u64".into(),
        DataType::UInt32 => "u32".into(),
        DataType::UInt16 => "u16".into(),
        DataType::UInt8 => "u8".into(),
        DataType::Float64 => "f64".into(),
        DataType::Float32 => "f32".into(),
        DataType::Boolean => "bool".into(),
        DataType::Date => "date".into(),
        DataType::Datetime(tu, tz) => format!("dt_{:?}_{}", tu, tz.as_deref().unwrap_or("none")),
        DataType::Decimal(p, s) => format!("dec_{:?}_{:?}", p, s),
        DataType::List(inner) => format!("list_{}", encode_dtype(inner)),
        DataType::Struct(fields) => {
            let inner: Vec<String> = fields.iter().map(|f| encode_dtype(&f.dtype)).collect();
            format!("struct_{}", inner.join(","))
        }
        _ => format!("other_{:?}", dtype),
    }
}

fn compute_schema_fingerprint(schema: &Schema) -> String {
    let mut entries: Vec<String> = schema
        .iter_names()
        .map(|name| {
            let dtype = schema.get(name).unwrap();
            format!("{}:{}", name, encode_dtype(dtype))
        })
        .collect();
    entries.sort_unstable();
    let mut hasher = Sha256::new();
    hasher.update(entries.join("|").as_bytes());
    format!("{:x}", hasher.finalize())
}