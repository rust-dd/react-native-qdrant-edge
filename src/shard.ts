import type { QdrantEdgeBm25 } from './specs/QdrantEdgeBm25.nitro'
import type { QdrantEdgeShard } from './specs/QdrantEdgeShard.nitro'
import type {
  DeletePayloadOp,
  FacetRequest,
  FacetResponse,
  Filter,
  FieldIndexType,
  HnswConfig,
  OptimizersConfig,
  Point,
  PointGroup,
  PointId,
  QueryGroupsRequest,
  QueryRequest,
  RetrievedPoint,
  ScoredPoint,
  ScrollRequest,
  ScrollResult,
  SearchMatrixRequest,
  SearchMatrixResult,
  SearchRequest,
  SetPayloadOp,
  ShardInfo,
  SnapshotManifest,
  SparseVector,
  SparseVectorParams,
  VectorParams,
} from './types'

export class Shard {
  /** @internal */
  constructor(private readonly _raw: QdrantEdgeShard) {}

  flush(): void {
    this._raw.flush()
  }

  optimize(): void {
    this._raw.optimize()
  }

  close(): void {
    this._raw.close()
  }

  upsert(points: Point[]): void {
    this._raw.upsert(JSON.stringify(points))
  }

  deletePoints(ids: PointId[]): void {
    this._raw.deletePoints(JSON.stringify(ids))
  }

  /** Merge payload into one or more points (by `pointId` or filter — see `setPayloadOp`). */
  setPayload(
    pointId: PointId,
    payload: Record<string, unknown>,
    key?: string
  ): void {
    this._raw.setPayload(JSON.stringify({ payload, points: [pointId], key }))
  }

  /** Full-power set: targets by `points` and/or `filter`. */
  setPayloadOp(op: SetPayloadOp): void {
    this._raw.setPayload(JSON.stringify(op))
  }

  /** Overwrite payload on one point (entire payload replaced). */
  overwritePayload(pointId: PointId, payload: Record<string, unknown>): void {
    this._raw.overwritePayload(JSON.stringify({ payload, points: [pointId] }))
  }

  /** Full-power overwrite: targets by `points` and/or `filter`. */
  overwritePayloadOp(op: SetPayloadOp): void {
    this._raw.overwritePayload(JSON.stringify(op))
  }

  /** Delete one point's payload keys. */
  deletePayload(pointId: PointId, keys: string[]): void {
    this._raw.deletePayload(JSON.stringify({ keys, points: [pointId] }))
  }

  /** Full-power delete: targets by `points` and/or `filter`. */
  deletePayloadOp(op: DeletePayloadOp): void {
    this._raw.deletePayload(JSON.stringify(op))
  }

  /** Clear all payload from a set of points or those matching a filter. */
  clearPayload(target: { points: PointId[] } | { filter: Filter }): void {
    this._raw.clearPayload(JSON.stringify(target))
  }

  createFieldIndex(fieldName: string, fieldType: FieldIndexType): void {
    this._raw.createFieldIndex(fieldName, fieldType)
  }

  deleteFieldIndex(fieldName: string): void {
    this._raw.deleteFieldIndex(fieldName)
  }

  search(request: SearchRequest): ScoredPoint[] {
    const json = this._raw.search(JSON.stringify(request))
    return JSON.parse(json) as ScoredPoint[]
  }

  query(request: QueryRequest): ScoredPoint[] {
    const json = this._raw.query(JSON.stringify(request))
    return JSON.parse(json) as ScoredPoint[]
  }

  /** Group query results by a payload field. */
  queryGroups(request: QueryGroupsRequest): PointGroup[] {
    const json = this._raw.queryGroups(JSON.stringify(request))
    return JSON.parse(json) as PointGroup[]
  }

  /**
   * Distance matrix over a random sample of points — each sampled point's
   * nearest neighbours within the sample.
   */
  searchMatrix(request: SearchMatrixRequest = {}): SearchMatrixResult {
    const json = this._raw.searchMatrix(JSON.stringify(request))
    return JSON.parse(json) as SearchMatrixResult
  }

  retrieve(
    ids: PointId[],
    options: { withPayload?: boolean; withVector?: boolean } = {}
  ): RetrievedPoint[] {
    const json = this._raw.retrieve(
      JSON.stringify(ids),
      options.withPayload ?? true,
      options.withVector ?? false
    )
    return JSON.parse(json) as RetrievedPoint[]
  }

  scroll(request: ScrollRequest = {}): ScrollResult {
    const json = this._raw.scroll(JSON.stringify(request))
    return JSON.parse(json) as ScrollResult
  }

  count(filter?: Filter): number {
    return this._raw.count(filter ? JSON.stringify(filter) : '')
  }

  info(): ShardInfo {
    const json = this._raw.info()
    return JSON.parse(json) as ShardInfo
  }

  /** Count points per unique value of a payload key. */
  facet(request: FacetRequest): FacetResponse {
    const json = this._raw.facet(JSON.stringify(request))
    return JSON.parse(json) as FacetResponse
  }

  /** Read this shard's snapshot manifest (opaque; pass to `recoverPartialSnapshot`). */
  snapshotManifest(): SnapshotManifest {
    return JSON.parse(this._raw.snapshotManifest()) as SnapshotManifest
  }

  /** Set the global HNSW config and persist. */
  setHnswConfig(config: HnswConfig): void {
    this._raw.setHnswConfig(JSON.stringify(config))
  }

  /** Set per-vector HNSW config (use `""` for the default vector name). */
  setVectorHnswConfig(vectorName: string, config: HnswConfig): void {
    this._raw.setVectorHnswConfig(vectorName, JSON.stringify(config))
  }

  /** Set the optimizer config and persist. */
  setOptimizersConfig(config: OptimizersConfig): void {
    this._raw.setOptimizersConfig(JSON.stringify(config))
  }

  /** Add a new named vector slot at runtime. */
  createVectorName(
    name: string,
    config: { dense: VectorParams } | { sparse: SparseVectorParams }
  ): void {
    this._raw.createVectorName(JSON.stringify({ vector_name: name, config }))
  }

  /** Remove a named vector slot at runtime. */
  deleteVectorName(name: string): void {
    this._raw.deleteVectorName(name)
  }
}

/**
 * On-device BM25 sparse-embedding model. Reusable across shards and texts;
 * `close()` releases the underlying native model.
 *
 * @example
 * ```ts
 * import { createBm25 } from 'react-native-qdrant-edge'
 *
 * const bm25 = createBm25({ language: 'english' })
 * const queryVec = bm25.embedQuery('quick fox')          // { indices, values }
 * const docVec   = bm25.embedDocument('the quick brown fox jumps over the lazy dog')
 * bm25.close()
 * ```
 */
export class Bm25 {
  /** @internal */
  constructor(private readonly _raw: QdrantEdgeBm25) {}

  embedQuery(text: string): SparseVector {
    return JSON.parse(this._raw.embedQuery(text)) as SparseVector
  }

  embedDocument(text: string): SparseVector {
    return JSON.parse(this._raw.embedDocument(text)) as SparseVector
  }

  close(): void {
    this._raw.close()
  }
}
