//! Search matrix — sample points and find each sample's nearest neighbours
//! within the sampled set. Useful for on-device dedup and clustering.

use std::os::raw::c_char;
use std::ptr;

use qdrant_edge::EdgeShardRead;
use qdrant_edge::external::serde_json;

use crate::error::set_last_error;
use crate::ffi_strings::{cstr_to_str, string_to_c};
use crate::handle::{QeShardHandle, with_shard};
use crate::serde_types::{MatrixInput, ScoredPointOutput, SearchMatrixOutput};

/// Pairwise distance matrix over a random sample of points. Returns JSON
/// `{ sample_ids, nearests }` where `nearests[i]` are the neighbours of
/// `sample_ids[i]` within the sample, or `null` on error.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_search_matrix(
    handle: *mut QeShardHandle,
    request_json: *const c_char,
) -> *mut c_char {
    let json_str = unsafe { cstr_to_str(request_json) };
    let input: MatrixInput = match serde_json::from_str(json_str) {
        Ok(r) => r,
        Err(e) => {
            set_last_error(format!("Failed to parse search matrix request: {e}"));
            return ptr::null_mut();
        }
    };

    let mut result_ptr: *mut c_char = ptr::null_mut();
    with_shard(handle, |shard| {
        match shard.search_matrix(input.into_matrix_request()) {
            Ok(response) => {
                let output = SearchMatrixOutput {
                    sample_ids: response
                        .sample_ids
                        .into_iter()
                        .map(|id| format!("{id}"))
                        .collect(),
                    nearests: response
                        .nearests
                        .into_iter()
                        .map(|row| row.into_iter().map(ScoredPointOutput::from).collect())
                        .collect(),
                };
                result_ptr = string_to_c(serde_json::to_string(&output).unwrap_or_default());
            }
            Err(e) => {
                set_last_error(format!("search matrix failed: {e}"));
            }
        }
    });
    result_ptr
}
