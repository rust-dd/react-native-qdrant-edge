#pragma once

#include "HybridQdrantEdgeSpec.hpp"
#include "HybridQdrantEdgeBm25.hpp"
#include "HybridQdrantEdgeShard.hpp"
#include "qdrant_edge_ffi.h"
#include <memory>
#include <string>

namespace margelo::nitro::qdrantedge {

class HybridQdrantEdge : public HybridQdrantEdgeSpec {
public:
  HybridQdrantEdge() : HybridObject(TAG) {}

  std::shared_ptr<HybridQdrantEdgeShardSpec> createShard(
      const std::string& path,
      const std::string& configJson) override {
    QeShardHandle* handle = qe_shard_create(path.c_str(), configJson.c_str());
    return std::make_shared<HybridQdrantEdgeShard>(handle);
  }

  std::shared_ptr<HybridQdrantEdgeShardSpec> loadShard(
      const std::string& path,
      const std::string& configJson) override {
    QeShardHandle* handle = qe_shard_load(path.c_str(), configJson.c_str());
    return std::make_shared<HybridQdrantEdgeShard>(handle);
  }

  std::shared_ptr<HybridQdrantEdgeBm25Spec> createBm25(
      const std::string& configJson) override {
    QeBm25Handle* handle = qe_bm25_create(configJson.c_str());
    return std::make_shared<HybridQdrantEdgeBm25>(handle);
  }

  void unpackSnapshot(
      const std::string& snapshotPath,
      const std::string& targetPath) override {
    if (qe_unpack_snapshot(snapshotPath.c_str(), targetPath.c_str()) < 0) {
      char* err = qe_last_error();
      std::string msg = err ? err : "unknown error";
      if (err) qe_free_string(err);
      throw std::runtime_error("unpackSnapshot failed: " + msg);
    }
  }

  std::shared_ptr<HybridQdrantEdgeShardSpec> recoverPartialSnapshot(
      const std::string& shardPath,
      const std::string& currentManifestJson,
      const std::string& snapshotPath,
      const std::string& snapshotManifestJson) override {
    QeShardHandle* handle = qe_recover_partial_snapshot(
        shardPath.c_str(),
        currentManifestJson.c_str(),
        snapshotPath.c_str(),
        snapshotManifestJson.c_str());
    return std::make_shared<HybridQdrantEdgeShard>(handle);
  }
};

} // namespace margelo::nitro::qdrantedge
