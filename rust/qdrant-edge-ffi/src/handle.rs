//! Opaque shard handle and the locking helper used to access it.

use parking_lot::Mutex;
use qdrant_edge::EdgeShard;

use crate::error::set_last_error;

/// Opaque handle to an `EdgeShard`, protected by a Mutex for thread safety.
pub struct QeShardHandle {
    pub(crate) shard: Mutex<Option<EdgeShard>>,
}

pub(crate) fn with_shard(handle: *mut QeShardHandle, f: impl FnOnce(&EdgeShard)) {
    if handle.is_null() {
        set_last_error("null shard handle".to_string());
        return;
    }
    let h = unsafe { &*handle };
    let guard = h.shard.lock();
    if let Some(shard) = guard.as_ref() {
        f(shard);
    } else {
        set_last_error("shard is closed".to_string());
    }
}
