// ── Distance metrics ─────────────────────────────────────
export type Distance = 'Cosine' | 'Euclid' | 'Dot' | 'Manhattan'

// ── Config ───────────────────────────────────────────────
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

// ── Points ───────────────────────────────────────────────
export interface Point {
  id: number
  vector: number[] | Record<string, number[]>
  payload?: Record<string, unknown>
}

export interface ScoredPoint {
  id: string
  score: number
  version: number
  payload?: Record<string, unknown>
  vector?: number[] | Record<string, unknown>
}

export interface RetrievedPoint {
  id: string
  payload?: Record<string, unknown>
  vector?: number[] | Record<string, unknown>
}

// ── Search ───────────────────────────────────────────────
export interface SearchRequest {
  vector: number[]
  using?: string
  filter?: Filter
  limit?: number
  offset?: number
  with_payload?: boolean
  with_vector?: boolean
  score_threshold?: number
}

// ── Query ────────────────────────────────────────────────
export interface QueryRequest {
  vector?: number[]
  using?: string
  filter?: Filter
  limit?: number
  offset?: number
  with_payload?: boolean
  with_vector?: boolean
  score_threshold?: number
  fusion?: 'rrf' | 'dbsf'
}

// ── Scroll ───────────────────────────────────────────────
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

// ── Filter ───────────────────────────────────────────────
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

// ── Field Index ──────────────────────────────────────────
export type FieldIndexType =
  | 'keyword'
  | 'integer'
  | 'float'
  | 'geo'
  | 'text'
  | 'bool'
  | 'datetime'

// ── Shard Info ───────────────────────────────────────────
export interface ShardInfo {
  segments_count: number
  points_count: number
  indexed_vectors_count: number
}
