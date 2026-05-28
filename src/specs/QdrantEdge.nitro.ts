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

  /**
   * Unpack a snapshot archive into a directory.
   * @param snapshotPath - Path to the snapshot file
   * @param targetPath - Where to unpack
   */
  unpackSnapshot(snapshotPath: string, targetPath: string): void

  /**
   * Recover a shard from a partial snapshot. The supplied `shardPath`
   * becomes the live shard after the merge.
   * @param shardPath - Path to the existing shard
   * @param currentManifestJson - This shard's current SnapshotManifest JSON
   * @param snapshotPath - Path to the unpacked snapshot directory
   * @param snapshotManifestJson - The snapshot's SnapshotManifest JSON
   */
  recoverPartialSnapshot(
    shardPath: string,
    currentManifestJson: string,
    snapshotPath: string,
    snapshotManifestJson: string
  ): QdrantEdgeShard
}
