//! Thread-local error storage. Producers call [`set_last_error`]; the C side
//! pulls the most recent message with [`qe_last_error`].
//!
//! FFI functions that return data convey failure by returning a sentinel
//! (`null` for `*mut c_char` / `*mut Handle`, `-1` for `i32`/`i64`) and
//! stashing the message here. The C++ bridge reads it and throws.

use std::cell::RefCell;
use std::os::raw::c_char;

use crate::ffi_strings::string_to_c;

thread_local! {
    static LAST_ERROR: RefCell<Option<String>> = const { RefCell::new(None) };
}

pub(crate) fn set_last_error(msg: String) {
    LAST_ERROR.with(|e| {
        *e.borrow_mut() = Some(msg);
    });
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
