#ifndef QDRANT_EDGE_FFI_H
#define QDRANT_EDGE_FFI_H

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Opaque handle to an EdgeShard, protected by a Mutex for thread safety. */
typedef struct QeShardHandle QeShardHandle;

/* Create a new shard. config_json is a JSON-serialized EdgeConfig.
   Returns an opaque handle, or null on error (check qe_last_error). */
QeShardHandle* qe_shard_create(const char* path, const char* config_json);

/* Load an existing shard from disk. config_json can be empty for default. */
QeShardHandle* qe_shard_load(const char* path, const char* config_json);

/* Close and free a shard handle. After this call the handle is invalid. */
void qe_shard_close(QeShardHandle* handle);

/* Flush pending writes to disk. */
void qe_shard_flush(QeShardHandle* handle);

/* Run optimizers. Returns 1 if optimized, 0 if already optimal, -1 on error. */
int32_t qe_shard_optimize(QeShardHandle* handle);

/* Upsert points. points_json is a JSON array of points. Returns 0 or -1. */
int32_t qe_shard_upsert(QeShardHandle* handle, const char* points_json);

/* Delete points by IDs. ids_json is a JSON array of u64 IDs. Returns 0 or -1. */
int32_t qe_shard_delete_points(QeShardHandle* handle, const char* ids_json);

/* Set payload on a point. Returns 0 or -1. */
int32_t qe_shard_set_payload(QeShardHandle* handle, uint64_t point_id, const char* payload_json);

/* Delete payload keys from a point. Returns 0 or -1. */
int32_t qe_shard_delete_payload(QeShardHandle* handle, uint64_t point_id, const char* keys_json);

/* Create a field index. field_type: keyword|integer|float|geo|text|bool|datetime */
int32_t qe_shard_create_field_index(QeShardHandle* handle, const char* field_name, const char* field_type);

/* Delete a field index. Returns 0 or -1. */
int32_t qe_shard_delete_field_index(QeShardHandle* handle, const char* field_name);

/* Search for nearest neighbors. Returns JSON string. Free with qe_free_string. */
char* qe_shard_search(QeShardHandle* handle, const char* request_json);

/* Full query with prefetches and fusion. Returns JSON string. Free with qe_free_string. */
char* qe_shard_query(QeShardHandle* handle, const char* request_json);

/* Retrieve specific points by IDs. Returns JSON string. Free with qe_free_string. */
char* qe_shard_retrieve(QeShardHandle* handle, const char* ids_json, bool with_payload, bool with_vector);

/* Scroll through points. Returns JSON with { points, next_offset }. Free with qe_free_string. */
char* qe_shard_scroll(QeShardHandle* handle, const char* request_json);

/* Count points with optional filter. Returns count or -1 on error. */
int64_t qe_shard_count(QeShardHandle* handle, const char* filter_json);

/* Get shard info. Returns JSON string. Free with qe_free_string. */
char* qe_shard_info(QeShardHandle* handle);

/* Free a string returned by any qe_ function. */
void qe_free_string(char* ptr);

/* Get the last error message. Returns null if no error. Free with qe_free_string. */
char* qe_last_error(void);

#ifdef __cplusplus
}
#endif

#endif /* QDRANT_EDGE_FFI_H */
