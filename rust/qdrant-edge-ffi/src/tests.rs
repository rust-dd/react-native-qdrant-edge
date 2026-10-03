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
    let ptr = qe_last_error();
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
fn new_filter_conditions_and_ordered_scroll() {
    let dir = TempShardDir::new();
    let handle = create_test_shard(&dir);
    upsert_fixture_points(handle);

    let prefix = cstr(
        &json!({ "must": [{ "key": "category", "match": { "prefix": "al" } }] }).to_string(),
    );
    assert_eq!(unsafe { qe_shard_count(handle, prefix.as_ptr()) }, 2);

    let has_vector = cstr(&json!({ "must": [{ "has_vector": "" }] }).to_string());
    assert_eq!(unsafe { qe_shard_count(handle, has_vector.as_ptr()) }, 3);

    let slice_union: i64 = (0..2)
        .map(|index| {
            let filter = cstr(
                &json!({ "must": [{ "slice": { "total": 2, "index": index } }] }).to_string(),
            );
            unsafe { qe_shard_count(handle, filter.as_ptr()) }
        })
        .sum();
    assert_eq!(slice_union, 3, "disjoint slices cover every point exactly once");

    let field = cstr("rank");
    let field_type = cstr("integer");
    assert_eq!(
        unsafe { qe_shard_create_field_index(handle, field.as_ptr(), field_type.as_ptr()) },
        0
    );
    let req = cstr(
        &json!({
            "limit": 10,
            "with_payload": true,
            "order_by": { "key": "rank", "direction": "desc" },
        })
        .to_string(),
    );
    let scroll = take_json(unsafe { qe_shard_scroll(handle, req.as_ptr()) });
    let points = scroll["points"].as_array().unwrap();
    assert_eq!(points.len(), 3);
    assert_eq!(points[0]["payload"]["rank"], 3);
    assert_eq!(points[2]["payload"]["rank"], 1);

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


#[test]
fn stringified_point_ids_are_accepted_back() {
    let dir = TempShardDir::new();
    let handle = create_test_shard(&dir);
    upsert_fixture_points(handle);

    let req = cstr(&json!({ "limit": 2 }).to_string());
    let page = take_json(unsafe { qe_shard_scroll(handle, req.as_ptr()) });
    assert_eq!(page["next_offset"], "3");
    let req = cstr(&json!({ "limit": 2, "offset": page["next_offset"] }).to_string());
    let page = take_json(unsafe { qe_shard_scroll(handle, req.as_ptr()) });
    assert_eq!(page["points"][0]["id"], "3", "next_offset feeds back into scroll");

    let ids = cstr(r#"["1"]"#);
    let records = take_json(unsafe { qe_shard_retrieve(handle, ids.as_ptr(), true, false) });
    assert_eq!(records[0]["id"], "1");

    let op = cstr(&json!({ "payload": { "seen": true }, "points": ["1"] }).to_string());
    let rc = unsafe { qe_shard_set_payload(handle, op.as_ptr()) };
    assert_eq!(rc, 0, "set_payload: {}", last_error());

    let filter = cstr(&json!({ "must_not": [{ "has_id": ["1", 2] }] }).to_string());
    assert_eq!(unsafe { qe_shard_count(handle, filter.as_ptr()) }, 1, "{}", last_error());
    let nested = json!({ "must": [{ "min_should": { "min_count": 1, "conditions": [{ "has_id": ["3"] }] } }] });
    let filter = cstr(&nested.to_string());
    assert_eq!(unsafe { qe_shard_count(handle, filter.as_ptr()) }, 1, "{}", last_error());

    let req = cstr(
        &json!({
            "query": [1.0, 0.0, 0.0, 0.0],
            "group_by": "category",
            "filter": { "must": [{ "has_id": ["1"] }] },
        })
        .to_string(),
    );
    let groups = take_json(unsafe { qe_shard_query_groups(handle, req.as_ptr()) });
    assert_eq!(groups[0]["hits"][0]["id"], "1");

    let req = cstr(
        &json!({
            "prefetch": [{ "query": [1.0, 0.0, 0.0, 0.0], "filter": { "must": [{ "has_id": ["2"] }] } }],
            "query": [0.0, 1.0, 0.0, 0.0],
        })
        .to_string(),
    );
    let hits = take_json(unsafe { qe_shard_query(handle, req.as_ptr()) });
    assert_eq!(hits.as_array().unwrap().len(), 1);
    assert_eq!(hits[0]["id"], "2");

    let target = cstr(&json!({ "points": ["2"] }).to_string());
    assert_eq!(unsafe { qe_shard_clear_payload(handle, target.as_ptr()) }, 0, "{}", last_error());
    let ids = cstr(r#"["3"]"#);
    assert_eq!(unsafe { qe_shard_delete_points(handle, ids.as_ptr()) }, 0, "{}", last_error());
    let points = cstr(&json!([{ "id": "9", "vector": [0.0, 0.0, 1.0, 0.0], "payload": { "code": "42" } }]).to_string());
    assert_eq!(unsafe { qe_shard_upsert(handle, points.as_ptr()) }, 0, "{}", last_error());

    let ids = cstr("[9]");
    let records = take_json(unsafe { qe_shard_retrieve(handle, ids.as_ptr(), true, false) });
    assert_eq!(records[0]["id"], "9", "a numeric-string id is stored as a numeric id");
    let filter = cstr(&json!({ "must": [{ "key": "code", "match": { "value": "42" } }] }).to_string());
    assert_eq!(unsafe { qe_shard_count(handle, filter.as_ptr()) }, 1, "keyword match values stay strings");

    unsafe { qe_shard_close(handle) };
}

#[test]
fn single_element_prefetch_array_keeps_its_query() {
    let dir = TempShardDir::new();
    let handle = create_test_shard(&dir);
    upsert_fixture_points(handle);

    let req = cstr(
        &json!({
            "prefetch": [{ "query": [1.0, 0.0, 0.0, 0.0], "limit": 2 }],
            "query": [0.0, 1.0, 0.0, 0.0],
        })
        .to_string(),
    );
    let hits = take_json(unsafe { qe_shard_query(handle, req.as_ptr()) });
    let ids: Vec<_> = hits.as_array().unwrap().iter().map(|h| h["id"].clone()).collect();
    assert_eq!(ids, vec![json!("3"), json!("1")], "rescores only the prefetched candidates");

    unsafe { qe_shard_close(handle) };
}

#[test]
fn non_object_payload_is_rejected_without_aborting() {
    let dir = TempShardDir::new();
    let handle = create_test_shard(&dir);

    for payload in [json!([1, 2]), json!("text"), json!(7)] {
        let points = cstr(&json!([{ "id": 1, "vector": [1.0, 0.0, 0.0, 0.0], "payload": payload }]).to_string());
        assert_eq!(unsafe { qe_shard_upsert(handle, points.as_ptr()) }, -1);
        assert!(last_error().contains("expected a map"));
    }
    upsert_fixture_points(handle);
    assert_eq!(unsafe { qe_shard_count(handle, cstr("").as_ptr()) }, 3);

    unsafe { qe_shard_close(handle) };
}

#[test]
fn invalid_vector_name_config_leaves_shard_writable() {
    let dir = TempShardDir::new();
    let handle = create_test_shard(&dir);

    let bad = cstr(&json!({ "vector_name": "img", "config": { "dense": { "size": 0, "distance": "Cosine" } } }).to_string());
    assert_eq!(unsafe { qe_shard_create_vector_name(handle, bad.as_ptr()) }, -1);
    assert!(last_error().contains("size"));

    let good = cstr(&json!({ "vector_name": "img", "config": { "dense": { "size": 3, "distance": "Dot" } } }).to_string());
    let rc = unsafe { qe_shard_create_vector_name(handle, good.as_ptr()) };
    assert_eq!(rc, 0, "create_vector_name: {}", last_error());
    let points = cstr(&json!([{ "id": 1, "vector": { "": [1.0, 0.0, 0.0, 0.0], "img": [1.0, 2.0, 3.0] } }]).to_string());
    assert_eq!(unsafe { qe_shard_upsert(handle, points.as_ptr()) }, 0, "upsert: {}", last_error());

    let name = cstr("img");
    assert_eq!(unsafe { qe_shard_delete_vector_name(handle, name.as_ptr()) }, 0, "{}", last_error());

    unsafe { qe_shard_close(handle) };
}

#[test]
fn create_makes_missing_shard_directory() {
    let dir = TempShardDir::new();
    let nested = dir.0.join("a").join("b");
    let path = cstr(nested.to_str().unwrap());
    let config = cstr(&json!({ "vectors": { "": { "size": 4, "distance": "Cosine" } } }).to_string());
    let handle = unsafe { qe_shard_create(path.as_ptr(), config.as_ptr()) };
    assert!(!handle.is_null(), "create failed: {}", last_error());
    unsafe { qe_shard_close(handle) };
}

#[test]
fn partial_hnsw_and_wal_configs_take_upstream_defaults() {
    let dir = TempShardDir::new();
    let read_persisted = || -> Value {
        serde_json::from_str(&std::fs::read_to_string(dir.0.join("edge_config.json")).unwrap()).unwrap()
    };
    let config = json!({
        "vectors": { "": { "size": 4, "distance": "Cosine", "hnsw_config": { "m": 8 } } },
        "hnsw_config": { "m": 32 },
        "wal_options": { "segment_capacity": 4_194_304 },
    });
    let config = cstr(&config.to_string());
    let handle = unsafe { qe_shard_create(dir.path_cstring().as_ptr(), config.as_ptr()) };
    assert!(!handle.is_null(), "create failed: {}", last_error());

    let persisted = read_persisted();
    assert_eq!(persisted["hnsw_config"]["m"], 32);
    assert_eq!(persisted["hnsw_config"]["full_scan_threshold"], 10_000);
    assert_eq!(persisted["vectors"][""]["hnsw_config"]["m"], 8);
    assert_eq!(persisted["vectors"][""]["hnsw_config"]["ef_construct"], 100);
    assert_eq!(persisted["wal_options"]["segment_capacity"], 4_194_304);
    assert_eq!(persisted["wal_options"]["retain_closed"], 1);

    let partial = cstr(&json!({ "ef_construct": 200 }).to_string());
    let rc = unsafe { qe_shard_set_hnsw_config(handle, partial.as_ptr()) };
    assert_eq!(rc, 0, "set_hnsw_config: {}", last_error());
    let name = cstr("");
    let partial = cstr(&json!({ "full_scan_threshold": 5000 }).to_string());
    let rc = unsafe { qe_shard_set_vector_hnsw_config(handle, name.as_ptr(), partial.as_ptr()) };
    assert_eq!(rc, 0, "set_vector_hnsw_config: {}", last_error());

    let persisted = read_persisted();
    assert_eq!(persisted["hnsw_config"]["ef_construct"], 200);
    assert_eq!(persisted["hnsw_config"]["m"], 16, "a setter replaces the config");
    assert_eq!(persisted["vectors"][""]["hnsw_config"]["full_scan_threshold"], 5000);

    unsafe { qe_shard_close(handle) };
}
