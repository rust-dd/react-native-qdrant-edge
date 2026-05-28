//! C FFI bindings for `qdrant-edge`, designed for React Native Nitro Modules.
//!
//! Complex types are passed as JSON strings across the FFI boundary. The Rust
//! side deserializes JSON into intermediate types (see [`serde_types`]) and
//! converts to the actual `qdrant_edge` types — many of the core types
//! (`SearchRequest`, `QueryRequest`, …) don't implement `Deserialize` directly.

mod error;
mod ffi_strings;
mod field_index;
mod handle;
mod info;
mod lifecycle;
mod payload;
mod points;
mod retrieve_scroll;
mod search_query;
mod serde_types;

pub use error::qe_last_error;
pub use ffi_strings::qe_free_string;
pub use field_index::{qe_shard_create_field_index, qe_shard_delete_field_index};
pub use handle::QeShardHandle;
pub use info::qe_shard_info;
pub use lifecycle::{
    qe_shard_close, qe_shard_create, qe_shard_flush, qe_shard_load, qe_shard_optimize,
};
pub use payload::{qe_shard_delete_payload, qe_shard_set_payload};
pub use points::{qe_shard_delete_points, qe_shard_upsert};
pub use retrieve_scroll::{qe_shard_count, qe_shard_retrieve, qe_shard_scroll};
pub use search_query::{qe_shard_query, qe_shard_search};
