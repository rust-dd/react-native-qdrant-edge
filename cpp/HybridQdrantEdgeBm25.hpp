#pragma once

#include "HybridQdrantEdgeBm25Spec.hpp"
#include "qdrant_edge_ffi.h"
#include <string>
#include <stdexcept>

namespace margelo::nitro::qdrantedge {

class HybridQdrantEdgeBm25 : public HybridQdrantEdgeBm25Spec {
public:
  explicit HybridQdrantEdgeBm25(QeBm25Handle* handle)
      : HybridObject(TAG), _handle(handle) {
    if (!_handle) {
      char* err = qe_last_error();
      std::string msg = err ? err : "unknown error";
      if (err) qe_free_string(err);
      throw std::runtime_error("Failed to create BM25 model: " + msg);
    }
  }

  ~HybridQdrantEdgeBm25() override {
    if (_handle) {
      qe_bm25_destroy(_handle);
      _handle = nullptr;
    }
  }

  std::string embedQuery(const std::string& text) override {
    ensureOpen();
    char* result = qe_bm25_embed_query(_handle, text.c_str());
    if (!result) throwLastError("bm25.embedQuery");
    return takeString(result);
  }

  std::string embedDocument(const std::string& text) override {
    ensureOpen();
    char* result = qe_bm25_embed_document(_handle, text.c_str());
    if (!result) throwLastError("bm25.embedDocument");
    return takeString(result);
  }

  void close() override {
    if (_handle) {
      qe_bm25_destroy(_handle);
      _handle = nullptr;
    }
  }

private:
  QeBm25Handle* _handle;

  void ensureOpen() const {
    if (!_handle) {
      throw std::runtime_error("QdrantEdgeBm25 is disposed");
    }
  }

  void throwLastError(const char* operation) {
    char* err = qe_last_error();
    std::string msg = err ? err : "unknown error";
    if (err) qe_free_string(err);
    throw std::runtime_error(std::string(operation) + " failed: " + msg);
  }

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
