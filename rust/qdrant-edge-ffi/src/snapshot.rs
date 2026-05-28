//! Snapshot interop — read the current shard's manifest, unpack a snapshot
//! directory in place, and recover a shard from a partial snapshot.

use std::os::raw::c_char;
use std::path::Path;
use std::ptr;

use parking_lot::Mutex;
use qdrant_edge::EdgeShard;
use qdrant_edge::external::serde_json;
use qdrant_edge::internal::SnapshotManifest;

use crate::error::set_last_error;
use crate::ffi_strings::{cstr_to_str, string_to_c};
use crate::handle::{QeShardHandle, with_shard};

/// Read this shard's snapshot manifest. Returns JSON, or null on error.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_snapshot_manifest(handle: *mut QeShardHandle) -> *mut c_char {
    let mut result_ptr: *mut c_char = ptr::null_mut();
    with_shard(handle, |shard| match shard.snapshot_manifest() {
        Ok(manifest) => {
            result_ptr = string_to_c(serde_json::to_string(&manifest).unwrap_or_default());
        }
        Err(e) => {
            set_last_error(format!("snapshot_manifest failed: {e}"));
        }
    });
    result_ptr
}

/// Unpack a snapshot archive into a directory. Returns 0 on success, -1 on error.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_unpack_snapshot(
    snapshot_path: *const c_char,
    target_path: *const c_char,
) -> i32 {
    let snapshot = unsafe { cstr_to_str(snapshot_path) };
    let target = unsafe { cstr_to_str(target_path) };
    match EdgeShard::unpack_snapshot(Path::new(snapshot), Path::new(target)) {
        Ok(()) => 0,
        Err(e) => {
            set_last_error(format!("unpack_snapshot failed: {e}"));
            -1
        }
    }
}

/// Recover a shard from a partial snapshot. Both manifests are JSON. Returns
/// a new shard handle (the supplied `shard_path` becomes the live shard), or
/// null on error.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_recover_partial_snapshot(
    shard_path: *const c_char,
    current_manifest_json: *const c_char,
    snapshot_path: *const c_char,
    snapshot_manifest_json: *const c_char,
) -> *mut QeShardHandle {
    let shard_p = unsafe { cstr_to_str(shard_path) };
    let snapshot_p = unsafe { cstr_to_str(snapshot_path) };

    let current: SnapshotManifest = match serde_json::from_str(unsafe {
        cstr_to_str(current_manifest_json)
    }) {
        Ok(m) => m,
        Err(e) => {
            set_last_error(format!("Failed to parse current manifest: {e}"));
            return ptr::null_mut();
        }
    };

    let snapshot: SnapshotManifest = match serde_json::from_str(unsafe {
        cstr_to_str(snapshot_manifest_json)
    }) {
        Ok(m) => m,
        Err(e) => {
            set_last_error(format!("Failed to parse snapshot manifest: {e}"));
            return ptr::null_mut();
        }
    };

    match EdgeShard::recover_partial_snapshot(
        Path::new(shard_p),
        &current,
        Path::new(snapshot_p),
        &snapshot,
    ) {
        Ok(shard) => Box::into_raw(Box::new(QeShardHandle {
            shard: Mutex::new(Some(shard)),
        })),
        Err(e) => {
            set_last_error(format!("recover_partial_snapshot failed: {e}"));
            ptr::null_mut()
        }
    }
}
