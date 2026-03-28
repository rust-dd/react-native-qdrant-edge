#pragma once

#include "HybridQdrantEdgeSpec.hpp"
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
};

} // namespace margelo::nitro::qdrantedge
