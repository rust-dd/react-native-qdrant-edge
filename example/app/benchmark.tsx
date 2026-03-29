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
import { createShard } from 'react-native-qdrant-edge'

const DIMS = 128

function randomVec(dims: number): number[] {
  const v = new Array(dims)
  for (let i = 0; i < dims; i++) v[i] = Math.random()
  return v
}

function ensureDir(name: string) {
  const dir = new Directory(Paths.document, name)
  if (!dir.exists) dir.create()
  return { dir, path: dir.uri.replace('file://', '') }
}

interface Metric { label: string; value: string; unit: string; accent: string }

export default function BenchmarkScreen() {
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const { dir, path } = useMemo(() => ensureDir('bench-shard'), [])

  const print = useCallback((msg: string) => {
    setLog(prev => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev])
  }, [])

  const run = useCallback((count: number) => {
    setRunning(true); setMetrics([]); setLog([])
    setTimeout(() => {
      try {
        if (dir.exists) { dir.delete(); dir.create() }
        const shard = createShard(path, { vectors: { '': { size: DIMS, distance: 'Cosine' } } })

        print(`Generating ${count} random ${DIMS}-dim points...`)
        const points = Array.from({ length: count }, (_, i) => ({
          id: i + 1, vector: randomVec(DIMS),
          payload: { idx: i, tag: i % 2 === 0 ? 'even' : 'odd' },
        }))

        print('Inserting...')
        const t1 = performance.now()
        for (let i = 0; i < points.length; i += 500) shard.upsert(points.slice(i, i + 500))
        shard.flush()
        const insertMs = performance.now() - t1
        const rate = (count / (insertMs / 1000)).toFixed(0)
        print(`Insert: ${insertMs.toFixed(0)}ms (${rate} pts/sec)`)

        print('Building HNSW index...')
        const t2 = performance.now()
        shard.optimize()
        const optMs = performance.now() - t2
        print(`Optimize: ${optMs.toFixed(0)}ms`)

        const q = randomVec(DIMS)
        const runs = 100
        print(`Search x${runs}...`)
        const t3 = performance.now()
        for (let i = 0; i < runs; i++) shard.search({ vector: q, limit: 10 })
        const searchAvg = ((performance.now() - t3) / runs).toFixed(2)
        print(`Search: ${searchAvg}ms avg`)

        shard.createFieldIndex('tag', 'keyword')
        const t4 = performance.now()
        for (let i = 0; i < runs; i++) shard.search({ vector: q, limit: 10, filter: { must: [{ key: 'tag', match: { value: 'even' } }] } })
        const filtAvg = ((performance.now() - t4) / runs).toFixed(2)
        print(`Filtered: ${filtAvg}ms avg`)

        const info = shard.info()
        shard.close()

        setMetrics([
          { label: 'Insert', value: rate, unit: 'pts/sec', accent: '#22c55e' },
          { label: 'Index', value: optMs.toFixed(0), unit: 'ms', accent: '#f59e0b' },
          { label: 'Search', value: searchAvg, unit: 'ms', accent: '#6366f1' },
          { label: 'Filtered', value: filtAvg, unit: 'ms', accent: '#ec4899' },
          { label: 'Points', value: String(info.points_count), unit: '', accent: '#71717a' },
          { label: 'HNSW', value: String(info.indexed_vectors_count), unit: 'indexed', accent: '#06b6d4' },
        ])
      } catch (e: any) { print(`error: ${e.message}`) }
      setRunning(false)
    }, 50)
  }, [dir, path, print])

  return (
    <View style={s.root}>
      <Text style={s.desc}>{DIMS}-dimensional cosine similarity</Text>

      <View style={s.actions}>
        {[1000, 5000, 10000].map(n => (
          <Pressable key={n} onPress={() => run(n)} disabled={running} style={({ pressed }) => [s.actionBtn, (pressed || running) && { opacity: 0.5 }]}>
            <Text style={s.actionNum}>{(n / 1000).toFixed(0)}K</Text>
            <Text style={s.actionLabel}>points</Text>
          </Pressable>
        ))}
      </View>

      {metrics.length > 0 && (
        <View style={s.metricsRow}>
          {metrics.map((m, i) => (
            <View key={i} style={s.metricCard}>
              <Text style={[s.metricValue, { color: m.accent }]}>{m.value}</Text>
              <Text style={s.metricUnit}>{m.unit}</Text>
              <Text style={s.metricLabel}>{m.label}</Text>
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

const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace'
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafa', padding: 16 },
  desc: { fontSize: 14, color: '#a1a1aa', marginBottom: 16 },
  actions: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  actionBtn: { flex: 1, alignItems: 'center', paddingVertical: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e4e4e7' },
  actionNum: { fontSize: 24, fontWeight: '800', color: '#18181b' },
  actionLabel: { fontSize: 12, color: '#a1a1aa', marginTop: 2 },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  metricCard: { width: '31%', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#f4f4f5' },
  metricValue: { fontSize: 20, fontWeight: '800', fontFamily: mono },
  metricUnit: { fontSize: 10, color: '#a1a1aa', fontFamily: mono, marginTop: 1 },
  metricLabel: { fontSize: 12, color: '#71717a', marginTop: 4 },
  logCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#f4f4f5' },
  logTitle: { fontSize: 13, fontWeight: '600', color: '#a1a1aa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  logLine: { fontFamily: mono, fontSize: 12, color: '#52525b', lineHeight: 20 },
})
