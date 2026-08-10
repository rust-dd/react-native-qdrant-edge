#pragma once

#include "HybridQdrantEdgeShardSpec.hpp"
#include "qdrant_edge_ffi.h"
#include <string>
#include <stdexcept>

namespace margelo::nitro::qdrantedge {

class HybridQdrantEdgeShard : public HybridQdrantEdgeShardSpec {
public:
  explicit HybridQdrantEdgeShard(QeShardHandle* handle)
      : HybridObject(TAG), _handle(handle) {
    if (!_handle) {
      char* err = qe_last_error();
      std::string msg = err ? err : "unknown error";
      if (err) qe_free_string(err);
      throw std::runtime_error("Failed to create shard: " + msg);
    }
  }

  ~HybridQdrantEdgeShard() override {
    if (_handle) {
      qe_shard_close(_handle);
      _handle = nullptr;
    }
  }

  void flush() override {
    ensureOpen();
    if (qe_shard_flush(_handle) < 0) {
      throwLastError("flush");
    }
  }

  void optimize() override {
    ensureOpen();
    int32_t result = qe_shard_optimize(_handle);
    if (result < 0) throwLastError("optimize");
  }

  void close() override {
    if (_handle) {
      qe_shard_close(_handle);
      _handle = nullptr;
    }
  }

  void upsert(const std::string& pointsJson) override {
    ensureOpen();
    if (qe_shard_upsert(_handle, pointsJson.c_str()) < 0) {
      throwLastError("upsert");
    }
  }

  void deletePoints(const std::string& idsJson) override {
    ensureOpen();
    if (qe_shard_delete_points(_handle, idsJson.c_str()) < 0) {
      throwLastError("deletePoints");
    }
  }

  void setPayload(const std::string& opJson) override {
    ensureOpen();
    if (qe_shard_set_payload(_handle, opJson.c_str()) < 0) {
      throwLastError("setPayload");
    }
  }

  void overwritePayload(const std::string& opJson) override {
    ensureOpen();
    if (qe_shard_overwrite_payload(_handle, opJson.c_str()) < 0) {
      throwLastError("overwritePayload");
    }
  }

  void deletePayload(const std::string& opJson) override {
    ensureOpen();
    if (qe_shard_delete_payload(_handle, opJson.c_str()) < 0) {
      throwLastError("deletePayload");
    }
  }

  void clearPayload(const std::string& targetJson) override {
    ensureOpen();
    if (qe_shard_clear_payload(_handle, targetJson.c_str()) < 0) {
      throwLastError("clearPayload");
    }
  }

  void createFieldIndex(const std::string& fieldName, const std::string& fieldType) override {
    ensureOpen();
    if (qe_shard_create_field_index(_handle, fieldName.c_str(), fieldType.c_str()) < 0) {
      throwLastError("createFieldIndex");
    }
  }

  void deleteFieldIndex(const std::string& fieldName) override {
    ensureOpen();
    if (qe_shard_delete_field_index(_handle, fieldName.c_str()) < 0) {
      throwLastError("deleteFieldIndex");
    }
  }

  std::string search(const std::string& requestJson) override {
    ensureOpen();
    char* result = qe_shard_search(_handle, requestJson.c_str());
    if (!result) throwLastError("search");
    return takeString(result);
  }

  std::string query(const std::string& requestJson) override {
    ensureOpen();
    char* result = qe_shard_query(_handle, requestJson.c_str());
    if (!result) throwLastError("query");
    return takeString(result);
  }

  std::string retrieve(const std::string& idsJson, bool withPayload, bool withVector) override {
    ensureOpen();
    char* result = qe_shard_retrieve(_handle, idsJson.c_str(), withPayload, withVector);
    if (!result) throwLastError("retrieve");
    return takeString(result);
  }

  std::string scroll(const std::string& requestJson) override {
    ensureOpen();
    char* result = qe_shard_scroll(_handle, requestJson.c_str());
    if (!result) throwLastError("scroll");
    return takeString(result);
  }

  double count(const std::string& filterJson) override {
    ensureOpen();
    int64_t result = qe_shard_count(_handle, filterJson.c_str());
    if (result < 0) throwLastError("count");
    return static_cast<double>(result);
  }

  std::string info() override {
    ensureOpen();
    char* result = qe_shard_info(_handle);
    if (!result) throwLastError("info");
    return takeString(result);
  }

  std::string facet(const std::string& requestJson) override {
    ensureOpen();
    char* result = qe_shard_facet(_handle, requestJson.c_str());
    if (!result) throwLastError("facet");
    return takeString(result);
  }

  std::string snapshotManifest() override {
    ensureOpen();
    char* result = qe_shard_snapshot_manifest(_handle);
    if (!result) throwLastError("snapshotManifest");
    return takeString(result);
  }

  void setHnswConfig(const std::string& configJson) override {
    ensureOpen();
    if (qe_shard_set_hnsw_config(_handle, configJson.c_str()) < 0) {
      throwLastError("setHnswConfig");
    }
  }

  void setVectorHnswConfig(const std::string& vectorName, const std::string& configJson) override {
    ensureOpen();
    if (qe_shard_set_vector_hnsw_config(_handle, vectorName.c_str(), configJson.c_str()) < 0) {
      throwLastError("setVectorHnswConfig");
    }
  }

  void setOptimizersConfig(const std::string& configJson) override {
    ensureOpen();
    if (qe_shard_set_optimizers_config(_handle, configJson.c_str()) < 0) {
      throwLastError("setOptimizersConfig");
    }
  }

  void createVectorName(const std::string& opJson) override {
    ensureOpen();
    if (qe_shard_create_vector_name(_handle, opJson.c_str()) < 0) {
      throwLastError("createVectorName");
    }
  }

  void deleteVectorName(const std::string& vectorName) override {
    ensureOpen();
    if (qe_shard_delete_vector_name(_handle, vectorName.c_str()) < 0) {
      throwLastError("deleteVectorName");
    }
  }

private:
  QeShardHandle* _handle;

  void ensureOpen() const {
    if (!_handle) {
      throw std::runtime_error("QdrantEdgeShard is closed");
    }
  }

  void throwLastError(const char* operation) {
    char* err = qe_last_error();
    std::string msg = err ? err : "unknown error";
    if (err) qe_free_string(err);
    throw std::runtime_error(std::string(operation) + " failed: " + msg);
  }

  // Caller is responsible for null-checking before this is invoked;
  // a null here means a missing throwLastError site, which is a bug.
  static std::string takeString(char* ptr) {
    if (!ptr) {
      throw std::runtime_error("qdrant-edge: takeString received null (missing error check)");
    }
    std::string s(ptr);
    qe_free_string(ptr);
    return s;
  }
};

} // namespace margelo::nitro::qdrantedge
