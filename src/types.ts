export type Distance = 'Cosine' | 'Euclid' | 'Dot' | 'Manhattan'

export interface VectorParams {
  size: number
  distance: Distance
  on_disk?: boolean
  datatype?: 'Float32' | 'Float16' | 'Uint8'
  multivector_config?: MultiVectorConfig
  /** Per-vector quantization override; falls back to `EdgeConfig.quantization_config`. */
  quantization_config?: QuantizationConfig
  /** Per-vector HNSW override; falls back to `EdgeConfig.hnsw_config`. */
  hnsw_config?: HnswConfig
}

export interface SparseVectorParams {
  full_scan_threshold?: number
  on_disk?: boolean
  modifier?: 'none' | 'idf'
  datatype?: 'Float32' | 'Float16' | 'Uint8'
}

/** HNSW index hyperparameters. All fields optional; upstream defaults apply. */
export interface HnswConfig {
  m?: number
  ef_construct?: number
  full_scan_threshold?: number
  max_indexing_threads?: number
  on_disk?: boolean
  payload_m?: number
}

/** Optimizer thresholds. All fields optional. */
export interface OptimizersConfig {
  deleted_threshold?: number
  vacuum_min_vector_number?: number
  default_segment_number?: number
  max_segment_size?: number
  max_optimization_threads?: number
  indexing_threshold?: number
  /**
   * If true, points written to unoptimized segments above `indexing_threshold`
   * are stored as deferred (persisted but excluded from read/search until the
   * segments are optimized). Run `shard.optimize()` to make them visible.
   */
  prevent_unoptimized?: boolean
}

/**
 * WAL (write-ahead log) options. Mobile deployments typically want a much
 * smaller `segment_capacity` than the upstream default (32 MiB) — see
 * `mobileWalDefaults()` for a recommended preset.
 */
export interface WalOptions {
  /** Per-segment capacity in bytes. */
  segment_capacity?: number
  /** Queue length for in-flight writes. */
  segment_queue_len?: number
  /** Number of closed WAL segments to retain (must be > 0). */
  retain_closed?: number
}

/** Multi-vector (ColBERT-style) comparator. */
export interface MultiVectorConfig {
  comparator: 'MaxSim'
}

/**
 * Quantization configuration. Opaque from TS — the shape is one of
 * `{ scalar: { ... } }`, `{ product: { ... } }`, or `{ binary: { ... } }`
 * matching upstream Qdrant. Treat as a JSON blob.
 */
export type QuantizationConfig = Record<string, unknown>

export interface EdgeConfig {
  vectors: Record<string, VectorParams>
  sparse_vectors?: Record<string, SparseVectorParams>
  on_disk_payload?: boolean
  hnsw_config?: HnswConfig
  quantization_config?: QuantizationConfig
  optimizers?: OptimizersConfig
  /**
   * WAL options. Defaults to upstream (32 MiB segment_capacity), which is
   * usually too large for mobile — set this for embedded deployments.
   */
  wal_options?: WalOptions
  /**
   * Threads in the shard's search pool: per-segment reads (search, scroll,
   * count, facet) and segment loads run in parallel on it. Defaults to a
   * CPU-derived count; set `1` to keep search single-threaded.
   */
  max_search_threads?: number
  /**
   * Pin every search-pool thread to this CPU core (best-effort). Bounds the
   * shard's search compute to one core while keeping IO overlap.
   */
  search_pool_core?: number
}

export type DenseVector = number[]

/** Sparse vector wire shape: `indices` is the term id, `values` the weight. */
export interface SparseVector {
  indices: number[]
  values: number[]
}

/** Multi-vector (ColBERT-style late-interaction); a matrix of dense rows. */
export type MultiVector = number[][]

/** Any single-vector shape: dense, sparse, or multi. */
export type AnyVector = DenseVector | SparseVector | MultiVector

/**
 * Vector input on a point. A bare value is the un-named (default) vector;
 * a `{ name: vector }` map carries multiple named vectors and may mix shapes.
 */
export type VectorInput = AnyVector | Record<string, AnyVector>

/** Point identifier: a u64 number or a UUID string. */
export type PointId = number | string

export interface Point {
  id: PointId
  vector: VectorInput
  payload?: Record<string, unknown>
}

export interface SetPayloadOp {
  payload: Record<string, unknown>
  /** Apply to these points (and/or to those matching `filter`). */
  points?: PointId[]
  filter?: Filter
  /** Optional nested JSON path. */
  key?: string
}

export interface DeletePayloadOp {
  keys: string[]
  points?: PointId[]
  filter?: Filter
}

/** Vector shape in a result. Sparse comes back as `{ indices, values }` only
 *  inside the named-map form (the upstream `Single` variant is dense-only). */
export type ResultVector = DenseVector | MultiVector | SparseVector
export type ResultVectorMap = Record<string, ResultVector>

export interface ScoredPoint {
  id: string
  score: number
  version: number
  payload?: Record<string, unknown>
  vector?: ResultVector | ResultVectorMap
}

export interface RetrievedPoint {
  id: string
  payload?: Record<string, unknown>
  vector?: ResultVector | ResultVectorMap
}

/**
 * IDF corpus selector for sparse vectors with the `idf` modifier.
 * `'global'` (or omitting) uses collection-wide statistics; `{ corpus }`
 * computes document counts and per-term frequencies over the points matching
 * the corpus filter only.
 */
export type IdfParams = 'global' | { corpus: Filter }

/** Quantization behavior at search time. */
export interface QuantizationSearchParams {
  /** Skip quantized vectors entirely. Default `false`. */
  ignore?: boolean
  /** Re-score top-k with original vectors. Unset lets the engine decide. */
  rescore?: boolean
  /** Preselection factor over `limit` before re-scoring. Default `1.0`. */
  oversampling?: number
}

/** ACORN filtered-search tuning. */
export interface AcornSearchParams {
  /** Allow ACORN for HNSW searches with low-selectivity filters. */
  enable?: boolean
  /** Skip ACORN when estimated filter selectivity exceeds this (0–1). */
  max_selectivity?: number
}

/** Additional search-time parameters (`params` on search/query/prefetch). */
export interface SearchParams {
  /** HNSW beam size. Larger = more accurate, slower. */
  hnsw_ef?: number
  /** Exact (non-approximate) search. Slow but precise. Default `false`. */
  exact?: boolean
  quantization?: QuantizationSearchParams
  /** Search only indexed/small segments to avoid slow un-indexed scans. */
  indexed_only?: boolean
  acorn?: AcornSearchParams
  /** IDF statistics population; sparse vectors with the `idf` modifier only. */
  idf?: IdfParams
}

export interface SearchRequest {
  vector: AnyVector
  using?: string
  filter?: Filter
  limit?: number
  offset?: number
  with_payload?: boolean
  with_vector?: boolean
  score_threshold?: number
  params?: SearchParams
}

/** Fusion strategy for combining prefetched result sets. */
export type Fusion = 'rrf' | 'dbsf'

/** Combine multiple prefetched result sets into a single ranked list. */
export interface FusionClause {
  fusion: Fusion
  /** Reciprocal Rank Fusion `k` parameter. Defaults to `60`. RRF only. */
  k?: number
  /** Per-source weights aligned with the prefetch array. RRF only. */
  weights?: number[]
}

/** Recommend (positive + negative examples). `strategy` defaults to `'best_score'`. */
export interface RecommendClause {
  recommend: {
    positive?: AnyVector[]
    negative?: AnyVector[]
    strategy?: 'best_score' | 'sum_scores'
  }
}

/** Discover (target + positive/negative context pairs). */
export interface DiscoverClause {
  discover: {
    target: AnyVector
    context?: Array<{ positive: AnyVector; negative: AnyVector }>
  }
}

/** Context (positive/negative pairs only — no target). */
export interface ContextClause {
  context: Array<{ positive: AnyVector; negative: AnyVector }>
}

export interface OrderByClause {
  order_by: {
    key: string
    direction?: 'asc' | 'desc'
    /** Where to start ordering from: number for int/float, or ISO string for datetime. */
    start_from?: number | string
  }
}

export interface SampleClause {
  sample: 'random'
}

/** Maximal Marginal Relevance — diversity-aware rerank. */
export interface MmrClause {
  mmr: {
    vector: AnyVector
    /** `0.0` = full diversity, `1.0` = full relevance. Default `0.5`. */
    lambda?: number
    /** Candidate pool size before MMR rerank. Default `100`. */
    candidates_limit?: number
  }
}

/**
 * The scoring clause at a query/prefetch level. A bare vector value is a
 * nearest-neighbor search (shape determines dense / sparse / multi); the
 * object variants pick the corresponding upstream `ScoringQuery`.
 *
 * Formula rescoring is intentionally absent — the upstream AST does not
 * impl Deserialize and would need a typed builder API.
 */
export type QueryClause =
  | AnyVector
  | FusionClause
  | RecommendClause
  | DiscoverClause
  | ContextClause
  | OrderByClause
  | SampleClause
  | MmrClause

export interface Prefetch {
  /** Scoring clause for this prefetch level. */
  query?: QueryClause
  /** Named vector this prefetch operates on. */
  using?: string
  filter?: Filter
  /** How many points this prefetch returns. */
  limit?: number
  score_threshold?: number
  params?: SearchParams
  /** Nested prefetches; arbitrary tree depth. */
  prefetch?: Prefetch | Prefetch[]
}

export interface QueryRequest {
  /** Prefetched result sets to combine via `query: { fusion }`. */
  prefetch?: Prefetch | Prefetch[]
  /** Scoring clause at the root. */
  query?: QueryClause
  using?: string
  filter?: Filter
  limit?: number
  offset?: number
  with_payload?: boolean
  with_vector?: boolean
  score_threshold?: number
  params?: SearchParams
  /** @deprecated Use `query: vector` instead. Still accepted. */
  vector?: number[]
  /** @deprecated Use `query: { fusion }` instead. Still accepted. */
  fusion?: Fusion
}

/** Order scroll results by a payload field: a bare key or an options object. */
export type OrderBySelector =
  | string
  | {
      key: string
      direction?: 'asc' | 'desc'
      /** Where to start from: number for int/float, ISO string for datetime. */
      start_from?: number | string
    }

export interface ScrollRequest {
  offset?: number | string
  limit?: number
  filter?: Filter
  with_payload?: boolean
  with_vector?: boolean
  /**
   * Order records by a payload field instead of by id. Note: `next_offset`
   * is not returned when ordering by field — paginate with a range filter
   * on the order key instead.
   */
  order_by?: OrderBySelector
}

export interface ScrollResult {
  points: RetrievedPoint[]
  next_offset?: string
}

export interface Filter {
  must?: Condition[]
  should?: Condition[]
  must_not?: Condition[]
  min_should?: { min_count: number; conditions: Condition[] }
}

export type Condition =
  | { key: string; match: MatchCondition }
  | { key: string; range: RangeCondition }
  | { is_empty: { key: string } }
  | { is_null: { key: string } }
  | { has_id: (number | string)[] }
  /** Match points that carry the named vector (use `""` for the default). */
  | { has_vector: string }
  /**
   * Deterministic slice of the point-id space: selects the points whose id
   * hashes into slice `index` of `total` disjoint slices. Useful for
   * processing a shard in independent batches.
   */
  | { slice: { total: number; index: number } }
  | Filter

export interface MatchCondition {
  value?: string | number | boolean
  /** Full-text match: all tokens must be present (`text` field index). */
  text?: string
  /** Full-text match: at least one token must be present. */
  text_any?: string
  /** Full-text phrase match; requires a `text` index with phrase matching. */
  phrase?: string
  /** Prefix match on a `text`-indexed field. */
  prefix?: string
  any?: (string | number)[]
  except?: (string | number)[]
}

export interface RangeCondition {
  lt?: number
  gt?: number
  gte?: number
  lte?: number
}

export type FieldIndexType =
  | 'keyword'
  | 'integer'
  | 'float'
  | 'geo'
  | 'text'
  | 'bool'
  | 'datetime'

/** Index info for one payload field, as reported by `shard.info()`. */
export interface PayloadIndexInfo {
  /** Indexed data type, e.g. `'keyword'`, `'integer'`, `'text'`. */
  data_type: string
  /** Index parameters, when the field was indexed with explicit params. */
  params?: Record<string, unknown>
  /** Number of points indexed under this field. */
  points: number
}

export interface ShardInfo {
  segments_count: number
  points_count: number
  indexed_vectors_count: number
  /** Schema of indexed payload fields, keyed by field path. */
  payload_schema: Record<string, PayloadIndexInfo>
}

export interface FacetRequest {
  /** Payload key (JSON path) to facet on. */
  key: string
  /** Maximum number of unique values to return. Default `10`. */
  limit?: number
  /** Filter that points must satisfy before being counted. */
  filter?: Filter
  /** If true, count exact number of points (slower, default `false`). */
  exact?: boolean
}

/** Facet value: keyword string, integer, UUID (canonical string), or bool. */
export type FacetValue = string | number | boolean

export interface FacetHit {
  value: FacetValue
  count: number
}

export interface FacetResponse {
  hits: FacetHit[]
}

/**
 * Group query results by a payload field. Mirrors the qdrant REST
 * `query_groups` shape: the usual query fields plus `group_by`; `limit` is
 * the number of groups and `group_size` the number of hits per group.
 */
export interface QueryGroupsRequest {
  /** Payload key (JSON path) to group by. */
  group_by: string
  /** Maximum number of groups to return. Default `10`. */
  limit?: number
  /** Maximum number of hits per group. Default `3`. */
  group_size?: number
  /** Scoring clause; same shapes as `QueryRequest.query`. */
  query?: QueryClause
  using?: string
  filter?: Filter
  prefetch?: Prefetch | Prefetch[]
  score_threshold?: number
  /** Hydrate hits with payload. Default `true`. */
  with_payload?: boolean
  /** Hydrate hits with vectors. Default `false`. */
  with_vector?: boolean
  params?: SearchParams
}

/** One result group: the shared `group_by` value and its scored hits. */
export interface PointGroup {
  key: string | number
  hits: ScoredPoint[]
}

/**
 * Distance-matrix request: sample `sample` random points, then find each
 * sample's `limit` nearest neighbours restricted to the sampled set.
 * Useful for on-device dedup and clustering.
 */
export interface SearchMatrixRequest {
  /** How many random points to sample. Default `10`. */
  sample?: number
  /** How many nearest neighbours to return per sampled point. Default `3`. */
  limit?: number
  /** Only sample points which satisfy these conditions. */
  filter?: Filter
  /** Named vector the sampled points are compared by (omit for the default). */
  using?: string
}

/** `nearests[i]` are the neighbours of `sample_ids[i]` within the sample. */
export interface SearchMatrixResult {
  sample_ids: string[]
  nearests: ScoredPoint[][]
}

/**
 * Opaque snapshot manifest. Pass to `recoverPartialSnapshot` verbatim — the
 * shape mirrors qdrant's internal representation and is not stable across
 * upstream versions; treat as a black box.
 */
export type SnapshotManifest = Record<string, unknown>

/** BM25 tokenizer choice (Qdrant snake_case wire format). */
export type Bm25TokenizerType =
  | 'prefix'
  | 'whitespace'
  | 'word'
  | 'multilingual'

/**
 * Stopwords configuration. A string is interpreted as a snake_case language
 * name (e.g. `"english"`); an object enables multiple language sets and/or
 * an additional custom word list.
 */
export type Bm25Stopwords = string | { languages?: string[]; custom?: string[] }

/**
 * Stemmer configuration. Snowball stemming with a snake_case or ISO language
 * code (e.g. `"english"` / `"en"`), or `{ type: 'none' }` to explicitly
 * disable stemming — distinct from leaving `stemmer` unset, which falls back
 * to the language default.
 */
export type Bm25Stemmer =
  | { type: 'snowball'; language: string }
  | { type: 'none' }

/**
 * Configuration for an on-device BM25 model. Mirrors Qdrant REST `Bm25Config`
 * so configs are portable between cloud and edge.
 */
export interface Bm25Config {
  /** Term-frequency saturation. Higher means TF has more impact. Default `1.2`. */
  k?: number
  /** Document length normalization. `0` = none, `1` = full. Default `0.75`. */
  b?: number
  /** Expected average document length in tokens. Default `256`. */
  avg_len?: number
  /** Tokenizer type. Default `"word"`. */
  tokenizer?: Bm25TokenizerType
  /** Language for default stopwords & stemmer. Default `"english"`. */
  language?: string
  /** Lowercase tokens. Default `true`. */
  lowercase?: boolean
  /** Fold accented characters to ASCII (e.g. `"ação"` → `"acao"`). Default `false`. */
  ascii_folding?: boolean
  /** Stopwords filter; defaults are derived from `language`. */
  stopwords?: Bm25Stopwords
  /** Stemmer; defaults are derived from `language`. */
  stemmer?: Bm25Stemmer
  /** Discard tokens shorter than this. */
  min_token_len?: number
  /** Discard tokens longer than this. */
  max_token_len?: number
}
