//! Runtime shard config setters and dynamic vector-name operations.

use std::os::raw::c_char;

use qdrant_edge::external::serde_json;
use qdrant_edge::{
    CreateVectorName, DeleteVectorName, EdgeOptimizersConfig, UpdateOperation,
    VectorNameOperations,
};
use validator::Validate;

use crate::error::set_last_error;
use crate::ffi_strings::cstr_to_str;
use crate::handle::{QeShardHandle, with_shard};
use crate::serde_types::parse_hnsw_config;

/// Set the global HNSW config and persist; omitted fields take upstream
/// defaults. Returns 0/-1.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_set_hnsw_config(
    handle: *mut QeShardHandle,
    config_json: *const c_char,
) -> i32 {
    let cfg = match parse_hnsw_config(unsafe { cstr_to_str(config_json) }) {
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
    let cfg = match parse_hnsw_config(unsafe { cstr_to_str(config_json) }) {
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

/// Add a new named vector slot. `op_json` is the `CreateVectorName` shape
/// `{"vector_name": "...", "config": { "dense": { ... } | "sparse": { ... } }}`.
/// Returns 0/-1.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_create_vector_name(
    handle: *mut QeShardHandle,
    op_json: *const c_char,
) -> i32 {
    let create: CreateVectorName = match serde_json::from_str(unsafe { cstr_to_str(op_json) }) {
        Ok(c) => c,
        Err(e) => {
            set_last_error(format!("Failed to parse create_vector_name: {e}"));
            return -1;
        }
    };
    // Upstream validates only at its REST layer; an invalid config that reaches
    // the WAL fails every later write until the shard is reopened.
    if let Err(e) = create.config.validate() {
        set_last_error(format!("create_vector_name failed: {e}"));
        return -1;
    }
    apply_update(
        handle,
        VectorNameOperations::CreateVectorName(create),
        "create_vector_name",
    )
}

/// Delete a named vector slot. Returns 0/-1.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_delete_vector_name(
    handle: *mut QeShardHandle,
    vector_name: *const c_char,
) -> i32 {
    let vector_name = unsafe { cstr_to_str(vector_name) }.to_string();
    apply_update(
        handle,
        VectorNameOperations::DeleteVectorName(DeleteVectorName { vector_name }),
        "delete_vector_name",
    )
}

fn apply_update(handle: *mut QeShardHandle, op: VectorNameOperations, op_name: &str) -> i32 {
    let mut result = -1i32;
    with_shard(handle, |shard| {
        match shard.update(UpdateOperation::VectorNameOperation(op)) {
            Ok(()) => result = 0,
            Err(e) => set_last_error(format!("{op_name} failed: {e}")),
        }
    });
    result
}
