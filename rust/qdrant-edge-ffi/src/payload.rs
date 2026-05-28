//! Payload set and delete operations.

use std::os::raw::c_char;

use qdrant_edge::UpdateOperation;
use qdrant_edge::external::serde_json;

use crate::error::set_last_error;
use crate::ffi_strings::cstr_to_str;
use crate::handle::{QeShardHandle, with_shard};

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
