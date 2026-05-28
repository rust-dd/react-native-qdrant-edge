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
  type FacetResponse,
  type Shard,
} from 'react-native-qdrant-edge'

// Cities spread across a handful of countries so the facet counts have shape.
const CITIES = [
  { id: 1,  vec: [0.10, 0.20, 0.30, 0.40], city: 'Budapest',  country: 'Hungary',  archived: false },
  { id: 2,  vec: [0.15, 0.25, 0.35, 0.45], city: 'Debrecen',  country: 'Hungary',  archived: false },
  { id: 3,  vec: [0.18, 0.22, 0.32, 0.42], city: 'Szeged',    country: 'Hungary',  archived: true  },
  { id: 4,  vec: [0.50, 0.60, 0.70, 0.80], city: 'Berlin',    country: 'Germany',  archived: false },
  { id: 5,  vec: [0.55, 0.65, 0.75, 0.85], city: 'Munich',    country: 'Germany',  archived: false },
  { id: 6,  vec: [0.52, 0.62, 0.72, 0.82], city: 'Hamburg',   country: 'Germany',  archived: false },
  { id: 7,  vec: [0.90, 0.10, 0.20, 0.30], city: 'Paris',     country: 'France',   archived: false },
  { id: 8,  vec: [0.85, 0.15, 0.25, 0.35], city: 'Lyon',      country: 'France',   archived: true  },
  { id: 9,  vec: [0.20, 0.80, 0.10, 0.90], city: 'London',    country: 'UK',       archived: false },
  { id: 10, vec: [0.30, 0.30, 0.30, 0.30], city: 'Vienna',    country: 'Austria',  archived: false },
  { id: 11, vec: [0.32, 0.32, 0.32, 0.32], city: 'Salzburg',  country: 'Austria',  archived: true  },
  { id: 12, vec: [0.15, 0.25, 0.35, 0.45], city: 'Prague',    country: 'Czechia',  archived: false },
]

function shardPath(name: string) {
  const dir = new Directory(Paths.document, name)
  if (!dir.exists) dir.create()
  return { dir, path: dir.uri.replace('file://', '') }
}

export default function FacetScreen() {
  const [shard, setShard] = useState<Shard | null>(null)
  const [hits, setHits] = useState<FacetResponse['hits']>([])
  const [filterLabel, setFilterLabel] = useState('')
  const [log, setLog] = useState<string[]>([])
  const { dir: shardDir, path } = useMemo(() => shardPath('facets'), [])

  const print = useCallback((msg: string) => {
    setLog(prev => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev])
  }, [])

  const handleSetup = useCallback(() => {
    try {
      shard?.close()
      if (shardDir.exists) { shardDir.delete(); shardDir.create() }
      const s = createShard(path, { vectors: { '': { size: 4, distance: 'Cosine' } } })
      s.upsert(CITIES.map(c => ({
        id: c.id,
        vector: c.vec,
        payload: { city: c.city, country: c.country, archived: c.archived },
      })))
      s.createFieldIndex('country', 'keyword')
      s.createFieldIndex('archived', 'bool')
      s.flush()
      setShard(s)
      print(`Indexed ${CITIES.length} cities + country/archived indexes`)
    } catch (e: any) { print(`error: ${e.message}`) }
  }, [shard, shardDir, path, print])

  const facetAll = useCallback(() => {
    if (!shard) return print('tap Setup first')
    const r = shard.facet({ key: 'country', limit: 10, exact: true })
    setHits(r.hits); setFilterLabel('all cities')
    print(`facet country: ${r.hits.length} buckets`)
  }, [shard, print])

  const facetActive = useCallback(() => {
    if (!shard) return print('tap Setup first')
    const r = shard.facet({
      key: 'country', limit: 10, exact: true,
      filter: { must: [{ key: 'archived', match: { value: false } }] },
    })
    setHits(r.hits); setFilterLabel('archived = false')
    print(`facet country (active): ${r.hits.length} buckets`)
  }, [shard, print])

  const archiveAll = useCallback(() => {
    if (!shard) return print('tap Setup first')
    // Bulk payload update by filter — flips archived from false → true.
    shard.setPayloadOp({
      payload: { archived: true },
      filter: { must: [{ key: 'archived', match: { value: false } }] },
    })
    shard.flush()
    print('archived everything that was active')
    facetActive()  // re-run to confirm
  }, [shard, facetActive, print])

  const total = useMemo(() => hits.reduce((a, h) => a + h.count, 0), [hits])
  const maxCount = useMemo(() => Math.max(1, ...hits.map(h => h.count)), [hits])

  return (
    <View style={s.root}>
      <View style={s.statusRow}>
        <View style={[s.dot, { backgroundColor: shard ? '#22c55e' : '#d4d4d8' }]} />
        <Text style={s.statusText}>{shard ? `${CITIES.length} cities indexed` : 'No shard'}</Text>
      </View>

      <View style={s.actions}>
        <Pill label="Setup" onPress={handleSetup} />
        <Pill label="Facet country" onPress={facetAll} />
        <Pill label="Facet active only" onPress={facetActive} />
        <Pill label="Archive active" onPress={archiveAll} />
        <Pill label="Close" variant="danger" onPress={() => { shard?.close(); setShard(null); setHits([]); setFilterLabel(''); print('closed') }} />
      </View>

      {hits.length > 0 && (
        <View style={s.resultsCard}>
          <Text style={s.cardHeader}>country · {filterLabel} · {total} total</Text>
          {hits.map((h, i) => (
            <View key={String(h.value)} style={[s.row, i === hits.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={s.bucketLabel}>{String(h.value)}</Text>
              <View style={s.barWrap}>
                <View style={[s.bar, { flex: h.count / maxCount }]} />
                <View style={{ flex: 1 - h.count / maxCount }} />
              </View>
              <Text style={s.countText}>{h.count}</Text>
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: '#f4f4f5', borderWidth: 1, borderColor: '#e4e4e7' },
  pillDanger: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  pillText: { fontSize: 13, fontWeight: '600', color: '#18181b' },
  pillTextDanger: { color: '#dc2626' },
  resultsCard: { backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 12, paddingTop: 14, paddingBottom: 4, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardHeader: { fontSize: 12, fontWeight: '600', color: '#a1a1aa', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f4f4f5', gap: 10 },
  bucketLabel: { fontSize: 14, fontWeight: '500', color: '#18181b', width: 90 },
  barWrap: { flex: 1, flexDirection: 'row', height: 8, borderRadius: 4, backgroundColor: '#f4f4f5', overflow: 'hidden' },
  bar: { backgroundColor: '#6366f1' },
  countText: { fontFamily: mono, fontSize: 13, fontWeight: '700', color: '#6366f1', width: 30, textAlign: 'right' },
  logCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  logTitle: { fontSize: 13, fontWeight: '600', color: '#a1a1aa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  logLine: { fontFamily: mono, fontSize: 12, color: '#52525b', lineHeight: 20 },
})
