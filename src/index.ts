import { NitroModules } from 'react-native-nitro-modules'
import type { QdrantEdge } from './specs/QdrantEdge.nitro'
import type { QdrantEdgeBm25 } from './specs/QdrantEdgeBm25.nitro'
import type { QdrantEdgeShard } from './specs/QdrantEdgeShard.nitro'
import type {
  Bm25Config,
  DeletePayloadOp,
  EdgeConfig,
  FacetRequest,
  FacetResponse,
  Filter,
  FieldIndexType,
  HnswConfig,
  OptimizersConfig,
  Point,
  PointId,
  QueryRequest,
  RetrievedPoint,
  ScoredPoint,
  ScrollRequest,
  ScrollResult,
  SearchRequest,
  SetPayloadOp,
  ShardInfo,
  SnapshotManifest,
  SparseVector,
  SparseVectorParams,
  VectorParams,
  WalOptions,
} from './types'

export type {
  AcornSearchParams,
  AnyVector,
  Bm25Config,
  Bm25Stemmer,
  Bm25Stopwords,
  Bm25TokenizerType,
  DenseVector,
  Distance,
  EdgeConfig,
  IdfParams,
  QuantizationSearchParams,
  SearchParams,
  FacetHit,
  FacetRequest,
  FacetResponse,
  FacetValue,
  FieldIndexType,
  Filter,
  ContextClause,
  DeletePayloadOp,
  DiscoverClause,
  Fusion,
  FusionClause,
  HnswConfig,
  MatchCondition,
  MmrClause,
  MultiVectorConfig,
  OptimizersConfig,
  OrderByClause,
  PointId,
  QuantizationConfig,
  RecommendClause,
  SampleClause,
  SetPayloadOp,
  WalOptions,
  MultiVector,
  Point,
  Prefetch,
  QueryClause,
  QueryRequest,
  RangeCondition,
  ResultVector,
  ResultVectorMap,
  RetrievedPoint,
  ScoredPoint,
  ScrollRequest,
  ScrollResult,
  SearchRequest,
  ShardInfo,
  SnapshotManifest,
  SparseVector,
  SparseVectorParams,
  VectorInput,
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
  setPayload(pointId: PointId, payload: Record<string, unknown>, key?: string): void {
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

  count(filter?: Record<string, unknown>): number {
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
 * Recommended WAL settings for embedded/mobile deployments. The upstream
 * default of 32 MiB per WAL segment is wasteful on phones; this preset
 * uses 4 MiB segments and retains exactly one closed segment.
 */
export function mobileWalDefaults(): WalOptions {
  return {
    segment_capacity: 4 * 1024 * 1024,
    segment_queue_len: 0,
    retain_closed: 1,
  }
}

const _factory = NitroModules.createHybridObject<QdrantEdge>('QdrantEdge')

/**
 * Create a new Qdrant Edge shard at the given path.
 *
 * @example
 * ```ts
 * import { createShard } from 'react-native-qdrant-edge'
 *
 * const shard = createShard('/path/to/shard', {
 *   vectors: {
 *     default: { size: 384, distance: 'Cosine' }
 *   }
 * })
 *
 * shard.upsert([
 *   { id: 1, vector: [0.1, 0.2, ...], payload: { text: 'hello' } },
 *   { id: 2, vector: [0.3, 0.4, ...], payload: { text: 'world' } },
 * ])
 *
 * const results = shard.search({
 *   vector: [0.1, 0.2, ...],
 *   limit: 5,
 * })
 * ```
 */
export function createShard(path: string, config: EdgeConfig): Shard {
  const raw = _factory.createShard(path, JSON.stringify(config))
  return new Shard(raw)
}

/**
 * Load an existing Qdrant Edge shard from disk.
 *
 * @param path - Path to the shard directory
 * @param config - Optional config override. If omitted, uses the stored config.
 */
export function loadShard(path: string, config?: EdgeConfig): Shard {
  const raw = _factory.loadShard(path, config ? JSON.stringify(config) : '')
  return new Shard(raw)
}

/**
 * On-device BM25 sparse-embedding model. Reusable across shards and texts;
 * `dispose()` releases the underlying native model.
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

/**
 * Create a BM25 sparse-embedding model. Pass an empty config (or omit) for
 * the default English tokenizer/stopwords/stemmer setup.
 */
export function createBm25(config?: Bm25Config): Bm25 {
  const raw = _factory.createBm25(config ? JSON.stringify(config) : '')
  return new Bm25(raw)
}

/** Unpack a snapshot archive into a directory. */
export function unpackSnapshot(snapshotPath: string, targetPath: string): void {
  _factory.unpackSnapshot(snapshotPath, targetPath)
}

/**
 * Recover a shard from a partial snapshot. The shard at `shardPath` is
 * mutated in place; the returned `Shard` is opened against it.
 */
export function recoverPartialSnapshot(
  shardPath: string,
  currentManifest: SnapshotManifest,
  snapshotPath: string,
  snapshotManifest: SnapshotManifest
): Shard {
  const raw = _factory.recoverPartialSnapshot(
    shardPath,
    JSON.stringify(currentManifest),
    snapshotPath,
    JSON.stringify(snapshotManifest)
  )
  return new Shard(raw)
}

export { QdrantError, asQdrantError } from './errors'

export {
  useShard,
  useUpsert,
  useDelete,
  useSearch,
  useQuery,
  useRetrieve,
  useScroll,
  useCount,
  useShardInfo,
  useBm25,
  useFacet,
  useSnapshotManifest,
} from './hooks'
export type {
  UseShardOptions,
  UseShardResult,
  UseUpsertResult,
  UseDeleteResult,
  UseSearchOptions,
  UseSearchResult,
  UseQueryOptions,
  UseQueryResult,
  UseRetrieveResult,
  UseScrollResult,
  UseCountResult,
  UseShardInfoResult,
  UseBm25Result,
  UseFacetResult,
  UseSnapshotManifestResult,
} from './hooks'
