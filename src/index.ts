import { NitroModules } from 'react-native-nitro-modules'
import type { QdrantEdge } from './specs/QdrantEdge.nitro'
import type { QdrantEdgeShard } from './specs/QdrantEdgeShard.nitro'
import type {
  EdgeConfig,
  FieldIndexType,
  Point,
  QueryRequest,
  RetrievedPoint,
  ScoredPoint,
  ScrollRequest,
  ScrollResult,
  SearchRequest,
  ShardInfo,
} from './types'

export type {
  Distance,
  EdgeConfig,
  FieldIndexType,
  Filter,
  MatchCondition,
  Point,
  QueryRequest,
  RangeCondition,
  RetrievedPoint,
  ScoredPoint,
  ScrollRequest,
  ScrollResult,
  SearchRequest,
  ShardInfo,
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

  deletePoints(ids: number[]): void {
    this._raw.deletePoints(JSON.stringify(ids))
  }

  setPayload(pointId: number, payload: Record<string, unknown>): void {
    this._raw.setPayload(pointId, JSON.stringify(payload))
  }

  deletePayload(pointId: number, keys: string[]): void {
    this._raw.deletePayload(pointId, JSON.stringify(keys))
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
    ids: number[],
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

export { useShard, useSearch, useQuery, useShardInfo } from './hooks'
export type {
  UseShardOptions,
  UseShardResult,
  UseSearchOptions,
  UseSearchResult,
  UseQueryOptions,
  UseQueryResult,
  UseShardInfoResult,
} from './hooks'
