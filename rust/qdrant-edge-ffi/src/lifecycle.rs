//! Shard creation, loading, closing, flushing, and optimization.

use std::os::raw::c_char;
use std::path::Path;

use parking_lot::Mutex;
use qdrant_edge::external::serde_json;
use qdrant_edge::{EdgeConfig, EdgeShard};

use crate::error::set_last_error;
use crate::ffi_strings::cstr_to_str;
use crate::handle::{QeShardHandle, with_shard};

/// Create a new shard. `config_json` is a JSON-serialized `EdgeConfig`.
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

/// Load an existing shard from disk. `config_json` can be empty for the stored default.
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
    // Take the shard out and drop it (which flushes).
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
