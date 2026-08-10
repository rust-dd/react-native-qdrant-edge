//! Query-groups — group the results of a query by a payload field.
//!
//! The grouping driver only fetches the `group_by` field while collecting, so
//! the requested payload/vector hydration happens here via a follow-up
//! retrieve, mirroring the qdrant server behavior.

use std::collections::HashMap;
use std::os::raw::c_char;
use std::ptr;

use qdrant_edge::external::serde_json;
use qdrant_edge::{EdgeShard, EdgeShardRead, OperationResult, PointId, RetrieveRequest};

use crate::error::set_last_error;
use crate::ffi_strings::{cstr_to_str, string_to_c};
use crate::handle::{QeShardHandle, with_shard};
use crate::serde_types::{GroupOutput, GroupsInput, ScoredPointOutput};

/// Group query results by a payload field. Returns a JSON array of
/// `{ key, hits }` groups, or `null` on error.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qe_shard_query_groups(
    handle: *mut QeShardHandle,
    request_json: *const c_char,
) -> *mut c_char {
    let json_str = unsafe { cstr_to_str(request_json) };
    let input: GroupsInput = match serde_json::from_str(json_str) {
        Ok(r) => r,
        Err(e) => {
            set_last_error(format!("Failed to parse query groups request: {e}"));
            return ptr::null_mut();
        }
    };

    let (with_payload, with_vector) = input.hydration();
    let group_req = match input.into_group_request() {
        Ok(r) => r,
        Err(e) => {
            set_last_error(format!("Failed to build query groups request: {e}"));
            return ptr::null_mut();
        }
    };

    let mut result_ptr: *mut c_char = ptr::null_mut();
    with_shard(handle, |shard| match shard.query_groups(group_req) {
        Ok(groups) => match hydrate_groups(shard, groups, with_payload, with_vector) {
            Ok(output) => {
                result_ptr = string_to_c(serde_json::to_string(&output).unwrap_or_default());
            }
            Err(e) => {
                set_last_error(format!("query groups hydration failed: {e}"));
            }
        },
        Err(e) => {
            set_last_error(format!("query groups failed: {e}"));
        }
    });
    result_ptr
}

/// Replace the driver-shaped hit payloads (only the `group_by` field) with the
/// caller-requested payload/vector selection, fetched in one retrieve pass.
fn hydrate_groups(
    shard: &EdgeShard,
    groups: Vec<qdrant_edge::Group>,
    with_payload: bool,
    with_vector: bool,
) -> OperationResult<Vec<GroupOutput>> {
    let hydrated: HashMap<PointId, (Option<serde_json::Value>, Option<serde_json::Value>)> =
        if with_payload || with_vector {
            let point_ids: Vec<PointId> = groups
                .iter()
                .flat_map(|g| g.hits.iter().map(|h| h.id))
                .collect();
            let records = shard.retrieve(RetrieveRequest {
                point_ids,
                with_payload: Some(qdrant_edge::WithPayloadInterface::Bool(with_payload)),
                with_vector: Some(qdrant_edge::WithVector::Bool(with_vector)),
            })?;
            records
                .into_iter()
                .map(|r| {
                    let payload = r.payload.map(|p| serde_json::to_value(p).unwrap_or_default());
                    let vector = r.vector.map(crate::serde_types::vector_struct_to_json);
                    (r.id, (payload, vector))
                })
                .collect()
        } else {
            HashMap::new()
        };

    let output = groups
        .into_iter()
        .map(|group| {
            let hits = group
                .hits
                .into_iter()
                .map(|hit| {
                    let (payload, vector) = hydrated.get(&hit.id).cloned().unwrap_or_default();
                    ScoredPointOutput {
                        id: format!("{}", hit.id),
                        score: hit.score,
                        version: hit.version,
                        payload,
                        vector,
                    }
                })
                .collect();
            GroupOutput {
                key: serde_json::to_value(&group.key).unwrap_or_default(),
                hits,
            }
        })
        .collect();
    Ok(output)
}
