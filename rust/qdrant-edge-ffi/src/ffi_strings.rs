//! Tiny helpers for crossing the C string boundary.

use std::ffi::{CStr, CString};
use std::os::raw::c_char;

pub(crate) unsafe fn cstr_to_str<'a>(ptr: *const c_char) -> &'a str {
    assert!(!ptr.is_null());
    unsafe { CStr::from_ptr(ptr) }.to_str().unwrap_or_default()
}

pub(crate) fn string_to_c(s: String) -> *mut c_char {
    CString::new(s).unwrap_or_default().into_raw()
}

/// Free a string returned by any `qe_*` function.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        drop(unsafe { CString::from_raw(ptr) });
    }
}
