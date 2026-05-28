//! Runtime shard config setters and dynamic vector-name operations.
//!
//! `VectorNameOperations` is not publicly re-exported from `qdrant_edge`, so
//! we feed the variant inner JSON into the public `UpdateOperation` enum
//! (which is `#[serde(untagged, rename_all = "snake_case")]`).

use std::os::raw::c_char;

use qdrant_edge::external::serde_json;
use qdrant_edge::{EdgeOptimizersConfig, HnswIndexConfig};

use crate::error::set_last_error;
use crate::ffi_strings::cstr_to_str;
use crate::handle::{QeShardHandle, with_shard};

/// Set the global HNSW config and persist. Returns 0/-1.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_set_hnsw_config(
    handle: *mut QeShardHandle,
    config_json: *const c_char,
) -> i32 {
    let cfg: HnswIndexConfig = match serde_json::from_str(unsafe { cstr_to_str(config_json) }) {
        Ok(c) => c,
        Err(e) => {
            set_last_error(format!("Failed to parse HNSW config: {e}"));
            return -1;
        }
    };
    let mut result = -1i32;
    with_shard(handle, |shard| match shard.set_hnsw_config(cfg) {
        Ok(()) => result = 0,
        Err(e) => set_last_error(format!("set_hnsw_config failed: {e}")),
    });
    result
}

/// Set the HNSW config for a single named vector and persist. Returns 0/-1.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_set_vector_hnsw_config(
    handle: *mut QeShardHandle,
    vector_name: *const c_char,
    config_json: *const c_char,
) -> i32 {
    let name = unsafe { cstr_to_str(vector_name) };
    let cfg: HnswIndexConfig = match serde_json::from_str(unsafe { cstr_to_str(config_json) }) {
        Ok(c) => c,
        Err(e) => {
            set_last_error(format!("Failed to parse HNSW config: {e}"));
            return -1;
        }
    };
    let mut result = -1i32;
    with_shard(handle, |shard| match shard.set_vector_hnsw_config(name, cfg) {
        Ok(()) => result = 0,
        Err(e) => set_last_error(format!("set_vector_hnsw_config failed: {e}")),
    });
    result
}

/// Set the optimizers config and persist. Returns 0/-1.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_set_optimizers_config(
    handle: *mut QeShardHandle,
    config_json: *const c_char,
) -> i32 {
    let cfg: EdgeOptimizersConfig = match serde_json::from_str(unsafe { cstr_to_str(config_json) })
    {
        Ok(c) => c,
        Err(e) => {
            set_last_error(format!("Failed to parse optimizers config: {e}"));
            return -1;
        }
    };
    let mut result = -1i32;
    with_shard(handle, |shard| match shard.set_optimizers_config(cfg.clone()) {
        Ok(()) => result = 0,
        Err(e) => set_last_error(format!("set_optimizers_config failed: {e}")),
    });
    result
}

/// Add a new named vector slot. `op_json` is the `CreateVectorName` inner shape
/// `{"vector_name": "...", "config": { "dense": { ... } | "sparse": { ... } }}`.
/// Returns 0/-1.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_create_vector_name(
    handle: *mut QeShardHandle,
    op_json: *const c_char,
) -> i32 {
    let inner = unsafe { cstr_to_str(op_json) };
    let outer = format!(r#"{{"create_vector_name":{inner}}}"#);
    apply_update(handle, &outer, "create_vector_name")
}

/// Delete a named vector slot. Returns 0/-1.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_delete_vector_name(
    handle: *mut QeShardHandle,
    vector_name: *const c_char,
) -> i32 {
    let name = unsafe { cstr_to_str(vector_name) };
    let json_name = serde_json::to_string(name).unwrap_or_else(|_| "\"\"".to_string());
    let outer = format!(r#"{{"delete_vector_name":{{"vector_name":{json_name}}}}}"#);
    apply_update(handle, &outer, "delete_vector_name")
}

fn apply_update(handle: *mut QeShardHandle, op_json: &str, op_name: &str) -> i32 {
    let op: qdrant_edge::UpdateOperation = match serde_json::from_str(op_json) {
        Ok(o) => o,
        Err(e) => {
            set_last_error(format!("Failed to parse {op_name}: {e}"));
            return -1;
        }
    };
    let mut result = -1i32;
    with_shard(handle, |shard| match shard.update(op.clone()) {
        Ok(()) => result = 0,
        Err(e) => set_last_error(format!("{op_name} failed: {e}")),
    });
    result
}
