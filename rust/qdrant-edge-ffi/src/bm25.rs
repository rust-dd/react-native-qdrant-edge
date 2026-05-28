//! BM25 sparse embedding — text in, sparse vector out.
//!
//! `EdgeBm25` (from upstream `qdrant_edge::bm25_embed`) is stateless past
//! construction; we own the handle, the caller embeds many texts against it
//! and `qe_bm25_destroy` frees it. The model is reusable across shards.

use std::os::raw::c_char;
use std::ptr;

use qdrant_edge::bm25_embed::{EdgeBm25, EdgeBm25Config};
use qdrant_edge::external::serde_json;
use serde::Serialize;

use crate::error::set_last_error;
use crate::ffi_strings::{cstr_to_str, string_to_c};

/// Opaque handle to an `EdgeBm25` model.
pub struct QeBm25Handle {
    bm25: EdgeBm25,
}

/// Construct a BM25 embedder from a JSON `EdgeBm25Config`. Empty input uses defaults.
/// Returns an opaque handle, or null on error (check `qe_last_error`).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_bm25_create(config_json: *const c_char) -> *mut QeBm25Handle {
    let config_str = unsafe { cstr_to_str(config_json) };
    let config: EdgeBm25Config = if config_str.is_empty() {
        EdgeBm25Config::default()
    } else {
        match serde_json::from_str(config_str) {
            Ok(c) => c,
            Err(e) => {
                set_last_error(format!("Failed to parse BM25 config: {e}"));
                return ptr::null_mut();
            }
        }
    };

    match EdgeBm25::new(config) {
        Ok(bm25) => Box::into_raw(Box::new(QeBm25Handle { bm25 })),
        Err(e) => {
            set_last_error(format!("Failed to create BM25 model: {e}"));
            ptr::null_mut()
        }
    }
}

/// Free a BM25 handle.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_bm25_destroy(handle: *mut QeBm25Handle) {
    if handle.is_null() {
        return;
    }
    drop(unsafe { Box::from_raw(handle) });
}

/// Embed a query: each unique token weighted `1.0`.
/// Returns JSON `{ indices: number[], values: number[] }`, or null on error.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_bm25_embed_query(
    handle: *mut QeBm25Handle,
    text: *const c_char,
) -> *mut c_char {
    let Some(bm25) = (unsafe { bm25_ref(handle) }) else { return ptr::null_mut() };
    let text_str = unsafe { cstr_to_str(text) };
    serialize_sparse(bm25.embed_query(text_str))
}

/// Embed a document: each unique token weighted by the BM25 TF formula.
/// Returns JSON `{ indices: number[], values: number[] }`, or null on error.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_bm25_embed_document(
    handle: *mut QeBm25Handle,
    text: *const c_char,
) -> *mut c_char {
    let Some(bm25) = (unsafe { bm25_ref(handle) }) else { return ptr::null_mut() };
    let text_str = unsafe { cstr_to_str(text) };
    serialize_sparse(bm25.embed_document(text_str))
}

#[derive(Serialize)]
struct SparseOutput {
    indices: Vec<u32>,
    values: Vec<f32>,
}

fn serialize_sparse(sparse: qdrant_edge::SparseVector) -> *mut c_char {
    let out = SparseOutput {
        indices: sparse.indices,
        values: sparse.values,
    };
    string_to_c(serde_json::to_string(&out).unwrap_or_default())
}

unsafe fn bm25_ref<'a>(handle: *mut QeBm25Handle) -> Option<&'a EdgeBm25> {
    if handle.is_null() {
        set_last_error("null bm25 handle".to_string());
        return None;
    }
    Some(unsafe { &(*handle).bm25 })
}
