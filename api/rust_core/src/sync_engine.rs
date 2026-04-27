// lib.rs
use pyo3::prelude::*;
use pyo3::types::PyDict;
use pyo3_polars::{PyDataFrame, PyLazyFrame};
use std::collections::HashSet;

// Import our core logic
pub mod data_sanitizer;
use data_sanitizer::{ColumnSchema, ColumnType, DataSanitizer};

/// This is the Python wrapper for our Rust struct. 
/// #[pyclass] tells PyO3 to expose this as a native Python class.
#[pyclass(name = "DataSanitizer")]
pub struct PyDataSanitizer {
    inner: DataSanitizer,
}

#[pymethods]
impl PyDataSanitizer {
    /// The Python __init__ constructor
    #[new]
    fn new(tenant_id: String, version: String, mode: &str, strict_mode: bool) -> PyResult<Self> {
        let inner = DataSanitizer::new(tenant_id, version, mode, strict_mode)
            .map_err(|e| pyo3::exceptions::PyValueError::new_err(e))?;
        Ok(Self { inner })
    }

    /// The core execution engine exposed to Python.
    /// Notice how it accepts `PyLazyFrame` and returns `PyDataFrame` — zero-copy memory transfer!
    #[pyo3(signature = (lf, expected_schema_py, ingestion_schema_names, initial_row_count))]
    fn execute_pipeline(
        &mut self,
        lf: PyLazyFrame,
        expected_schema_py: Vec<&PyDict>,
        ingestion_schema_names: Vec<String>,
        initial_row_count: usize,
    ) -> PyResult<PyDataFrame> {
        // 1. Translate Python dicts into strict Rust Schemas
        let mut expected_schema = Vec::new();
        for dict in expected_schema_py {
            let name: String = dict.get_item("name").unwrap().unwrap().extract()?;
            let type_str: String = dict.get_item("type").unwrap().unwrap().extract()?;
            let nullable: bool = dict.get_item("nullable").unwrap().unwrap().extract()?;
            let pii: bool = dict.get_item("pii").unwrap().unwrap().extract()?;

            let col_type = match type_str.to_lowercase().as_str() {
                "string" => ColumnType::String,
                "int" => ColumnType::Int,
                "float" => ColumnType::Float,
                "bool" => ColumnType::Bool,
                "date" => ColumnType::Date,
                "datetime" => ColumnType::Datetime,
                "currency" => ColumnType::Currency,
                _ => ColumnType::String,
            };

            expected_schema.push(ColumnSchema {
                name,
                col_type,
                nullable,
                pii,
            });
        }

        let existing_cols: HashSet<String> = ingestion_schema_names.into_iter().collect();

        // 2. Validate Zero-Trust Contract
        self.inner
            .validate_contract(&existing_cols, &expected_schema)
            .map_err(|e| pyo3::exceptions::PyValueError::new_err(e))?;

        // 3. Build the Lazy DAG
        let mut lazy_frame = lf.into();
        lazy_frame = self.inner.sanitize_pii(lazy_frame, &expected_schema, &existing_cols);
        lazy_frame = self.inner.enforce_schema(lazy_frame, &expected_schema, &existing_cols);

        // 4. Materialize and Extract Lineage
        let df = self.inner
            .execute(lazy_frame, initial_row_count)
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e.to_string()))?;

        // 5. Hand back to Python safely
        Ok(PyDataFrame(df))
    }

    /// Exposes the strictly typed Rust metrics as a native Python dictionary
    fn export_metrics(&self, py: Python) -> PyResult<PyObject> {
        let metrics_json = serde_json::to_string(&self.inner.metrics)
            .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e.to_string()))?;

        // Fast zero-copy JSON parse directly into Python's native dict
        let json_module = PyModule::import(py, "json")?;
        let loads_func = json_module.getattr("loads")?;
        let py_dict = loads_func.call1((metrics_json,))?;

        Ok(py_dict.into())
    }
}

/// The master module initialization
#[pymodule]
fn dataomen_core(_py: Python, m: &PyModule) -> PyResult<()> {
    // Registers the class so `from dataomen_core import DataSanitizer` works natively
    m.add_class::<PyDataSanitizer>()?;
    Ok(())
}