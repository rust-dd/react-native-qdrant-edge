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
  loadShard,
  type Shard,
  type ScoredPoint,
} from 'react-native-qdrant-edge'

const CITIES = [
  { id: 1, vec: [0.1, 0.2, 0.3, 0.4], city: 'Budapest', country: 'Hungary' },
  { id: 2, vec: [0.5, 0.6, 0.7, 0.8], city: 'Berlin', country: 'Germany' },
  { id: 3, vec: [0.9, 0.1, 0.2, 0.3], city: 'Paris', country: 'France' },
  { id: 4, vec: [0.2, 0.8, 0.1, 0.9], city: 'London', country: 'UK' },
  { id: 5, vec: [0.3, 0.3, 0.3, 0.3], city: 'Vienna', country: 'Austria' },
  { id: 6, vec: [0.15, 0.25, 0.35, 0.45], city: 'Prague', country: 'Czechia' },
]

function shardPath(name: string) {
  const dir = new Directory(Paths.document, name)
  if (!dir.exists) dir.create()
  return { dir, path: dir.uri.replace('file://', '') }
}

export default function BasicsScreen() {
  const [shard, setShard] = useState<Shard | null>(null)
  const [results, setResults] = useState<ScoredPoint[]>([])
  const [log, setLog] = useState<string[]>([])
  const [pointCount, setPointCount] = useState(0)
  const { dir: shardDir, path } = useMemo(() => shardPath('cities'), [])

  const print = useCallback((msg: string) => {
    setLog(prev => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev])
  }, [])

  const handleCreate = useCallback(() => {
    try {
      shard?.close()
      if (shardDir.exists) { shardDir.delete(); shardDir.create() }
      const s = createShard(path, { vectors: { '': { size: 4, distance: 'Cosine' } } })
      s.upsert(CITIES.map(c => ({ id: c.id, vector: c.vec, payload: { city: c.city, country: c.country } })))
      s.flush()
      setShard(s)
      setPointCount(s.info().points_count)
      print(`Created shard with ${CITIES.length} cities`)
    } catch (e: any) { print(`error: ${e.message}`) }
  }, [shard, shardDir, path, print])

  const handleLoad = useCallback(() => {
    try {
      shard?.close()
      const s = loadShard(path)
      setShard(s)
      setPointCount(s.info().points_count)
      print(`Loaded (${s.info().points_count} points)`)
    } catch (e: any) { print(`error: ${e.message}`) }
  }, [shard, path, print])

  const handleSearch = useCallback(() => {
    if (!shard) return print('open a shard first')
    const r = shard.search({ vector: [0.12, 0.22, 0.32, 0.42], limit: 5, with_payload: true })
    setResults(r)
    print(`search: ${r.length} results`)
  }, [shard, print])

  const handleFiltered = useCallback(() => {
    if (!shard) return print('open a shard first')
    shard.createFieldIndex('country', 'keyword')
    const r = shard.search({
      vector: [0.12, 0.22, 0.32, 0.42], limit: 3, with_payload: true,
      filter: { must_not: [{ key: 'country', match: { value: 'Hungary' } }] },
    })
    setResults(r)
    print(`filtered: ${r.length} results (excl. Hungary)`)
  }, [shard, print])

  return (
    <View style={s.root}>
      <View style={s.statusRow}>
        <View style={[s.dot, { backgroundColor: shard ? '#22c55e' : '#d4d4d8' }]} />
        <Text style={s.statusText}>{shard ? `${pointCount} points` : 'No shard'}</Text>
      </View>

      <View style={s.actions}>
        <Pill label="Create" onPress={handleCreate} />
        <Pill label="Load" onPress={handleLoad} />
        <Pill label="Search" onPress={handleSearch} />
        <Pill label="Filter" onPress={handleFiltered} />
        <Pill label="Close" variant="danger" onPress={() => { shard?.close(); setShard(null); setPointCount(0); setResults([]); print('closed') }} />
      </View>

      {results.length > 0 && (
        <View style={s.resultsCard}>
          {results.map((r, i) => (
            <View key={r.id} style={[s.resultRow, i === results.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={s.scoreChip}>
                <Text style={s.scoreText}>{r.score.toFixed(3)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cityText}>{(r.payload as any)?.city}</Text>
                <Text style={s.countryText}>{(r.payload as any)?.country}</Text>
              </View>
            </View>
          ))}
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#f4f4f5', borderWidth: 1, borderColor: '#e4e4e7' },
  pillDanger: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  pillText: { fontSize: 14, fontWeight: '600', color: '#18181b' },
  pillTextDanger: { color: '#dc2626' },
  resultsCard: { backgroundColor: '#fff', borderRadius: 16, padding: 4, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f4f4f5', gap: 12 },
  scoreChip: { backgroundColor: '#eef2ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  scoreText: { fontSize: 13, fontWeight: '700', color: '#6366f1', fontFamily: mono },
  cityText: { fontSize: 15, fontWeight: '600', color: '#18181b' },
  countryText: { fontSize: 13, color: '#a1a1aa' },
  logCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  logTitle: { fontSize: 13, fontWeight: '600', color: '#a1a1aa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  logLine: { fontFamily: mono, fontSize: 12, color: '#52525b', lineHeight: 20 },
})
