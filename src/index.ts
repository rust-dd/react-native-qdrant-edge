import { NitroModules } from 'react-native-nitro-modules'
import { Bm25, Shard } from './shard'
import type { QdrantEdge } from './specs/QdrantEdge.nitro'
import type {
  Bm25Config,
  EdgeConfig,
  SnapshotManifest,
  WalOptions,
} from './types'

export { Bm25, Shard } from './shard'
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
  OrderBySelector,
  PayloadIndexInfo,
  PointId,
  QuantizationConfig,
  RecommendClause,
  SampleClause,
  SetPayloadOp,
  WalOptions,
  MultiVector,
  Point,
  PointGroup,
  Prefetch,
  QueryClause,
  QueryGroupsRequest,
  QueryRequest,
  RangeCondition,
  ResultVector,
  ResultVectorMap,
  RetrievedPoint,
  ScoredPoint,
  ScrollRequest,
  ScrollResult,
  SearchMatrixRequest,
  SearchMatrixResult,
  SearchRequest,
  ShardInfo,
  SnapshotManifest,
  SparseVector,
  SparseVectorParams,
  VectorInput,
  VectorParams,
} from './types'

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
 *     '': { size: 384, distance: 'Cosine' }, // '' is the default (unnamed) vector
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
  useQueryGroups,
  useSearchMatrix,
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
  UseQueryGroupsOptions,
  UseQueryGroupsResult,
  UseSearchMatrixOptions,
  UseSearchMatrixResult,
  UseRetrieveResult,
  UseScrollResult,
  UseCountResult,
  UseShardInfoResult,
  UseBm25Result,
  UseFacetResult,
  UseSnapshotManifestResult,
} from './hooks'
