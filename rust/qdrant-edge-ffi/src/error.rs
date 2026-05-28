//! Thread-local error storage. Producers call `set_last_error`; the C side
//! pulls the most recent message with `qe_last_error`.

use std::cell::RefCell;
use std::os::raw::c_char;

use qdrant_edge::external::serde_json;

use crate::ffi_strings::string_to_c;

thread_local! {
    static LAST_ERROR: RefCell<Option<String>> = const { RefCell::new(None) };
}

pub(crate) fn set_last_error(msg: String) {
    LAST_ERROR.with(|e| {
        *e.borrow_mut() = Some(msg);
    });
}

pub(crate) fn error_json(msg: &str) -> *mut c_char {
    let err = serde_json::json!({ "error": msg });
    string_to_c(err.to_string())
}

/// Get the last error message. Returns null if no error.
/// Caller must free the returned string with `qe_free_string`.
#[unsafe(no_mangle)]
pub extern "C" fn qe_last_error() -> *mut c_char {
    LAST_ERROR.with(|e| match e.borrow_mut().take() {
        Some(msg) => string_to_c(msg),
        None => std::ptr::null_mut(),
    })
}
