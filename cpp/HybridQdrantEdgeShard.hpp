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
    qe_shard_flush(_handle);
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

  void setPayload(double pointId, const std::string& payloadJson) override {
    ensureOpen();
    if (qe_shard_set_payload(_handle, static_cast<uint64_t>(pointId), payloadJson.c_str()) < 0) {
      throwLastError("setPayload");
    }
  }

  void deletePayload(double pointId, const std::string& keysJson) override {
    ensureOpen();
    if (qe_shard_delete_payload(_handle, static_cast<uint64_t>(pointId), keysJson.c_str()) < 0) {
      throwLastError("deletePayload");
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
    return takeString(result);
  }

  std::string query(const std::string& requestJson) override {
    ensureOpen();
    char* result = qe_shard_query(_handle, requestJson.c_str());
    return takeString(result);
  }

  std::string retrieve(const std::string& idsJson, bool withPayload, bool withVector) override {
    ensureOpen();
    char* result = qe_shard_retrieve(_handle, idsJson.c_str(), withPayload, withVector);
    return takeString(result);
  }

  std::string scroll(const std::string& requestJson) override {
    ensureOpen();
    char* result = qe_shard_scroll(_handle, requestJson.c_str());
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
    return takeString(result);
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

  static std::string takeString(char* ptr) {
    if (!ptr) return "null";
    std::string s(ptr);
    qe_free_string(ptr);
    return s;
  }
};

} // namespace margelo::nitro::qdrantedge
