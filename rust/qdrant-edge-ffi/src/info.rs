//! Shard info query.

use std::os::raw::c_char;

use qdrant_edge::external::serde_json;

use crate::error::error_json;
use crate::ffi_strings::string_to_c;
use crate::handle::{QeShardHandle, with_shard};
use crate::serde_types::ShardInfoOutput;

/// Get shard info. Returns a JSON string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_info(handle: *mut QeShardHandle) -> *mut c_char {
    let mut result_ptr = error_json("shard not available");
    with_shard(handle, |shard| {
        let info = shard.info();
        let output = ShardInfoOutput {
            segments_count: info.segments_count,
            points_count: info.points_count,
            indexed_vectors_count: info.indexed_vectors_count,
        };
        result_ptr = string_to_c(serde_json::to_string(&output).unwrap_or_default());
    });
    result_ptr
}
