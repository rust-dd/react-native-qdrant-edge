//! Payload operations: set, overwrite, delete keys, clear all.
//!
//! Each FFI function takes a single JSON op shape; the TS layer wraps the
//! common single-point case but the full upstream `SetPayloadOp` /
//! `DeletePayloadOp` shape (with optional `points`, `filter`, `key`) is
//! always available.

use std::os::raw::c_char;

use qdrant_edge::external::serde_json;
use qdrant_edge::{
    DeletePayloadOp, Filter, PayloadOps, PointId, SetPayloadOp, UpdateOperation,
};
use serde::Deserialize;

use crate::error::set_last_error;
use crate::ffi_strings::cstr_to_str;
use crate::handle::{QeShardHandle, with_shard};

/// Set (merge) payload fields. `op_json`: `{ payload, points?, filter?, key? }`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_set_payload(
    handle: *mut QeShardHandle,
    op_json: *const c_char,
) -> i32 {
    apply::<SetPayloadOp>(handle, op_json, "set_payload", PayloadOps::SetPayload)
}

/// Overwrite payload entirely. Same JSON shape as set_payload.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_overwrite_payload(
    handle: *mut QeShardHandle,
    op_json: *const c_char,
) -> i32 {
    apply::<SetPayloadOp>(
        handle,
        op_json,
        "overwrite_payload",
        PayloadOps::OverwritePayload,
    )
}

/// Delete specific payload keys. `op_json`: `{ keys, points?, filter? }`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_delete_payload(
    handle: *mut QeShardHandle,
    op_json: *const c_char,
) -> i32 {
    apply::<DeletePayloadOp>(
        handle,
        op_json,
        "delete_payload",
        PayloadOps::DeletePayload,
    )
}

#[derive(Deserialize)]
#[serde(untagged)]
enum ClearTarget {
    Points { points: Vec<PointId> },
    ByFilter { filter: Filter },
}

/// Clear all payload from a set of points or by filter.
/// `target_json`: `{ points: [...] }` OR `{ filter: ... }`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_clear_payload(
    handle: *mut QeShardHandle,
    target_json: *const c_char,
) -> i32 {
    let json_str = unsafe { cstr_to_str(target_json) };
    let target: ClearTarget = match serde_json::from_str(json_str) {
        Ok(t) => t,
        Err(e) => {
            set_last_error(format!("Failed to parse clear_payload target: {e}"));
            return -1;
        }
    };
    let payload_op = match target {
        ClearTarget::Points { points } => PayloadOps::ClearPayload { points },
        ClearTarget::ByFilter { filter } => PayloadOps::ClearPayloadByFilter(filter),
    };
    let op = UpdateOperation::PayloadOperation(payload_op);
    let mut result = -1i32;
    with_shard(handle, |shard| match shard.update(op) {
        Ok(()) => result = 0,
        Err(e) => set_last_error(format!("clear_payload failed: {e}")),
    });
    result
}

fn apply<T: for<'de> Deserialize<'de>>(
    handle: *mut QeShardHandle,
    op_json: *const c_char,
    op_name: &str,
    wrap: impl FnOnce(T) -> PayloadOps,
) -> i32 {
    let json_str = unsafe { cstr_to_str(op_json) };
    let parsed: T = match serde_json::from_str(json_str) {
        Ok(p) => p,
        Err(e) => {
            set_last_error(format!("Failed to parse {op_name}: {e}"));
            return -1;
        }
    };
    let op = UpdateOperation::PayloadOperation(wrap(parsed));
    let mut result = -1i32;
    with_shard(handle, |shard| match shard.update(op) {
        Ok(()) => result = 0,
        Err(e) => set_last_error(format!("{op_name} failed: {e}")),
    });
    result
}
