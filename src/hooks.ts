import { useCallback, useEffect, useRef, useState } from 'react'
import { NitroModules } from 'react-native-nitro-modules'
import type { QdrantEdge } from './specs/QdrantEdge.nitro'
import type { QdrantEdgeBm25 } from './specs/QdrantEdgeBm25.nitro'
import type { QdrantEdgeShard } from './specs/QdrantEdgeShard.nitro'
import type {
  Bm25Config,
  EdgeConfig,
  FacetRequest,
  FacetResponse,
  FieldIndexType,
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
  ShardInfo,
  SnapshotManifest,
  SparseVector,
} from './types'

class ShardWrapper {
  constructor(private readonly _raw: QdrantEdgeShard) {}
  flush() {
    this._raw.flush()
  }
  optimize() {
    this._raw.optimize()
  }
  close() {
    this._raw.close()
  }
  upsert(points: Point[]) {
    this._raw.upsert(JSON.stringify(points))
  }
  deletePoints(ids: PointId[]) {
    this._raw.deletePoints(JSON.stringify(ids))
  }
  setPayload(id: PointId, payload: Record<string, unknown>, key?: string) {
    this._raw.setPayload(JSON.stringify({ payload, points: [id], key }))
  }
  deletePayload(id: PointId, keys: string[]) {
    this._raw.deletePayload(JSON.stringify({ keys, points: [id] }))
  }
  createFieldIndex(name: string, type: FieldIndexType) {
    this._raw.createFieldIndex(name, type)
  }
  deleteFieldIndex(name: string) {
    this._raw.deleteFieldIndex(name)
  }
  search(req: SearchRequest): ScoredPoint[] {
    return JSON.parse(this._raw.search(JSON.stringify(req)))
  }
  query(req: QueryRequest): ScoredPoint[] {
    return JSON.parse(this._raw.query(JSON.stringify(req)))
  }
  queryGroups(req: QueryGroupsRequest): PointGroup[] {
    return JSON.parse(this._raw.queryGroups(JSON.stringify(req)))
  }
  searchMatrix(req: SearchMatrixRequest = {}): SearchMatrixResult {
    return JSON.parse(this._raw.searchMatrix(JSON.stringify(req)))
  }
  retrieve(
    ids: PointId[],
    opts: { withPayload?: boolean; withVector?: boolean } = {}
  ): RetrievedPoint[] {
    return JSON.parse(
      this._raw.retrieve(
        JSON.stringify(ids),
        opts.withPayload ?? true,
        opts.withVector ?? false
      )
    )
  }
  scroll(req: ScrollRequest = {}): ScrollResult {
    return JSON.parse(this._raw.scroll(JSON.stringify(req)))
  }
  count(filter?: Record<string, unknown>): number {
    return this._raw.count(filter ? JSON.stringify(filter) : '')
  }
  info(): ShardInfo {
    return JSON.parse(this._raw.info())
  }
  facet(request: FacetRequest): FacetResponse {
    return JSON.parse(this._raw.facet(JSON.stringify(request)))
  }
  snapshotManifest(): SnapshotManifest {
    return JSON.parse(this._raw.snapshotManifest())
  }
}

let _factory: QdrantEdge | null = null
function getFactory(): QdrantEdge {
  if (!_factory)
    _factory = NitroModules.createHybridObject<QdrantEdge>('QdrantEdge')
  return _factory
}

function _createShard(path: string, config: EdgeConfig): ShardWrapper {
  return new ShardWrapper(
    getFactory().createShard(path, JSON.stringify(config))
  )
}

function _loadShard(path: string, config?: EdgeConfig): ShardWrapper {
  return new ShardWrapper(
    getFactory().loadShard(path, config ? JSON.stringify(config) : '')
  )
}

export interface UseShardOptions {
  path: string
  config?: EdgeConfig
  create?: boolean
}

export interface UseShardResult {
  shard: ShardWrapper | null
  isOpen: boolean
  error: string | null
  open: () => void
  close: () => void
}

export function useShard(options: UseShardOptions): UseShardResult {
  const { path, config, create } = options
  const [shard, setShard] = useState<ShardWrapper | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shardRef = useRef<ShardWrapper | null>(null)

  const open = useCallback(() => {
    try {
      setError(null)
      const s =
        create && config ? _createShard(path, config) : _loadShard(path, config)
      shardRef.current = s
      setShard(s)
    } catch (e: any) {
      setError(e.message ?? String(e))
      setShard(null)
    }
  }, [path, config, create])

  const close = useCallback(() => {
    if (shardRef.current) {
      try {
        shardRef.current.close()
      } catch {}
      shardRef.current = null
      setShard(null)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (shardRef.current) {
        try {
          shardRef.current.close()
        } catch {}
        shardRef.current = null
      }
    }
  }, [])

  return { shard, isOpen: shard !== null, error, open, close }
}

export interface UseUpsertResult {
  upsert: (points: Point[]) => void
  error: string | null
}

export function useUpsert(shard: ShardWrapper | null): UseUpsertResult {
  const [error, setError] = useState<string | null>(null)

  const upsert = useCallback(
    (points: Point[]) => {
      if (!shard) {
        setError('shard not open')
        return
      }
      try {
        setError(null)
        shard.upsert(points)
      } catch (e: any) {
        setError(e.message ?? String(e))
      }
    },
    [shard]
  )

  return { upsert, error }
}

export interface UseDeleteResult {
  deletePoints: (ids: PointId[]) => void
  error: string | null
}

export function useDelete(shard: ShardWrapper | null): UseDeleteResult {
  const [error, setError] = useState<string | null>(null)

  const deletePoints = useCallback(
    (ids: PointId[]) => {
      if (!shard) {
        setError('shard not open')
        return
      }
      try {
        setError(null)
        shard.deletePoints(ids)
      } catch (e: any) {
        setError(e.message ?? String(e))
      }
    },
    [shard]
  )

  return { deletePoints, error }
}

export interface UseSearchOptions {
  shard: ShardWrapper | null
  request: SearchRequest | null
  enabled?: boolean
}

export interface UseSearchResult {
  results: ScoredPoint[]
  error: string | null
  search: (request?: SearchRequest) => ScoredPoint[]
}

export function useSearch(options: UseSearchOptions): UseSearchResult {
  const { shard, request, enabled = true } = options
  const [results, setResults] = useState<ScoredPoint[]>([])
  const [error, setError] = useState<string | null>(null)

  const search = useCallback(
    (override?: SearchRequest) => {
      const req = override ?? request
      if (!shard || !req) return []
      try {
        setError(null)
        const r = shard.search(req)
        setResults(r)
        return r
      } catch (e: any) {
        setError(e.message ?? String(e))
        return []
      }
    },
    [shard, request]
  )

  useEffect(() => {
    if (enabled && shard && request) search()
  }, [enabled, shard, request, search])

  return { results, error, search }
}

export interface UseQueryOptions {
  shard: ShardWrapper | null
  request: QueryRequest | null
  enabled?: boolean
}

export interface UseQueryResult {
  results: ScoredPoint[]
  error: string | null
  query: (request?: QueryRequest) => ScoredPoint[]
}

export function useQuery(options: UseQueryOptions): UseQueryResult {
  const { shard, request, enabled = true } = options
  const [results, setResults] = useState<ScoredPoint[]>([])
  const [error, setError] = useState<string | null>(null)

  const query = useCallback(
    (override?: QueryRequest) => {
      const req = override ?? request
      if (!shard || !req) return []
      try {
        setError(null)
        const r = shard.query(req)
        setResults(r)
        return r
      } catch (e: any) {
        setError(e.message ?? String(e))
        return []
      }
    },
    [shard, request]
  )

  useEffect(() => {
    if (enabled && shard && request) query()
  }, [enabled, shard, request, query])

  return { results, error, query }
}

export interface UseQueryGroupsOptions {
  shard: ShardWrapper | null
  request: QueryGroupsRequest | null
  enabled?: boolean
}

export interface UseQueryGroupsResult {
  groups: PointGroup[]
  error: string | null
  queryGroups: (request?: QueryGroupsRequest) => PointGroup[]
}

export function useQueryGroups(
  options: UseQueryGroupsOptions
): UseQueryGroupsResult {
  const { shard, request, enabled = true } = options
  const [groups, setGroups] = useState<PointGroup[]>([])
  const [error, setError] = useState<string | null>(null)

  const queryGroups = useCallback(
    (override?: QueryGroupsRequest) => {
      const req = override ?? request
      if (!shard || !req) return []
      try {
        setError(null)
        const r = shard.queryGroups(req)
        setGroups(r)
        return r
      } catch (e: any) {
        setError(e.message ?? String(e))
        return []
      }
    },
    [shard, request]
  )

  useEffect(() => {
    if (enabled && shard && request) queryGroups()
  }, [enabled, shard, request, queryGroups])

  return { groups, error, queryGroups }
}

export interface UseSearchMatrixOptions {
  shard: ShardWrapper | null
  request?: SearchMatrixRequest
  enabled?: boolean
}

export interface UseSearchMatrixResult {
  matrix: SearchMatrixResult | null
  error: string | null
  searchMatrix: (request?: SearchMatrixRequest) => SearchMatrixResult | null
}

export function useSearchMatrix(
  options: UseSearchMatrixOptions
): UseSearchMatrixResult {
  const { shard, request, enabled = true } = options
  const [matrix, setMatrix] = useState<SearchMatrixResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const searchMatrix = useCallback(
    (override?: SearchMatrixRequest) => {
      if (!shard) return null
      try {
        setError(null)
        const r = shard.searchMatrix(override ?? request ?? {})
        setMatrix(r)
        return r
      } catch (e: any) {
        setError(e.message ?? String(e))
        return null
      }
    },
    [shard, request]
  )

  useEffect(() => {
    if (enabled && shard) searchMatrix()
  }, [enabled, shard, searchMatrix])

  return { matrix, error, searchMatrix }
}

export interface UseRetrieveResult {
  points: RetrievedPoint[]
  error: string | null
  retrieve: (
    ids: PointId[],
    opts?: { withPayload?: boolean; withVector?: boolean }
  ) => RetrievedPoint[]
}

export function useRetrieve(shard: ShardWrapper | null): UseRetrieveResult {
  const [points, setPoints] = useState<RetrievedPoint[]>([])
  const [error, setError] = useState<string | null>(null)

  const retrieve = useCallback(
    (
      ids: PointId[],
      opts?: { withPayload?: boolean; withVector?: boolean }
    ) => {
      if (!shard) {
        setError('shard not open')
        return []
      }
      try {
        setError(null)
        const r = shard.retrieve(ids, opts)
        setPoints(r)
        return r
      } catch (e: any) {
        setError(e.message ?? String(e))
        return []
      }
    },
    [shard]
  )

  return { points, error, retrieve }
}

export interface UseScrollResult {
  points: RetrievedPoint[]
  nextOffset: string | undefined
  error: string | null
  scroll: (request?: ScrollRequest) => ScrollResult
}

export function useScroll(shard: ShardWrapper | null): UseScrollResult {
  const [points, setPoints] = useState<RetrievedPoint[]>([])
  const [nextOffset, setNextOffset] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)

  const scroll = useCallback(
    (request?: ScrollRequest) => {
      const empty: ScrollResult = { points: [], next_offset: undefined }
      if (!shard) {
        setError('shard not open')
        return empty
      }
      try {
        setError(null)
        const r = shard.scroll(request)
        setPoints(r.points)
        setNextOffset(r.next_offset)
        return r
      } catch (e: any) {
        setError(e.message ?? String(e))
        return empty
      }
    },
    [shard]
  )

  return { points, nextOffset, error, scroll }
}

export interface UseCountResult {
  count: number
  error: string | null
  refresh: (filter?: Record<string, unknown>) => number
}

export function useCount(shard: ShardWrapper | null): UseCountResult {
  const [count, setCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(
    (filter?: Record<string, unknown>) => {
      if (!shard) {
        setError('shard not open')
        return 0
      }
      try {
        setError(null)
        const c = shard.count(filter)
        setCount(c)
        return c
      } catch (e: any) {
        setError(e.message ?? String(e))
        return 0
      }
    },
    [shard]
  )

  useEffect(() => {
    if (shard) refresh()
  }, [shard, refresh])

  return { count, error, refresh }
}

class Bm25Wrapper {
  constructor(private readonly _raw: QdrantEdgeBm25) {}
  embedQuery(text: string): SparseVector {
    return JSON.parse(this._raw.embedQuery(text)) as SparseVector
  }
  embedDocument(text: string): SparseVector {
    return JSON.parse(this._raw.embedDocument(text)) as SparseVector
  }
  close() {
    this._raw.close()
  }
}

function _createBm25(config?: Bm25Config): Bm25Wrapper {
  return new Bm25Wrapper(
    getFactory().createBm25(config ? JSON.stringify(config) : '')
  )
}

export interface UseBm25Result {
  bm25: Bm25Wrapper | null
  error: string | null
}

/**
 * Construct (and own the lifecycle of) a BM25 model. The model is disposed
 * on unmount; pass `null`/`undefined` to skip creation.
 */
export function useBm25(config?: Bm25Config | null): UseBm25Result {
  const [bm25, setBm25] = useState<Bm25Wrapper | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<Bm25Wrapper | null>(null)
  const configKey = config ? JSON.stringify(config) : 'NONE'

  useEffect(() => {
    if (ref.current) {
      try {
        ref.current.close()
      } catch {}
      ref.current = null
    }
    if (config === null) {
      setBm25(null)
      setError(null)
      return
    }
    try {
      setError(null)
      const instance = _createBm25(config ?? undefined)
      ref.current = instance
      setBm25(instance)
    } catch (e: any) {
      setError(e.message ?? String(e))
      setBm25(null)
    }
    return () => {
      if (ref.current) {
        try {
          ref.current.close()
        } catch {}
        ref.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey])

  return { bm25, error }
}

export interface UseShardInfoResult {
  info: ShardInfo | null
  error: string | null
  refresh: () => void
}

export interface UseFacetResult {
  result: FacetResponse | null
  error: string | null
  refresh: (request?: FacetRequest) => FacetResponse | null
}

/**
 * Facet a payload key. Re-runs automatically when `request` changes; pass
 * `null` to skip the initial run.
 */
export function useFacet(
  shard: ShardWrapper | null,
  request: FacetRequest | null
): UseFacetResult {
  const [result, setResult] = useState<FacetResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(
    (override?: FacetRequest) => {
      const req = override ?? request
      if (!shard || !req) return null
      try {
        setError(null)
        const r = shard.facet(req)
        setResult(r)
        return r
      } catch (e: any) {
        setError(e.message ?? String(e))
        return null
      }
    },
    [shard, request]
  )

  useEffect(() => {
    if (shard && request) refresh()
  }, [shard, request, refresh])

  return { result, error, refresh }
}

export interface UseSnapshotManifestResult {
  manifest: SnapshotManifest | null
  error: string | null
  refresh: () => void
}

/** Read (and re-read on demand) the shard's snapshot manifest. */
export function useSnapshotManifest(
  shard: ShardWrapper | null
): UseSnapshotManifestResult {
  const [manifest, setManifest] = useState<SnapshotManifest | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!shard) {
      setManifest(null)
      return
    }
    try {
      setError(null)
      setManifest(shard.snapshotManifest())
    } catch (e: any) {
      setError(e.message ?? String(e))
    }
  }, [shard])

  useEffect(() => {
    if (shard) refresh()
  }, [shard, refresh])

  return { manifest, error, refresh }
}

export function useShardInfo(shard: ShardWrapper | null): UseShardInfoResult {
  const [info, setInfo] = useState<ShardInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!shard) {
      setInfo(null)
      return
    }
    try {
      setError(null)
      setInfo(shard.info())
    } catch (e: any) {
      setError(e.message ?? String(e))
    }
  }, [shard])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { info, error, refresh }
}
