import { Directory, Paths } from 'expo-file-system'
import { useCallback, useMemo, useState } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  createShard,
  type ScoredPoint,
  type Shard,
} from 'react-native-qdrant-edge'

// Three tight clusters in a 4-dim space. The query is near cluster A, so
// nearest-neighbor returns all of A; MMR with low lambda spreads across clusters.
const ITEMS = [
  // Cluster A — close to [1, 0, 0, 0]
  { id: 1, vec: [0.90, 0.10, 0.10, 0.10], label: 'Apple',       cluster: 'fruit' },
  { id: 2, vec: [0.88, 0.12, 0.08, 0.05], label: 'Banana',      cluster: 'fruit' },
  { id: 3, vec: [0.92, 0.05, 0.12, 0.08], label: 'Orange',      cluster: 'fruit' },
  { id: 4, vec: [0.85, 0.15, 0.10, 0.12], label: 'Strawberry',  cluster: 'fruit' },
  // Cluster B — close to [0, 1, 0, 0]
  { id: 5, vec: [0.10, 0.90, 0.10, 0.05], label: 'Hammer',      cluster: 'tool'  },
  { id: 6, vec: [0.08, 0.85, 0.12, 0.10], label: 'Screwdriver', cluster: 'tool'  },
  { id: 7, vec: [0.12, 0.88, 0.15, 0.05], label: 'Wrench',      cluster: 'tool'  },
  // Cluster C — close to [0, 0, 1, 0]
  { id: 8, vec: [0.10, 0.10, 0.90, 0.05], label: 'Cat',         cluster: 'animal'},
  { id: 9, vec: [0.08, 0.05, 0.85, 0.10], label: 'Dog',         cluster: 'animal'},
  { id: 10, vec: [0.12, 0.10, 0.88, 0.08], label: 'Horse',       cluster: 'animal'},
]

const QUERY: number[] = [0.80, 0.15, 0.10, 0.05]   // near cluster A
const LAMBDAS = [0.0, 0.25, 0.5, 0.75, 1.0]

function shardPath(name: string) {
  const dir = new Directory(Paths.document, name)
  if (!dir.exists) dir.create()
  return { dir, path: dir.uri.replace('file://', '') }
}

const CLUSTER_COLOR: Record<string, string> = {
  fruit:  '#ef4444',
  tool:   '#3b82f6',
  animal: '#10b981',
}

export default function MmrScreen() {
  const [shard, setShard] = useState<Shard | null>(null)
  const [results, setResults] = useState<ScoredPoint[]>([])
  const [mode, setMode] = useState<string>('')
  const [log, setLog] = useState<string[]>([])
  const { dir: shardDir, path } = useMemo(() => shardPath('mmr'), [])

  const print = useCallback((msg: string) => {
    setLog(prev => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev])
  }, [])

  const handleSetup = useCallback(() => {
    try {
      shard?.close()
      if (shardDir.exists) { shardDir.delete(); shardDir.create() }
      const s = createShard(path, { vectors: { '': { size: 4, distance: 'Cosine' } } })
      s.upsert(ITEMS.map(it => ({
        id: it.id,
        vector: it.vec,
        payload: { label: it.label, cluster: it.cluster },
      })))
      s.flush()
      setShard(s)
      print(`Indexed ${ITEMS.length} items across 3 clusters`)
    } catch (e: any) { print(`error: ${e.message}`) }
  }, [shard, shardDir, path, print])

  const runNearest = useCallback(() => {
    if (!shard) return print('tap Setup first')
    setMode('nearest (top-5)')
    const r = shard.search({ vector: QUERY, limit: 5, with_payload: true })
    setResults(r)
    print(`nearest: ${r.length} results`)
  }, [shard, print])

  const runMmr = useCallback((lambda: number) => {
    if (!shard) return print('tap Setup first')
    setMode(`MMR λ=${lambda.toFixed(2)}`)
    const r = shard.query({
      query: { mmr: { vector: QUERY, lambda, candidates_limit: 20 } },
      limit: 5,
      with_payload: true,
    })
    setResults(r)
    print(`MMR λ=${lambda}: ${r.length} results`)
  }, [shard, print])

  return (
    <View style={s.root}>
      <View style={s.statusRow}>
        <View style={[s.dot, { backgroundColor: shard ? '#22c55e' : '#d4d4d8' }]} />
        <Text style={s.statusText}>
          {shard
            ? `${ITEMS.length} items · 3 clusters · query near cluster A (fruit)`
            : 'No shard'}
        </Text>
      </View>

      <View style={s.actions}>
        <Pill label="Setup" onPress={handleSetup} />
        <Pill label="Nearest" onPress={runNearest} />
        <Pill label="Close" variant="danger" onPress={() => { shard?.close(); setShard(null); setResults([]); setMode(''); print('closed') }} />
      </View>

      <Text style={s.label}>MMR λ (0 = full diversity, 1 = full relevance):</Text>
      <View style={s.lambdaRow}>
        {LAMBDAS.map(l => (
          <Pill key={l} label={l.toFixed(2)} onPress={() => runMmr(l)} />
        ))}
      </View>

      {mode !== '' && <Text style={s.modeLine}>mode: {mode}</Text>}

      {results.length > 0 && (
        <View style={s.resultsCard}>
          {results.map((r, i) => {
            const cluster = String((r.payload as any)?.cluster ?? '')
            const color = CLUSTER_COLOR[cluster] ?? '#a1a1aa'
            return (
              <View key={r.id} style={[s.row, i === results.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={[s.clusterDot, { backgroundColor: color }]} />
                <Text style={s.label1}>{(r.payload as any)?.label}</Text>
                <Text style={[s.cluster, { color }]}>{cluster}</Text>
                <Text style={s.score}>{r.score.toFixed(3)}</Text>
              </View>
            )
          })}
        </View>
      )}

      <View style={s.logCard}>
        <Text style={s.logTitle}>Log</Text>
        <ScrollView style={{ flex: 1 }}>
          {log.map((line, i) => <Text key={i} style={s.logLine}>{line}</Text>)}
        </ScrollView>
      </View>
    </View>
  )
}

function Pill({ label, onPress, variant }: { label: string; onPress: () => void; variant?: 'danger' }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.pill, variant === 'danger' && s.pillDanger, pressed && { opacity: 0.6 }]}>
      <Text style={[s.pillText, variant === 'danger' && s.pillTextDanger]}>{label}</Text>
    </Pressable>
  )
}

const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace'
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafa', padding: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 14, color: '#71717a', fontWeight: '500' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '600', color: '#71717a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  lambdaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  modeLine: { fontFamily: mono, fontSize: 12, color: '#6366f1', marginBottom: 12 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: '#f4f4f5', borderWidth: 1, borderColor: '#e4e4e7' },
  pillDanger: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  pillText: { fontSize: 13, fontWeight: '600', color: '#18181b' },
  pillTextDanger: { color: '#dc2626' },
  resultsCard: { backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 4, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f4f4f5', gap: 12 },
  clusterDot: { width: 10, height: 10, borderRadius: 5 },
  label1: { fontSize: 15, fontWeight: '600', color: '#18181b', flex: 1 },
  cluster: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  score: { fontFamily: mono, fontSize: 13, fontWeight: '700', color: '#6366f1', width: 56, textAlign: 'right' },
  logCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  logTitle: { fontSize: 13, fontWeight: '600', color: '#a1a1aa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  logLine: { fontFamily: mono, fontSize: 12, color: '#52525b', lineHeight: 20 },
})
