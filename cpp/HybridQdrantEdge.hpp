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
};

} // namespace margelo::nitro::qdrantedge
