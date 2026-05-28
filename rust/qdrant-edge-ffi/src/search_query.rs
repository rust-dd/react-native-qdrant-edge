//! Nearest-neighbor search and full query operations.
//!
//! Returns `null` on error after stashing the message via [`set_last_error`];
//! the C++ bridge converts this into a thrown exception.

use std::os::raw::c_char;
use std::ptr;

use qdrant_edge::external::serde_json;

use crate::error::set_last_error;
use crate::ffi_strings::{cstr_to_str, string_to_c};
use crate::handle::{QeShardHandle, with_shard};
use crate::serde_types::{QueryInput, ScoredPointOutput, SearchInput};

/// Nearest-neighbor search. Returns a JSON array of scored points, or `null` on error.
/// The caller must free the returned string with `qe_free_string`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_search(
    handle: *mut QeShardHandle,
    request_json: *const c_char,
) -> *mut c_char {
    let json_str = unsafe { cstr_to_str(request_json) };
    let req: SearchInput = match serde_json::from_str(json_str) {
        Ok(r) => r,
        Err(e) => {
            set_last_error(format!("Failed to parse search request: {e}"));
            return ptr::null_mut();
        }
    };

    let search_req = match req.into_search_request() {
        Ok(r) => r,
        Err(e) => {
            set_last_error(format!("Failed to build search request: {e}"));
            return ptr::null_mut();
        }
    };

    let mut result_ptr: *mut c_char = ptr::null_mut();
    with_shard(handle, |shard| {
        // `EdgeShard::search` is deprecated upstream in favor of `query`; we
        // keep the entry point and route through it in a later commit.
        #[allow(deprecated)]
        match shard.search(search_req) {
            Ok(results) => {
                let output: Vec<ScoredPointOutput> =
                    results.into_iter().map(ScoredPointOutput::from).collect();
                result_ptr = string_to_c(serde_json::to_string(&output).unwrap_or_default());
            }
            Err(e) => {
                set_last_error(format!("search failed: {e}"));
            }
        }
    });
    result_ptr
}

/// Full query with prefetches and fusion. Returns a JSON array of scored points,
/// or `null` on error. The caller must free the returned string with `qe_free_string`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_query(
    handle: *mut QeShardHandle,
    request_json: *const c_char,
) -> *mut c_char {
    let json_str = unsafe { cstr_to_str(request_json) };
    let req: QueryInput = match serde_json::from_str(json_str) {
        Ok(r) => r,
        Err(e) => {
            set_last_error(format!("Failed to parse query request: {e}"));
            return ptr::null_mut();
        }
    };

    let query_req = match req.into_query_request() {
        Ok(r) => r,
        Err(e) => {
            set_last_error(format!("Failed to build query request: {e}"));
            return ptr::null_mut();
        }
    };

    let mut result_ptr: *mut c_char = ptr::null_mut();
    with_shard(handle, |shard| match shard.query(query_req) {
        Ok(results) => {
            let output: Vec<ScoredPointOutput> =
                results.into_iter().map(ScoredPointOutput::from).collect();
            result_ptr = string_to_c(serde_json::to_string(&output).unwrap_or_default());
        }
        Err(e) => {
            set_last_error(format!("query failed: {e}"));
        }
    });
    result_ptr
}
