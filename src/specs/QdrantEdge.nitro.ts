import type { HybridObject } from 'react-native-nitro-modules'
import type { QdrantEdgeBm25 } from './QdrantEdgeBm25.nitro'
import type { QdrantEdgeShard } from './QdrantEdgeShard.nitro'

/**
 * Factory for creating shards and BM25 embedders.
 */
export interface QdrantEdge extends HybridObject<{
  ios: 'c++'
  android: 'c++'
}> {
  /**
   * Create a new shard on disk.
   * @param path - Filesystem path where the shard will be stored
   * @param configJson - JSON EdgeConfig: { vectors: { "default": { size, distance } }, ... }
   * @returns An open QdrantEdgeShard
   */
  createShard(path: string, configJson: string): QdrantEdgeShard
  /**
   * Load an existing shard from disk.
   * @param path - Filesystem path to the shard
   * @param configJson - Optional JSON EdgeConfig override (empty string = use stored config)
   * @returns An open QdrantEdgeShard
   */
  loadShard(path: string, configJson: string): QdrantEdgeShard
  /**
   * Construct a BM25 sparse-embedding model.
   * @param configJson - JSON Bm25Config (empty string = defaults)
   * @returns A QdrantEdgeBm25 model
   */
  createBm25(configJson: string): QdrantEdgeBm25
}
