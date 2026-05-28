//! Payload field index create and delete operations.

use std::os::raw::c_char;

use qdrant_edge::UpdateOperation;

use crate::error::set_last_error;
use crate::ffi_strings::cstr_to_str;
use crate::handle::{QeShardHandle, with_shard};

/// Create a field index.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_create_field_index(
    handle: *mut QeShardHandle,
    field_name: *const c_char,
    field_type: *const c_char,
) -> i32 {
    let name_str = unsafe { cstr_to_str(field_name) };
    let type_str = unsafe { cstr_to_str(field_type) };

    let field_path = match qdrant_edge::JsonPath::try_from(name_str) {
        Ok(p) => p,
        Err(_) => {
            set_last_error(format!("Invalid field name: {name_str}"));
            return -1;
        }
    };

    let schema = match type_str {
        "keyword" => {
            qdrant_edge::PayloadFieldSchema::FieldType(qdrant_edge::PayloadSchemaType::Keyword)
        }
        "integer" => {
            qdrant_edge::PayloadFieldSchema::FieldType(qdrant_edge::PayloadSchemaType::Integer)
        }
        "float" => {
            qdrant_edge::PayloadFieldSchema::FieldType(qdrant_edge::PayloadSchemaType::Float)
        }
        "geo" => qdrant_edge::PayloadFieldSchema::FieldType(qdrant_edge::PayloadSchemaType::Geo),
        "text" => qdrant_edge::PayloadFieldSchema::FieldType(qdrant_edge::PayloadSchemaType::Text),
        "bool" => qdrant_edge::PayloadFieldSchema::FieldType(qdrant_edge::PayloadSchemaType::Bool),
        "datetime" => {
            qdrant_edge::PayloadFieldSchema::FieldType(qdrant_edge::PayloadSchemaType::Datetime)
        }
        other => {
            set_last_error(format!("Unknown field type: {other}"));
            return -1;
        }
    };

    let op = UpdateOperation::FieldIndexOperation(qdrant_edge::FieldIndexOperations::CreateIndex(
        qdrant_edge::CreateIndex {
            field_name: field_path,
            field_schema: Some(schema),
        },
    ));

    let mut result = -1i32;
    with_shard(handle, |shard| match shard.update(op) {
        Ok(()) => result = 0,
        Err(e) => set_last_error(format!("create_field_index failed: {e}")),
    });
    result
}

/// Delete a field index.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_delete_field_index(
    handle: *mut QeShardHandle,
    field_name: *const c_char,
) -> i32 {
    let name_str = unsafe { cstr_to_str(field_name) };

    let delete_path = match qdrant_edge::JsonPath::try_from(name_str) {
        Ok(p) => p,
        Err(_) => {
            set_last_error(format!("Invalid field name: {name_str}"));
            return -1;
        }
    };
    let op = UpdateOperation::FieldIndexOperation(qdrant_edge::FieldIndexOperations::DeleteIndex(
        delete_path,
    ));

    let mut result = -1i32;
    with_shard(handle, |shard| match shard.update(op) {
        Ok(()) => result = 0,
        Err(e) => set_last_error(format!("delete_field_index failed: {e}")),
    });
    result
}
