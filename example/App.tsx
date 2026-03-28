import { Directory, Paths } from 'expo-file-system'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useMemo, useState } from 'react'
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  createShard,
  loadShard,
  type ScoredPoint,
  type Shard,
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

export default function App() {
  const [shard, setShard] = useState<Shard | null>(null)
  const [results, setResults] = useState<ScoredPoint[]>([])
  const [log, setLog] = useState<string[]>([])
  const [pointCount, setPointCount] = useState(0)

  const { dir: shardDir, path: path } = useMemo(() => shardPath('cities'), [])

  const print = useCallback((msg: string) => {
    setLog((prev) => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev])
  }, [])

  const handleCreate = useCallback(() => {
    try {
      shard?.close()
      if (shardDir.exists) {
        shardDir.delete()
        shardDir.create()
      }

      const s = createShard(path, {
        vectors: { '': { size: 4, distance: 'Cosine' } },
      })
      s.upsert(
        CITIES.map((c) => ({
          id: c.id,
          vector: c.vec,
          payload: { city: c.city, country: c.country },
        }))
      )
      s.flush()
      setShard(s)
      setPointCount(s.info().points_count)
      print(`Created shard with ${CITIES.length} cities`)
    } catch (e: any) {
      print(`create failed: ${e.message}`)
    }
  }, [shard, shardDir, path, print])

  const handleLoad = useCallback(() => {
    try {
      shard?.close()
      const s = loadShard(path)
      setShard(s)
      setPointCount(s.info().points_count)
      print(`Loaded shard (${s.info().points_count} points)`)
    } catch (e: any) {
      print(`load failed: ${e.message}`)
    }
  }, [shard, path, print])

  const handleSearch = useCallback(() => {
    if (!shard) return print('open a shard first')
    const r = shard.search({
      vector: [0.12, 0.22, 0.32, 0.42],
      limit: 5,
      with_payload: true,
    })
    setResults(r)
    print(`search: ${r.length} results`)
  }, [shard, print])

  const handleFiltered = useCallback(() => {
    if (!shard) return print('open a shard first')
    shard.createFieldIndex('country', 'keyword')
    const r = shard.search({
      vector: [0.12, 0.22, 0.32, 0.42],
      limit: 3,
      with_payload: true,
      filter: { must_not: [{ key: 'country', match: { value: 'Hungary' } }] },
    })
    setResults(r)
    print(`filtered: ${r.length} results (excl. Hungary)`)
  }, [shard, print])

  const handleClose = useCallback(() => {
    shard?.close()
    setShard(null)
    setPointCount(0)
    setResults([])
    print('shard closed')
  }, [shard, print])

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="light" />
      <View style={s.header}>
        <Text style={s.title}>Qdrant Edge</Text>
        <Text style={s.badge}>{shard ? `${pointCount} pts` : 'closed'}</Text>
      </View>

      <View style={s.actions}>
        <Btn label="Create" color="#22c55e" onPress={handleCreate} />
        <Btn label="Load" color="#06b6d4" onPress={handleLoad} />
        <Btn label="Search" color="#3b82f6" onPress={handleSearch} />
        <Btn label="Filtered" color="#a855f7" onPress={handleFiltered} />
        <Btn label="Close" color="#ef4444" onPress={handleClose} />
      </View>

      {results.length > 0 && (
        <View style={s.card}>
          {results.map((r) => (
            <View key={r.id} style={s.row}>
              <Text style={s.score}>{r.score.toFixed(4)}</Text>
              <Text style={s.city}>{(r.payload as any)?.city}</Text>
              <Text style={s.country}>{(r.payload as any)?.country}</Text>
            </View>
          ))}
        </View>
      )}

      <ScrollView style={s.log}>
        {log.map((line, i) => (
          <Text key={i} style={s.logLine}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

function Btn({
  label,
  color,
  onPress,
}: {
  label: string
  color: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: color, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={s.btnText}>{label}</Text>
    </Pressable>
  )
}

const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace'

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 48 : 8,
    paddingBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#f8fafc' },
  badge: {
    fontSize: 13,
    fontFamily: mono,
    color: '#94a3b8',
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 16,
  },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  card: {
    marginHorizontal: 16,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#334155',
  },
  score: { width: 60, fontFamily: mono, fontSize: 12, color: '#38bdf8' },
  city: { flex: 1, fontSize: 15, color: '#f1f5f9', fontWeight: '500' },
  country: { fontSize: 13, color: '#64748b' },
  log: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#020617',
    borderRadius: 12,
    padding: 12,
  },
  logLine: { fontFamily: mono, fontSize: 11, color: '#4ade80', lineHeight: 18 },
})
