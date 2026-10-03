import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NitroModules } from 'react-native-nitro-modules'
import { Bm25, Shard } from './shard'
import type { QdrantEdge } from './specs/QdrantEdge.nitro'
import type {
  Bm25Config,
  EdgeConfig,
  FacetRequest,
  FacetResponse,
  Filter,
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
} from './types'

/** Same instance for equal JSON, so inline objects don't re-run effects each render. */
function useStableValue<T>(value: T): T {
  const key = value === undefined ? undefined : JSON.stringify(value)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => value, [key])
}

let _factory: QdrantEdge | null = null
function getFactory(): QdrantEdge {
  if (!_factory)
    _factory = NitroModules.createHybridObject<QdrantEdge>('QdrantEdge')
  return _factory
}

function _createShard(path: string, config: EdgeConfig): Shard {
  return new Shard(getFactory().createShard(path, JSON.stringify(config)))
}

function _loadShard(path: string, config?: EdgeConfig): Shard {
  return new Shard(
    getFactory().loadShard(path, config ? JSON.stringify(config) : '')
  )
}

function _openOrCreateShard(path: string, config: EdgeConfig): Shard {
  try {
    return _createShard(path, config)
  } catch {
    // Creating fails once the shard exists; open it instead.
    return _loadShard(path, config)
  }
}

export interface UseShardOptions {
  path: string
  config?: EdgeConfig
  /** Create the shard (with `config`) when none exists at `path`; otherwise it is opened. */
  create?: boolean
}

export interface UseShardResult {
  shard: Shard | null
  isOpen: boolean
  error: string | null
  open: () => void
  close: () => void
}

export function useShard(options: UseShardOptions): UseShardResult {
  const { path, create } = options
  const config = useStableValue(options.config)
  const [shard, setShard] = useState<Shard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shardRef = useRef<Shard | null>(null)

  const closeCurrent = useCallback(() => {
    if (shardRef.current) {
      try {
        shardRef.current.close()
      } catch {}
      shardRef.current = null
    }
  }, [])

  const open = useCallback(() => {
    // A second handle on the same path would fail on the WAL lock.
    closeCurrent()
    try {
      setError(null)
      const s =
        create && config
          ? _openOrCreateShard(path, config)
          : _loadShard(path, config)
      shardRef.current = s
      setShard(s)
    } catch (e: any) {
      setError(e.message ?? String(e))
      setShard(null)
    }
  }, [path, config, create, closeCurrent])

  const close = useCallback(() => {
    if (shardRef.current) {
      closeCurrent()
      setShard(null)
    }
  }, [closeCurrent])

  useEffect(() => closeCurrent, [closeCurrent])

  return { shard, isOpen: shard !== null, error, open, close }
}

export interface UseUpsertResult {
  upsert: (points: Point[]) => void
  error: string | null
}

export function useUpsert(shard: Shard | null): UseUpsertResult {
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

export function useDelete(shard: Shard | null): UseDeleteResult {
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
  shard: Shard | null
  request: SearchRequest | null
  enabled?: boolean
}

export interface UseSearchResult {
  results: ScoredPoint[]
  error: string | null
  search: (request?: SearchRequest) => ScoredPoint[]
}

export function useSearch(options: UseSearchOptions): UseSearchResult {
  const { shard, enabled = true } = options
  const request = useStableValue(options.request)
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
  shard: Shard | null
  request: QueryRequest | null
  enabled?: boolean
}

export interface UseQueryResult {
  results: ScoredPoint[]
  error: string | null
  query: (request?: QueryRequest) => ScoredPoint[]
}

export function useQuery(options: UseQueryOptions): UseQueryResult {
  const { shard, enabled = true } = options
  const request = useStableValue(options.request)
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
  shard: Shard | null
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
  const { shard, enabled = true } = options
  const request = useStableValue(options.request)
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
  shard: Shard | null
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
  const { shard, enabled = true } = options
  const request = useStableValue(options.request)
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

export function useRetrieve(shard: Shard | null): UseRetrieveResult {
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

export function useScroll(shard: Shard | null): UseScrollResult {
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
  refresh: (filter?: Filter) => number
}

export function useCount(shard: Shard | null): UseCountResult {
  const [count, setCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(
    (filter?: Filter) => {
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

function _createBm25(config?: Bm25Config): Bm25 {
  return new Bm25(getFactory().createBm25(config ? JSON.stringify(config) : ''))
}

export interface UseBm25Result {
  bm25: Bm25 | null
  error: string | null
}

/**
 * Construct (and own the lifecycle of) a BM25 model. The model is disposed
 * on unmount; pass `null` to skip creation, omit the config for defaults.
 */
export function useBm25(config?: Bm25Config | null): UseBm25Result {
  const [bm25, setBm25] = useState<Bm25 | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<Bm25 | null>(null)
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
  shard: Shard | null,
  request: FacetRequest | null
): UseFacetResult {
  const stableRequest = useStableValue(request)
  const [result, setResult] = useState<FacetResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(
    (override?: FacetRequest) => {
      const req = override ?? stableRequest
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
    [shard, stableRequest]
  )

  useEffect(() => {
    if (shard && stableRequest) refresh()
  }, [shard, stableRequest, refresh])

  return { result, error, refresh }
}

export interface UseSnapshotManifestResult {
  manifest: SnapshotManifest | null
  error: string | null
  refresh: () => void
}

/** Read (and re-read on demand) the shard's snapshot manifest. */
export function useSnapshotManifest(
  shard: Shard | null
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

export function useShardInfo(shard: Shard | null): UseShardInfoResult {
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
