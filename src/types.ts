export type Distance = 'Cosine' | 'Euclid' | 'Dot' | 'Manhattan'

export interface VectorParams {
  size: number
  distance: Distance
  on_disk?: boolean
  datatype?: 'Float32' | 'Float16' | 'Uint8'
}

export interface SparseVectorParams {
  full_scan_threshold?: number
  on_disk?: boolean
  modifier?: 'None' | 'Idf'
  datatype?: 'Float32' | 'Float16' | 'Uint8'
}

export interface EdgeConfig {
  vectors: Record<string, VectorParams>
  sparse_vectors?: Record<string, SparseVectorParams>
  on_disk_payload?: boolean
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

export interface Point {
  id: number
  vector: VectorInput
  payload?: Record<string, unknown>
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

export interface SearchRequest {
  vector: AnyVector
  using?: string
  filter?: Filter
  limit?: number
  offset?: number
  with_payload?: boolean
  with_vector?: boolean
  score_threshold?: number
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

/**
 * The scoring clause at a query/prefetch level. A bare vector value is a
 * nearest-neighbor search (shape determines dense / sparse / multi); a
 * `{ fusion }` object combines prefetched sources.
 *
 * The advanced clauses (recommend, discover, context, MMR, formula, order_by,
 * sample) ship in a later release.
 */
export type QueryClause = AnyVector | FusionClause

export interface Prefetch {
  /** Scoring clause for this prefetch level. */
  query?: QueryClause
  /** Named vector this prefetch operates on. */
  using?: string
  filter?: Filter
  /** How many points this prefetch returns. */
  limit?: number
  score_threshold?: number
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
  /** @deprecated Use `query: vector` instead. Still accepted. */
  vector?: number[]
  /** @deprecated Use `query: { fusion }` instead. Still accepted. */
  fusion?: Fusion
}

export interface ScrollRequest {
  offset?: number | string
  limit?: number
  filter?: Filter
  with_payload?: boolean
  with_vector?: boolean
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
  | Filter

export interface MatchCondition {
  value?: string | number | boolean
  text?: string
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

export interface ShardInfo {
  segments_count: number
  points_count: number
  indexed_vectors_count: number
}

/** BM25 tokenizer choice (Qdrant snake_case wire format). */
export type Bm25TokenizerType = 'prefix' | 'whitespace' | 'word' | 'multilingual'

/**
 * Stopwords configuration. A string is interpreted as a snake_case language
 * name (e.g. `"english"`); an object enables multiple language sets and/or
 * an additional custom word list.
 */
export type Bm25Stopwords =
  | string
  | { languages?: string[]; custom?: string[] }

/** Snowball stemmer configuration. `language` is snake_case or ISO code (e.g. `"english"` / `"en"`). */
export interface Bm25Stemmer {
  language: string
}

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
