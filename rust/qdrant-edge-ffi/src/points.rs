//! Point upsert and delete operations.

use std::os::raw::c_char;

use qdrant_edge::external::serde_json;
use qdrant_edge::{PointId, UpdateOperation};

use crate::error::set_last_error;
use crate::ffi_strings::cstr_to_str;
use crate::handle::{QeShardHandle, with_shard};
use crate::serde_types::PointInput;

/// Upsert points. `points_json` is a JSON array of `PointInput` objects.
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

/// Delete points by IDs. `ids_json` is a JSON array; each element is a u64 or
/// a UUID string. Returns 0 on success, -1 on error.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_delete_points(
    handle: *mut QeShardHandle,
    ids_json: *const c_char,
) -> i32 {
    let json_str = unsafe { cstr_to_str(ids_json) };
    let ids: Vec<PointId> = match serde_json::from_str(json_str) {
        Ok(i) => i,
        Err(e) => {
            set_last_error(format!("Failed to parse IDs: {e}"));
            return -1;
        }
    };

    let op = UpdateOperation::PointOperation(qdrant_edge::PointOperations::DeletePoints { ids });

    let mut result = -1i32;
    with_shard(handle, |shard| match shard.update(op) {
        Ok(()) => result = 0,
        Err(e) => set_last_error(format!("delete failed: {e}")),
    });
    result
}
