import { useCallback, useEffect, useRef, useState } from 'react'
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
  deletePoints(ids: number[]) {
    this._raw.deletePoints(JSON.stringify(ids))
  }
  setPayload(id: number, payload: Record<string, unknown>) {
    this._raw.setPayload(id, JSON.stringify(payload))
  }
  deletePayload(id: number, keys: string[]) {
    this._raw.deletePayload(id, JSON.stringify(keys))
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
  retrieve(
    ids: number[],
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
  deletePoints: (ids: number[]) => void
  error: string | null
}

export function useDelete(shard: ShardWrapper | null): UseDeleteResult {
  const [error, setError] = useState<string | null>(null)

  const deletePoints = useCallback(
    (ids: number[]) => {
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

export interface UseRetrieveResult {
  points: RetrievedPoint[]
  error: string | null
  retrieve: (
    ids: number[],
    opts?: { withPayload?: boolean; withVector?: boolean }
  ) => RetrievedPoint[]
}

export function useRetrieve(shard: ShardWrapper | null): UseRetrieveResult {
  const [points, setPoints] = useState<RetrievedPoint[]>([])
  const [error, setError] = useState<string | null>(null)

  const retrieve = useCallback(
    (ids: number[], opts?: { withPayload?: boolean; withVector?: boolean }) => {
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

export interface UseShardInfoResult {
  info: ShardInfo | null
  error: string | null
  refresh: () => void
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
