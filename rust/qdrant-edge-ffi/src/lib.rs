//! C FFI bindings for qdrant-edge, designed for React Native Nitro Modules.
//!
//! Complex types are passed as JSON strings across the FFI boundary.
//! The Rust side deserializes JSON into intermediate types, then converts
//! them to the actual qdrant-edge types (since many core types like
//! SearchRequest/QueryRequest don't implement Deserialize).

use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::path::Path;
use parking_lot::Mutex;

use qdrant_edge::external::serde_json;
use qdrant_edge::{
    CountRequest, EdgeConfig, EdgeShard, Filter, PointStruct, ScrollRequest, UpdateOperation,
    Vector, Vectors,
};
use serde::{Deserialize, Serialize};

/// Opaque handle to an EdgeShard, protected by a Mutex for thread safety.
pub struct QeShardHandle {
    shard: Mutex<Option<EdgeShard>>,
}

unsafe fn cstr_to_str<'a>(ptr: *const c_char) -> &'a str {
    assert!(!ptr.is_null());
    unsafe { CStr::from_ptr(ptr) }.to_str().unwrap_or_default()
}

fn string_to_c(s: String) -> *mut c_char {
    CString::new(s).unwrap_or_default().into_raw()
}

fn error_json(msg: &str) -> *mut c_char {
    let err = serde_json::json!({ "error": msg });
    string_to_c(err.to_string())
}

/// Create a new shard. `config_json` is a JSON-serialized EdgeConfig.
/// Returns an opaque handle, or null on error (check `qe_last_error`).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_create(
    path: *const c_char,
    config_json: *const c_char,
) -> *mut QeShardHandle {
    let path_str = unsafe { cstr_to_str(path) };
    let config_str = unsafe { cstr_to_str(config_json) };

    let config: EdgeConfig = match serde_json::from_str(config_str) {
        Ok(c) => c,
        Err(e) => {
            set_last_error(format!("Failed to parse config: {e}"));
            return std::ptr::null_mut();
        }
    };

    match EdgeShard::new(Path::new(path_str), config) {
        Ok(shard) => Box::into_raw(Box::new(QeShardHandle {
            shard: Mutex::new(Some(shard)),
        })),
        Err(e) => {
            set_last_error(format!("Failed to create shard: {e}"));
            std::ptr::null_mut()
        }
    }
}

/// Load an existing shard from disk. `config_json` can be empty for default.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_load(
    path: *const c_char,
    config_json: *const c_char,
) -> *mut QeShardHandle {
    let path_str = unsafe { cstr_to_str(path) };
    let config_str = unsafe { cstr_to_str(config_json) };

    let config: Option<EdgeConfig> = if config_str.is_empty() {
        None
    } else {
        match serde_json::from_str(config_str) {
            Ok(c) => Some(c),
            Err(e) => {
                set_last_error(format!("Failed to parse config: {e}"));
                return std::ptr::null_mut();
            }
        }
    };

    match EdgeShard::load(Path::new(path_str), config) {
        Ok(shard) => Box::into_raw(Box::new(QeShardHandle {
            shard: Mutex::new(Some(shard)),
        })),
        Err(e) => {
            set_last_error(format!("Failed to load shard: {e}"));
            std::ptr::null_mut()
        }
    }
}

/// Close and free a shard handle. After this call the handle is invalid.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_close(handle: *mut QeShardHandle) {
    if handle.is_null() {
        return;
    }
    let boxed = unsafe { Box::from_raw(handle) };
    // Take the shard out and drop it (which flushes)
    boxed.shard.lock().take();
}

/// Flush pending writes to disk.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_flush(handle: *mut QeShardHandle) {
    with_shard(handle, |shard| {
        shard.flush();
    });
}

/// Run optimizers (merge segments, build HNSW indexes).
/// Returns 1 if something was optimized, 0 if already optimal, -1 on error.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_optimize(handle: *mut QeShardHandle) -> i32 {
    let mut result = -1i32;
    with_shard(handle, |shard| match shard.optimize() {
        Ok(true) => result = 1,
        Ok(false) => result = 0,
        Err(e) => set_last_error(format!("optimize failed: {e}")),
    });
    result
}

/// Upsert points. `points_json` is a JSON array of PointInput objects.
/// Returns 0 on success, -1 on error.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_upsert(
    handle: *mut QeShardHandle,
    points_json: *const c_char,
) -> i32 {
    let json_str = unsafe { cstr_to_str(points_json) };
    let points: Vec<PointInput> = match serde_json::from_str(json_str) {
        Ok(p) => p,
        Err(e) => {
            set_last_error(format!("Failed to parse points: {e}"));
            return -1;
        }
    };

    let point_structs: Vec<_> = match points
        .into_iter()
        .map(|p| p.into_point_struct())
        .collect::<Result<Vec<_>, _>>()
    {
        Ok(ps) => ps,
        Err(e) => {
            set_last_error(format!("Failed to convert points: {e}"));
            return -1;
        }
    };

    let persisted: Vec<_> = point_structs.into_iter().map(|p| p.into()).collect();
    let op = UpdateOperation::PointOperation(qdrant_edge::PointOperations::UpsertPoints(
        qdrant_edge::PointInsertOperations::PointsList(persisted),
    ));

    let mut result = -1i32;
    with_shard(handle, |shard| match shard.update(op) {
        Ok(()) => result = 0,
        Err(e) => set_last_error(format!("upsert failed: {e}")),
    });
    result
}

/// Delete points by IDs. `ids_json` is a JSON array of u64 IDs.
/// Returns 0 on success, -1 on error.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_delete_points(
    handle: *mut QeShardHandle,
    ids_json: *const c_char,
) -> i32 {
    let json_str = unsafe { cstr_to_str(ids_json) };
    let ids: Vec<u64> = match serde_json::from_str(json_str) {
        Ok(i) => i,
        Err(e) => {
            set_last_error(format!("Failed to parse IDs: {e}"));
            return -1;
        }
    };

    let point_ids = ids.into_iter().map(qdrant_edge::PointId::from).collect();
    let op = UpdateOperation::PointOperation(qdrant_edge::PointOperations::DeletePoints {
        ids: point_ids,
    });

    let mut result = -1i32;
    with_shard(handle, |shard| match shard.update(op) {
        Ok(()) => result = 0,
        Err(e) => set_last_error(format!("delete failed: {e}")),
    });
    result
}

/// Set payload on a point.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_set_payload(
    handle: *mut QeShardHandle,
    point_id: u64,
    payload_json: *const c_char,
) -> i32 {
    let json_str = unsafe { cstr_to_str(payload_json) };
    let payload: serde_json::Value = match serde_json::from_str(json_str) {
        Ok(p) => p,
        Err(e) => {
            set_last_error(format!("Failed to parse payload: {e}"));
            return -1;
        }
    };

    let payload_map = match payload.as_object() {
        Some(m) => m.clone().into(),
        None => {
            set_last_error("Payload must be a JSON object".to_string());
            return -1;
        }
    };

    let op = UpdateOperation::PayloadOperation(qdrant_edge::PayloadOps::SetPayload(
        qdrant_edge::SetPayloadOp {
            payload: payload_map,
            points: Some(vec![qdrant_edge::PointId::from(point_id)]),
            filter: None,
            key: None,
        },
    ));

    let mut result = -1i32;
    with_shard(handle, |shard| match shard.update(op) {
        Ok(()) => result = 0,
        Err(e) => set_last_error(format!("set_payload failed: {e}")),
    });
    result
}

/// Delete payload keys from a point.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_delete_payload(
    handle: *mut QeShardHandle,
    point_id: u64,
    keys_json: *const c_char,
) -> i32 {
    let json_str = unsafe { cstr_to_str(keys_json) };
    let keys: Vec<String> = match serde_json::from_str(json_str) {
        Ok(k) => k,
        Err(e) => {
            set_last_error(format!("Failed to parse keys: {e}"));
            return -1;
        }
    };

    let json_paths: Vec<_> = match keys
        .iter()
        .map(|k| {
            qdrant_edge::JsonPath::try_from(k.as_str())
                .map_err(|_| format!("invalid JSON path: {k}"))
        })
        .collect::<Result<Vec<_>, _>>()
    {
        Ok(p) => p,
        Err(e) => {
            set_last_error(e);
            return -1;
        }
    };

    let op = UpdateOperation::PayloadOperation(qdrant_edge::PayloadOps::DeletePayload(
        qdrant_edge::DeletePayloadOp {
            keys: json_paths,
            points: Some(vec![qdrant_edge::PointId::from(point_id)]),
            filter: None,
        },
    ));

    let mut result = -1i32;
    with_shard(handle, |shard| match shard.update(op) {
        Ok(()) => result = 0,
        Err(e) => set_last_error(format!("delete_payload failed: {e}")),
    });
    result
}

/// Create a field index.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_create_field_index(
    handle: *mut QeShardHandle,
    field_name: *const c_char,
    field_type: *const c_char,
) -> i32 {
    let name_str = unsafe { cstr_to_str(field_name) };
    let type_str = unsafe { cstr_to_str(field_type) };

    let field_path = match qdrant_edge::JsonPath::try_from(name_str) {
        Ok(p) => p,
        Err(_) => {
            set_last_error(format!("Invalid field name: {name_str}"));
            return -1;
        }
    };

    let schema = match type_str {
        "keyword" => {
            qdrant_edge::PayloadFieldSchema::FieldType(qdrant_edge::PayloadSchemaType::Keyword)
        }
        "integer" => {
            qdrant_edge::PayloadFieldSchema::FieldType(qdrant_edge::PayloadSchemaType::Integer)
        }
        "float" => {
            qdrant_edge::PayloadFieldSchema::FieldType(qdrant_edge::PayloadSchemaType::Float)
        }
        "geo" => qdrant_edge::PayloadFieldSchema::FieldType(qdrant_edge::PayloadSchemaType::Geo),
        "text" => qdrant_edge::PayloadFieldSchema::FieldType(qdrant_edge::PayloadSchemaType::Text),
        "bool" => qdrant_edge::PayloadFieldSchema::FieldType(qdrant_edge::PayloadSchemaType::Bool),
        "datetime" => {
            qdrant_edge::PayloadFieldSchema::FieldType(qdrant_edge::PayloadSchemaType::Datetime)
        }
        other => {
            set_last_error(format!("Unknown field type: {other}"));
            return -1;
        }
    };

    let op = UpdateOperation::FieldIndexOperation(qdrant_edge::FieldIndexOperations::CreateIndex(
        qdrant_edge::CreateIndex {
            field_name: field_path,
            field_schema: Some(schema),
        },
    ));

    let mut result = -1i32;
    with_shard(handle, |shard| match shard.update(op) {
        Ok(()) => result = 0,
        Err(e) => set_last_error(format!("create_field_index failed: {e}")),
    });
    result
}

/// Delete a field index.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_delete_field_index(
    handle: *mut QeShardHandle,
    field_name: *const c_char,
) -> i32 {
    let name_str = unsafe { cstr_to_str(field_name) };

    let delete_path = match qdrant_edge::JsonPath::try_from(name_str) {
        Ok(p) => p,
        Err(_) => {
            set_last_error(format!("Invalid field name: {name_str}"));
            return -1;
        }
    };
    let op = UpdateOperation::FieldIndexOperation(qdrant_edge::FieldIndexOperations::DeleteIndex(
        delete_path,
    ));

    let mut result = -1i32;
    with_shard(handle, |shard| match shard.update(op) {
        Ok(()) => result = 0,
        Err(e) => set_last_error(format!("delete_field_index failed: {e}")),
    });
    result
}

/// Search for nearest neighbors. Returns JSON string with results.
/// The caller must free the returned string with `qe_free_string`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_search(
    handle: *mut QeShardHandle,
    request_json: *const c_char,
) -> *mut c_char {
    let json_str = unsafe { cstr_to_str(request_json) };
    let req: SearchInput = match serde_json::from_str(json_str) {
        Ok(r) => r,
        Err(e) => return error_json(&format!("Failed to parse search request: {e}")),
    };

    let search_req = match req.into_search_request() {
        Ok(r) => r,
        Err(e) => return error_json(&format!("Failed to build search request: {e}")),
    };

    let mut result_ptr = error_json("shard not available");
    with_shard(handle, |shard| {
        #[allow(deprecated)]
        match shard.search(search_req) {
            Ok(results) => {
                let output: Vec<ScoredPointOutput> =
                    results.into_iter().map(ScoredPointOutput::from).collect();
                result_ptr = string_to_c(serde_json::to_string(&output).unwrap_or_default());
            }
            Err(e) => {
                result_ptr = error_json(&format!("search failed: {e}"));
            }
        }
    });
    result_ptr
}

/// Full query with prefetches and fusion. Returns JSON string.
/// The caller must free the returned string with `qe_free_string`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_query(
    handle: *mut QeShardHandle,
    request_json: *const c_char,
) -> *mut c_char {
    let json_str = unsafe { cstr_to_str(request_json) };
    let req: QueryInput = match serde_json::from_str(json_str) {
        Ok(r) => r,
        Err(e) => return error_json(&format!("Failed to parse query request: {e}")),
    };

    let query_req = match req.into_query_request() {
        Ok(r) => r,
        Err(e) => return error_json(&format!("Failed to build query request: {e}")),
    };

    let mut result_ptr = error_json("shard not available");
    with_shard(handle, |shard| match shard.query(query_req) {
        Ok(results) => {
            let output: Vec<ScoredPointOutput> =
                results.into_iter().map(ScoredPointOutput::from).collect();
            result_ptr = string_to_c(serde_json::to_string(&output).unwrap_or_default());
        }
        Err(e) => {
            result_ptr = error_json(&format!("query failed: {e}"));
        }
    });
    result_ptr
}

/// Retrieve specific points by IDs. Returns JSON string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_retrieve(
    handle: *mut QeShardHandle,
    ids_json: *const c_char,
    with_payload: bool,
    with_vector: bool,
) -> *mut c_char {
    let json_str = unsafe { cstr_to_str(ids_json) };
    let ids: Vec<u64> = match serde_json::from_str(json_str) {
        Ok(i) => i,
        Err(e) => return error_json(&format!("Failed to parse IDs: {e}")),
    };

    let point_ids: Vec<qdrant_edge::PointId> =
        ids.into_iter().map(qdrant_edge::PointId::from).collect();

    let wp = Some(qdrant_edge::WithPayloadInterface::Bool(with_payload));
    let wv = Some(qdrant_edge::WithVector::Bool(with_vector));

    let mut result_ptr = error_json("shard not available");
    with_shard(handle, |shard| match shard.retrieve(&point_ids, wp, wv) {
        Ok(records) => {
            let output: Vec<RecordOutput> = records.into_iter().map(RecordOutput::from).collect();
            result_ptr = string_to_c(serde_json::to_string(&output).unwrap_or_default());
        }
        Err(e) => {
            result_ptr = error_json(&format!("retrieve failed: {e}"));
        }
    });
    result_ptr
}

/// Scroll through points. Returns JSON string with { points, next_offset }.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_scroll(
    handle: *mut QeShardHandle,
    request_json: *const c_char,
) -> *mut c_char {
    let json_str = unsafe { cstr_to_str(request_json) };
    let req: ScrollRequest = match serde_json::from_str(json_str) {
        Ok(r) => r,
        Err(e) => return error_json(&format!("Failed to parse scroll request: {e}")),
    };

    let mut result_ptr = error_json("shard not available");
    with_shard(handle, |shard| match shard.scroll(req) {
        Ok((records, next_offset)) => {
            let output = ScrollOutput {
                points: records.into_iter().map(RecordOutput::from).collect(),
                next_offset: next_offset.map(|id| format!("{id}")),
            };
            result_ptr = string_to_c(serde_json::to_string(&output).unwrap_or_default());
        }
        Err(e) => {
            result_ptr = error_json(&format!("scroll failed: {e}"));
        }
    });
    result_ptr
}

/// Count points, optionally with a filter. Returns count or -1 on error.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_count(
    handle: *mut QeShardHandle,
    filter_json: *const c_char,
) -> i64 {
    let json_str = unsafe { cstr_to_str(filter_json) };
    let filter: Option<Filter> = if json_str.is_empty() {
        None
    } else {
        match serde_json::from_str(json_str) {
            Ok(f) => Some(f),
            Err(e) => {
                set_last_error(format!("Failed to parse filter: {e}"));
                return -1;
            }
        }
    };

    let req = CountRequest {
        filter,
        exact: true,
    };

    let mut result = -1i64;
    with_shard(handle, |shard| match shard.count(req) {
        Ok(count) => result = count as i64,
        Err(e) => set_last_error(format!("count failed: {e}")),
    });
    result
}

/// Get shard info. Returns JSON string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_info(handle: *mut QeShardHandle) -> *mut c_char {
    let mut result_ptr = error_json("shard not available");
    with_shard(handle, |shard| {
        let info = shard.info();
        let output = ShardInfoOutput {
            segments_count: info.segments_count,
            points_count: info.points_count,
            indexed_vectors_count: info.indexed_vectors_count,
        };
        result_ptr = string_to_c(serde_json::to_string(&output).unwrap_or_default());
    });
    result_ptr
}

/// Free a string returned by any qe_ function.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        drop(unsafe { CString::from_raw(ptr) });
    }
}

/// Get the last error message. Returns null if no error. Caller must free with qe_free_string.
#[unsafe(no_mangle)]
pub extern "C" fn qe_last_error() -> *mut c_char {
    LAST_ERROR.with(|e| match e.borrow_mut().take() {
        Some(msg) => string_to_c(msg),
        None => std::ptr::null_mut(),
    })
}

thread_local! {
    static LAST_ERROR: std::cell::RefCell<Option<String>> = const { std::cell::RefCell::new(None) };
}

fn set_last_error(msg: String) {
    LAST_ERROR.with(|e| {
        *e.borrow_mut() = Some(msg);
    });
}

fn with_shard(handle: *mut QeShardHandle, f: impl FnOnce(&EdgeShard)) {
    if handle.is_null() {
        set_last_error("null shard handle".to_string());
        return;
    }
    let h = unsafe { &*handle };
    let guard = h.shard.lock();
    if let Some(shard) = guard.as_ref() {
        f(shard);
    } else {
        set_last_error("shard is closed".to_string());
    }
}

/// JSON-deserializable point input.
#[derive(Deserialize)]
struct PointInput {
    id: u64,
    /// Either a flat vector [f32, ...] or named vectors { "name": [f32, ...] }
    vector: VectorInput,
    #[serde(default)]
    payload: Option<serde_json::Value>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum VectorInput {
    Dense(Vec<f32>),
    Named(HashMap<String, Vec<f32>>),
}

impl PointInput {
    fn into_point_struct(self) -> Result<PointStruct, String> {
        let vectors: Vectors = match self.vector {
            VectorInput::Dense(v) => Vectors::from(v),
            VectorInput::Named(map) => {
                Vectors::new_named(map.into_iter().map(|(k, v)| (k, Vector::new_dense(v))))
            }
        };
        let payload = self
            .payload
            .unwrap_or(serde_json::Value::Object(Default::default()));
        Ok(PointStruct::new(self.id, vectors, payload))
    }
}

/// JSON-deserializable search request (since CoreSearchRequest doesn't impl Deserialize).
#[derive(Deserialize)]
struct SearchInput {
    /// Query vector
    vector: Vec<f32>,
    /// Optional vector name (for named vectors)
    #[serde(default)]
    using: Option<String>,
    #[serde(default)]
    filter: Option<Filter>,
    #[serde(default = "default_limit")]
    limit: usize,
    #[serde(default)]
    offset: usize,
    #[serde(default)]
    with_payload: Option<bool>,
    #[serde(default)]
    with_vector: Option<bool>,
    #[serde(default)]
    score_threshold: Option<f32>,
}

fn default_limit() -> usize {
    10
}

impl SearchInput {
    fn into_search_request(self) -> Result<qdrant_edge::SearchRequest, String> {
        let query = qdrant_edge::QueryEnum::Nearest(qdrant_edge::NamedQuery {
            query: qdrant_edge::VectorInternal::Dense(self.vector.into()),
            using: self.using,
        });
        Ok(qdrant_edge::SearchRequest {
            query,
            filter: self.filter,
            params: None,
            limit: self.limit,
            offset: self.offset,
            with_payload: self
                .with_payload
                .map(qdrant_edge::WithPayloadInterface::Bool),
            with_vector: self.with_vector.map(qdrant_edge::WithVector::Bool),
            score_threshold: self.score_threshold,
        })
    }
}

/// JSON-deserializable query request (since ShardQueryRequest doesn't impl Deserialize).
#[derive(Deserialize)]
struct QueryInput {
    /// Query vector for nearest search
    #[serde(default)]
    vector: Option<Vec<f32>>,
    /// Optional vector name
    #[serde(default)]
    using: Option<String>,
    #[serde(default)]
    filter: Option<Filter>,
    #[serde(default = "default_limit")]
    limit: usize,
    #[serde(default)]
    offset: usize,
    #[serde(default)]
    with_payload: Option<bool>,
    #[serde(default)]
    with_vector: Option<bool>,
    #[serde(default)]
    score_threshold: Option<f32>,
    /// Fusion mode: "rrf" or "dbsf"
    #[serde(default)]
    fusion: Option<String>,
}

impl QueryInput {
    fn into_query_request(self) -> Result<qdrant_edge::QueryRequest, String> {
        let scoring_query = if let Some(vec) = self.vector {
            let query_enum = qdrant_edge::QueryEnum::Nearest(qdrant_edge::NamedQuery {
                query: qdrant_edge::VectorInternal::Dense(vec.into()),
                using: self.using,
            });
            Some(qdrant_edge::ScoringQuery::Vector(query_enum))
        } else if let Some(fusion) = &self.fusion {
            let f = match fusion.as_str() {
                "rrf" => qdrant_edge::Fusion::Rrf {
                    k: 60,
                    weights: None,
                },
                "dbsf" => qdrant_edge::Fusion::Dbsf,
                other => return Err(format!("Unknown fusion mode: {other}")),
            };
            Some(qdrant_edge::ScoringQuery::Fusion(f))
        } else {
            None
        };

        let score_threshold = self
            .score_threshold
            .map(qdrant_edge::external::ordered_float::OrderedFloat);

        Ok(qdrant_edge::QueryRequest {
            prefetches: vec![],
            query: scoring_query,
            filter: self.filter,
            score_threshold,
            limit: self.limit,
            offset: self.offset,
            params: None,
            with_vector: self
                .with_vector
                .map(qdrant_edge::WithVector::Bool)
                .unwrap_or(qdrant_edge::WithVector::Bool(false)),
            with_payload: self
                .with_payload
                .map(qdrant_edge::WithPayloadInterface::Bool)
                .unwrap_or(qdrant_edge::WithPayloadInterface::Bool(true)),
        })
    }
}

/// Convert VectorStructInternal to JSON Value manually (it doesn't impl Serialize).
fn vector_struct_to_json(v: qdrant_edge::VectorStructInternal) -> serde_json::Value {
    match v {
        qdrant_edge::VectorStructInternal::Single(dense) => serde_json::json!(dense),
        qdrant_edge::VectorStructInternal::MultiDense(md) => {
            // MultiDense is a vector of dense vectors
            serde_json::json!(md.into_multi_vectors())
        }
        qdrant_edge::VectorStructInternal::Named(map) => {
            let obj: serde_json::Map<String, serde_json::Value> = map
                .into_iter()
                .map(|(name, vi)| {
                    let val = match vi {
                        qdrant_edge::VectorInternal::Dense(d) => serde_json::json!(d),
                        qdrant_edge::VectorInternal::Sparse(s) => serde_json::json!({
                            "indices": s.indices,
                            "values": s.values,
                        }),
                        qdrant_edge::VectorInternal::MultiDense(md) => {
                            serde_json::json!(md.into_multi_vectors())
                        }
                    };
                    (name, val)
                })
                .collect();
            serde_json::Value::Object(obj)
        }
    }
}

/// JSON-serializable output for ScoredPoint.
#[derive(Serialize)]
struct ScoredPointOutput {
    id: String,
    score: f32,
    version: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    payload: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    vector: Option<serde_json::Value>,
}

impl From<qdrant_edge::ScoredPoint> for ScoredPointOutput {
    fn from(sp: qdrant_edge::ScoredPoint) -> Self {
        ScoredPointOutput {
            id: format!("{}", sp.id),
            score: sp.score,
            version: sp.version,
            payload: sp
                .payload
                .map(|p| serde_json::to_value(p).unwrap_or_default()),
            vector: sp.vector.map(vector_struct_to_json),
        }
    }
}

/// JSON-serializable output for Record (which doesn't impl Serialize).
#[derive(Serialize)]
struct RecordOutput {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    payload: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    vector: Option<serde_json::Value>,
}

impl From<qdrant_edge::Record> for RecordOutput {
    fn from(r: qdrant_edge::Record) -> Self {
        RecordOutput {
            id: format!("{}", r.id),
            payload: r
                .payload
                .map(|p| serde_json::to_value(p).unwrap_or_default()),
            vector: r.vector.map(vector_struct_to_json),
        }
    }
}

/// JSON-serializable scroll output.
#[derive(Serialize)]
struct ScrollOutput {
    points: Vec<RecordOutput>,
    #[serde(skip_serializing_if = "Option::is_none")]
    next_offset: Option<String>,
}

/// JSON-serializable shard info output.
#[derive(Serialize)]
struct ShardInfoOutput {
    segments_count: usize,
    points_count: usize,
    indexed_vectors_count: usize,
}
