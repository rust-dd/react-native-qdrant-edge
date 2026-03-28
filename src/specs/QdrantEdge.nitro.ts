import type { HybridObject } from 'react-native-nitro-modules'
import type { QdrantEdgeShard } from './QdrantEdgeShard.nitro'

/**
 * Factory for creating and loading Qdrant Edge shards.
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
}
