//! Facet queries — count points per unique value of a payload key.

use std::os::raw::c_char;
use std::ptr;

use qdrant_edge::external::serde_json;
use qdrant_edge::{FacetRequest, FacetValue};
use serde::Serialize;
use uuid::Uuid;

use crate::error::set_last_error;
use crate::ffi_strings::{cstr_to_str, string_to_c};
use crate::handle::{QeShardHandle, with_shard};

/// Count points per unique value of the requested payload key.
/// Returns JSON `{ hits: [{ value, count }] }`, or null on error.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_facet(
    handle: *mut QeShardHandle,
    request_json: *const c_char,
) -> *mut c_char {
    let json_str = unsafe { cstr_to_str(request_json) };
    let req: FacetRequest = match serde_json::from_str(json_str) {
        Ok(r) => r,
        Err(e) => {
            set_last_error(format!("Failed to parse facet request: {e}"));
            return ptr::null_mut();
        }
    };

    let mut result_ptr: *mut c_char = ptr::null_mut();
    with_shard(handle, |shard| match shard.facet(req) {
        Ok(response) => {
            let output = FacetResponseOutput {
                hits: response
                    .hits
                    .into_iter()
                    .map(|h| FacetHitOutput {
                        value: facet_value_to_json(h.value),
                        count: h.count,
                    })
                    .collect(),
            };
            result_ptr = string_to_c(serde_json::to_string(&output).unwrap_or_default());
        }
        Err(e) => {
            set_last_error(format!("facet failed: {e}"));
        }
    });
    result_ptr
}

#[derive(Serialize)]
struct FacetResponseOutput {
    hits: Vec<FacetHitOutput>,
}

#[derive(Serialize)]
struct FacetHitOutput {
    value: serde_json::Value,
    count: usize,
}

fn facet_value_to_json(v: FacetValue) -> serde_json::Value {
    match v {
        FacetValue::Keyword(s) => serde_json::Value::String(s),
        FacetValue::Int(i) => serde_json::json!(i),
        // UUID stored as u128; render as canonical hyphenated string so JS callers can match.
        FacetValue::Uuid(u) => serde_json::Value::String(Uuid::from_u128(u).to_string()),
        FacetValue::Bool(b) => serde_json::Value::Bool(b),
    }
}
