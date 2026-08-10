//! FFI-level round-trip tests against a real shard in a temp directory.
//! Exercised through the `extern "C"` surface with C strings, exactly as the
//! C++ bridge drives it.

use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::path::PathBuf;

use qdrant_edge::external::serde_json::{self, Value, json};

use crate::*;

struct TempShardDir(PathBuf);

impl TempShardDir {
    fn new() -> Self {
        let dir = std::env::temp_dir().join(format!("qe-ffi-test-{}", uuid::Uuid::new_v4()));
        // `EdgeShard::new` creates `wal/` and `segments/` inside an existing
        // directory but not the shard directory itself; the app layer owns that.
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }

    fn path_cstring(&self) -> CString {
        CString::new(self.0.to_str().unwrap()).unwrap()
    }
}

impl Drop for TempShardDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn cstr(s: &str) -> CString {
    CString::new(s).unwrap()
}

fn take_json(ptr: *mut c_char) -> Value {
    assert!(!ptr.is_null(), "FFI returned null: {}", last_error());
    let s = unsafe { CStr::from_ptr(ptr) }.to_str().unwrap().to_owned();
    unsafe { qe_free_string(ptr) };
    serde_json::from_str(&s).unwrap()
}

fn last_error() -> String {
    let ptr = unsafe { qe_last_error() };
    if ptr.is_null() {
        return "<no error>".to_owned();
    }
    let s = unsafe { CStr::from_ptr(ptr) }.to_str().unwrap().to_owned();
    unsafe { qe_free_string(ptr) };
    s
}

fn create_test_shard(dir: &TempShardDir) -> *mut QeShardHandle {
    let config = json!({
        "vectors": { "": { "size": 4, "distance": "Cosine" } },
        "sparse_vectors": { "bm25": { "modifier": "idf" } },
        "wal_options": { "segment_capacity": 1_048_576, "segment_queue_len": 0, "retain_closed": 1 },
    });
    let path = dir.path_cstring();
    let config_json = cstr(&config.to_string());
    let handle = unsafe { qe_shard_create(path.as_ptr(), config_json.as_ptr()) };
    assert!(!handle.is_null(), "create failed: {}", last_error());
    handle
}

fn upsert_fixture_points(handle: *mut QeShardHandle) {
    let points = json!([
        { "id": 1, "vector": [1.0, 0.0, 0.0, 0.0], "payload": { "category": "alpha", "rank": 1 } },
        { "id": 2, "vector": [0.0, 1.0, 0.0, 0.0], "payload": { "category": "beta", "rank": 2 } },
        { "id": 3, "vector": [0.9, 0.1, 0.0, 0.0], "payload": { "category": "alpha", "rank": 3 } },
    ]);
    let points_json = cstr(&points.to_string());
    let rc = unsafe { qe_shard_upsert(handle, points_json.as_ptr()) };
    assert_eq!(rc, 0, "upsert failed: {}", last_error());
}

#[test]
fn search_and_query_round_trip() {
    let dir = TempShardDir::new();
    let handle = create_test_shard(&dir);
    upsert_fixture_points(handle);

    let req = cstr(&json!({ "vector": [1.0, 0.0, 0.0, 0.0], "limit": 2, "with_payload": true }).to_string());
    let results = take_json(unsafe { qe_shard_search(handle, req.as_ptr()) });
    let hits = results.as_array().unwrap();
    assert_eq!(hits.len(), 2);
    assert_eq!(hits[0]["id"], "1");
    assert_eq!(hits[1]["id"], "3");
    assert_eq!(hits[0]["payload"]["category"], "alpha");

    let bare = cstr(&json!({ "vector": [1.0, 0.0, 0.0, 0.0], "limit": 1 }).to_string());
    let results = take_json(unsafe { qe_shard_search(handle, bare.as_ptr()) });
    let bare_hit = &results.as_array().unwrap()[0];
    assert!(bare_hit.get("payload").is_none(), "search defaults to no payload");
    assert!(bare_hit.get("vector").is_none(), "search defaults to no vector");

    let req = cstr(&json!({ "query": [0.0, 1.0, 0.0, 0.0], "limit": 1 }).to_string());
    let results = take_json(unsafe { qe_shard_query(handle, req.as_ptr()) });
    assert_eq!(results.as_array().unwrap()[0]["id"], "2");

    let legacy = cstr(&json!({ "vector": [0.0, 1.0, 0.0, 0.0], "limit": 1 }).to_string());
    let results = take_json(unsafe { qe_shard_query(handle, legacy.as_ptr()) });
    assert_eq!(results.as_array().unwrap()[0]["id"], "2");

    unsafe { qe_shard_close(handle) };
}

#[test]
fn scroll_count_facet_info_round_trip() {
    let dir = TempShardDir::new();
    let handle = create_test_shard(&dir);
    upsert_fixture_points(handle);

    let field = cstr("category");
    let field_type = cstr("keyword");
    let rc = unsafe { qe_shard_create_field_index(handle, field.as_ptr(), field_type.as_ptr()) };
    assert_eq!(rc, 0, "create_field_index failed: {}", last_error());

    let req = cstr(&json!({ "limit": 10, "with_payload": true }).to_string());
    let scroll = take_json(unsafe { qe_shard_scroll(handle, req.as_ptr()) });
    assert_eq!(scroll["points"].as_array().unwrap().len(), 3);
    assert!(scroll.get("next_offset").is_none());

    let empty = cstr("");
    assert_eq!(unsafe { qe_shard_count(handle, empty.as_ptr()) }, 3);
    let filter = cstr(
        &json!({ "must": [{ "key": "category", "match": { "value": "alpha" } }] }).to_string(),
    );
    assert_eq!(unsafe { qe_shard_count(handle, filter.as_ptr()) }, 2);

    let req = cstr(&json!({ "key": "category" }).to_string());
    let facet = take_json(unsafe { qe_shard_facet(handle, req.as_ptr()) });
    let hits = facet["hits"].as_array().unwrap();
    assert_eq!(hits.len(), 2);
    assert_eq!(hits[0]["value"], "alpha");
    assert_eq!(hits[0]["count"], 2);

    let info = take_json(unsafe { qe_shard_info(handle) });
    assert_eq!(info["points_count"], 3);
    assert!(info["segments_count"].as_u64().unwrap() >= 1);
    assert_eq!(info["payload_schema"]["category"]["data_type"], "keyword");

    assert_eq!(unsafe { qe_shard_flush(handle) }, 0);
    unsafe { qe_shard_close(handle) };
}

#[test]
fn search_params_pass_through() {
    let dir = TempShardDir::new();
    let handle = create_test_shard(&dir);
    upsert_fixture_points(handle);

    let req = cstr(
        &json!({
            "vector": [1.0, 0.0, 0.0, 0.0],
            "limit": 2,
            "params": { "exact": true, "hnsw_ef": 64 },
        })
        .to_string(),
    );
    let results = take_json(unsafe { qe_shard_search(handle, req.as_ptr()) });
    assert_eq!(results.as_array().unwrap()[0]["id"], "1");

    let sparse_points = json!([
        { "id": 10, "vector": { "bm25": { "indices": [7, 42], "values": [1.0, 1.0] } }, "payload": { "category": "sparse" } },
        { "id": 11, "vector": { "bm25": { "indices": [42], "values": [1.0] } }, "payload": { "category": "sparse" } },
    ]);
    let points_json = cstr(&sparse_points.to_string());
    assert_eq!(unsafe { qe_shard_upsert(handle, points_json.as_ptr()) }, 0);

    // `idf` is only valid against a sparse vector with the IDF modifier.
    let req = cstr(
        &json!({
            "query": { "indices": [7], "values": [1.0] },
            "using": "bm25",
            "limit": 1,
            "params": { "indexed_only": false, "idf": "global" },
        })
        .to_string(),
    );
    let results = take_json(unsafe { qe_shard_query(handle, req.as_ptr()) });
    assert_eq!(results.as_array().unwrap()[0]["id"], "10");

    unsafe { qe_shard_close(handle) };
}

#[test]
fn query_groups_by_payload_field() {
    let dir = TempShardDir::new();
    let handle = create_test_shard(&dir);
    upsert_fixture_points(handle);

    let req = cstr(
        &json!({
            "query": [1.0, 0.0, 0.0, 0.0],
            "group_by": "category",
            "limit": 2,
            "group_size": 2,
            "with_payload": true,
        })
        .to_string(),
    );
    let groups = take_json(unsafe { qe_shard_query_groups(handle, req.as_ptr()) });
    let groups = groups.as_array().unwrap();
    assert_eq!(groups.len(), 2);
    assert_eq!(groups[0]["key"], "alpha");
    assert_eq!(groups[1]["key"], "beta");

    let alpha_hits = groups[0]["hits"].as_array().unwrap();
    assert_eq!(alpha_hits.len(), 2);
    assert_eq!(alpha_hits[0]["id"], "1");
    assert_eq!(alpha_hits[0]["payload"]["rank"], 1, "hits are hydrated with full payload");
    assert_eq!(groups[1]["hits"].as_array().unwrap().len(), 1);

    let req = cstr(
        &json!({
            "query": [1.0, 0.0, 0.0, 0.0],
            "group_by": "category",
            "limit": 1,
            "with_payload": false,
        })
        .to_string(),
    );
    let groups = take_json(unsafe { qe_shard_query_groups(handle, req.as_ptr()) });
    let hit = &groups.as_array().unwrap()[0]["hits"][0];
    assert!(hit.get("payload").is_none(), "payload off leaves hits bare");

    unsafe { qe_shard_close(handle) };
}

#[test]
fn search_matrix_over_sampled_points() {
    let dir = TempShardDir::new();
    let handle = create_test_shard(&dir);
    upsert_fixture_points(handle);

    let req = cstr(&json!({ "sample": 3, "limit": 2 }).to_string());
    let matrix = take_json(unsafe { qe_shard_search_matrix(handle, req.as_ptr()) });
    let sample_ids = matrix["sample_ids"].as_array().unwrap();
    let nearests = matrix["nearests"].as_array().unwrap();
    assert_eq!(sample_ids.len(), 3);
    assert_eq!(nearests.len(), 3);
    for row in nearests {
        let row = row.as_array().unwrap();
        assert!(!row.is_empty() && row.len() <= 2);
    }

    unsafe { qe_shard_close(handle) };
}

#[test]
fn retrieve_by_ids_preserves_order_and_payload() {
    let dir = TempShardDir::new();
    let handle = create_test_shard(&dir);
    upsert_fixture_points(handle);

    let ids = cstr(&json!([3, 1]).to_string());
    let ptr = unsafe { qe_shard_retrieve(handle, ids.as_ptr(), true, false) };
    let records = take_json(ptr);
    let records = records.as_array().unwrap();
    assert_eq!(records.len(), 2);
    assert_eq!(records[0]["id"], "3");
    assert_eq!(records[1]["id"], "1");
    assert_eq!(records[0]["payload"]["rank"], 3);
    assert!(records[0].get("vector").is_none());

    unsafe { qe_shard_close(handle) };
}
