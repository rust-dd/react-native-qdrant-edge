import type { HybridObject } from 'react-native-nitro-modules'

/**
 * Represents an open Qdrant Edge shard - an in-process vector search index.
 *
 * Complex parameters (points, search requests, filters) are passed as JSON strings
 * for flexibility, and parsed in the Rust layer via serde.
 */
export interface QdrantEdgeShard extends HybridObject<{
  ios: 'c++'
  android: 'c++'
}> {
  /** Flush pending writes to disk. */
  flush(): void
  /** Merge segments, build HNSW indexes, remove deleted data. */
  optimize(): void
  /** Flush and close this shard. */
  close(): void

  /**
   * Upsert points into the shard.
   * @param pointsJson - JSON array of points: [{ id, vector, payload? }, ...]
   */
  upsert(pointsJson: string): void
  /**
   * Delete points by IDs.
   * @param idsJson - JSON array of point IDs: [1, 2, 3]
   */
  deletePoints(idsJson: string): void
  /**
   * Set (merge) payload fields.
   * @param opJson - JSON SetPayloadOp: `{ payload, points?, filter?, key? }`
   */
  setPayload(opJson: string): void
  /**
   * Overwrite payload entirely. Same shape as `setPayload`.
   */
  overwritePayload(opJson: string): void
  /**
   * Delete specific payload keys.
   * @param opJson - JSON DeletePayloadOp: `{ keys, points?, filter? }`
   */
  deletePayload(opJson: string): void
  /**
   * Clear all payload from a set of points or by filter.
   * @param targetJson - JSON `{ points: [...] }` OR `{ filter: ... }`
   */
  clearPayload(targetJson: string): void
  /**
   * Create a field index for filtering.
   * @param fieldName - The payload field name to index
   * @param fieldType - Index type: "keyword", "integer", "float", "geo", "text", "bool", "datetime"
   */
  createFieldIndex(fieldName: string, fieldType: string): void
  /**
   * Delete a field index.
   * @param fieldName - The payload field name to deindex
   */
  deleteFieldIndex(fieldName: string): void

  /**
   * Nearest-neighbor search.
   * @param requestJson - JSON SearchRequest: { query, filter?, limit, offset?, with_payload?, with_vector?, score_threshold?, params? }
   * @returns JSON array of scored points
   */
  search(requestJson: string): string
  /**
   * Full query with prefetches, fusion, and rescoring.
   * @param requestJson - JSON QueryRequest
   * @returns JSON array of scored points
   */
  query(requestJson: string): string

  /**
   * Retrieve specific points by IDs.
   * @param idsJson - JSON array of point IDs
   * @param withPayload - Include payload in results
   * @param withVector - Include vector in results
   * @returns JSON array of points
   */
  retrieve(idsJson: string, withPayload: boolean, withVector: boolean): string
  /**
   * Paginated scroll through points.
   * @param requestJson - JSON ScrollRequest: { offset?, limit, filter?, with_payload?, with_vector? }
   * @returns JSON with points and next_offset
   */
  scroll(requestJson: string): string
  /**
   * Count points, optionally with a filter.
   * @param filterJson - Optional JSON filter object (empty string = no filter)
   * @returns Number of matching points
   */
  count(filterJson: string): number

  /**
   * Get shard info (point count, segments, config, etc.)
   * @returns JSON with shard metadata
   */
  info(): string

  /**
   * Count points per unique value of a payload key.
   * @param requestJson - JSON FacetRequest: `{ key, limit?, filter?, exact? }`
   * @returns JSON `{ hits: [{ value, count }] }`
   */
  facet(requestJson: string): string

  /**
   * Read this shard's snapshot manifest — pass to `recoverPartialSnapshot`
   * when merging an external snapshot into this shard.
   * @returns JSON manifest (opaque)
   */
  snapshotManifest(): string

  /**
   * Set the global HNSW config and persist.
   * @param configJson - JSON HnswConfig
   */
  setHnswConfig(configJson: string): void

  /**
   * Set the HNSW config for a single named vector and persist.
   * @param vectorName - Name of the dense vector (use `""` for the default vector)
   * @param configJson - JSON HnswConfig
   */
  setVectorHnswConfig(vectorName: string, configJson: string): void

  /**
   * Set the optimizer config and persist.
   * @param configJson - JSON OptimizersConfig
   */
  setOptimizersConfig(configJson: string): void

  /**
   * Add a new named vector slot to this shard at runtime.
   * @param opJson - JSON `{ vector_name, config: { dense } | { sparse } }`
   */
  createVectorName(opJson: string): void

  /**
   * Remove a named vector slot from this shard at runtime.
   * @param vectorName - Name of the vector to remove
   */
  deleteVectorName(vectorName: string): void
}
