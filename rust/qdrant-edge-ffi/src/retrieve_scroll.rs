//! Retrieve, scroll, and count operations.
//!
//! `retrieve` and `scroll` return `null` on error after stashing the message
//! via [`set_last_error`]; `count` returns `-1`. The C++ bridge converts both
//! sentinels into thrown exceptions.

use std::os::raw::c_char;
use std::ptr;

use qdrant_edge::external::serde_json;
use qdrant_edge::{CountRequest, Filter, PointId, ScrollRequest};

use crate::error::set_last_error;
use crate::ffi_strings::{cstr_to_str, string_to_c};
use crate::handle::{QeShardHandle, with_shard};
use crate::serde_types::{RecordOutput, ScrollOutput};

/// Retrieve specific points by IDs. Returns JSON, or `null` on error.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_retrieve(
    handle: *mut QeShardHandle,
    ids_json: *const c_char,
    with_payload: bool,
    with_vector: bool,
) -> *mut c_char {
    let json_str = unsafe { cstr_to_str(ids_json) };
    let point_ids: Vec<PointId> = match serde_json::from_str(json_str) {
        Ok(i) => i,
        Err(e) => {
            set_last_error(format!("Failed to parse IDs: {e}"));
            return ptr::null_mut();
        }
    };

    let wp = Some(qdrant_edge::WithPayloadInterface::Bool(with_payload));
    let wv = Some(qdrant_edge::WithVector::Bool(with_vector));

    let mut result_ptr: *mut c_char = ptr::null_mut();
    with_shard(handle, |shard| match shard.retrieve(&point_ids, wp, wv) {
        Ok(records) => {
            let output: Vec<RecordOutput> = records.into_iter().map(RecordOutput::from).collect();
            result_ptr = string_to_c(serde_json::to_string(&output).unwrap_or_default());
        }
        Err(e) => {
            set_last_error(format!("retrieve failed: {e}"));
        }
    });
    result_ptr
}

/// Scroll through points. Returns JSON `{ points, next_offset }`, or `null` on error.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_scroll(
    handle: *mut QeShardHandle,
    request_json: *const c_char,
) -> *mut c_char {
    let json_str = unsafe { cstr_to_str(request_json) };
    let req: ScrollRequest = match serde_json::from_str(json_str) {
        Ok(r) => r,
        Err(e) => {
            set_last_error(format!("Failed to parse scroll request: {e}"));
            return ptr::null_mut();
        }
    };

    let mut result_ptr: *mut c_char = ptr::null_mut();
    with_shard(handle, |shard| match shard.scroll(req) {
        Ok((records, next_offset)) => {
            let output = ScrollOutput {
                points: records.into_iter().map(RecordOutput::from).collect(),
                next_offset: next_offset.map(|id| format!("{id}")),
            };
            result_ptr = string_to_c(serde_json::to_string(&output).unwrap_or_default());
        }
        Err(e) => {
            set_last_error(format!("scroll failed: {e}"));
        }
    });
    result_ptr
}

/// Count points, optionally with a filter. Returns count or `-1` on error.
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
