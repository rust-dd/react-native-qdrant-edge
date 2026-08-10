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
  type PointGroup,
  type SearchMatrixResult,
  type Shard,
} from 'react-native-qdrant-edge'

// Cities clustered by country; vectors within a country sit close together so
// query-groups and the distance matrix have visible structure.
const CITIES = [
  { id: 1,  vec: [0.10, 0.20, 0.30, 0.40], city: 'Budapest', country: 'Hungary' },
  { id: 2,  vec: [0.12, 0.22, 0.32, 0.42], city: 'Debrecen', country: 'Hungary' },
  { id: 3,  vec: [0.14, 0.20, 0.30, 0.44], city: 'Szeged',   country: 'Hungary' },
  { id: 4,  vec: [0.50, 0.60, 0.70, 0.80], city: 'Berlin',   country: 'Germany' },
  { id: 5,  vec: [0.52, 0.62, 0.72, 0.82], city: 'Munich',   country: 'Germany' },
  { id: 6,  vec: [0.54, 0.60, 0.70, 0.84], city: 'Hamburg',  country: 'Germany' },
  { id: 7,  vec: [0.90, 0.10, 0.20, 0.30], city: 'Paris',    country: 'France'  },
  { id: 8,  vec: [0.88, 0.12, 0.22, 0.32], city: 'Lyon',     country: 'France'  },
  { id: 9,  vec: [0.20, 0.80, 0.10, 0.90], city: 'London',   country: 'UK'      },
  { id: 10, vec: [0.22, 0.78, 0.12, 0.88], city: 'Leeds',    country: 'UK'      },
]

const CITY_BY_ID = new Map(CITIES.map(c => [String(c.id), c]))

function shardPath(name: string) {
  const dir = new Directory(Paths.document, name)
  if (!dir.exists) dir.create()
  return { dir, path: dir.uri.replace('file://', '') }
}

export default function GroupsScreen() {
  const [shard, setShard] = useState<Shard | null>(null)
  const [groups, setGroups] = useState<PointGroup[]>([])
  const [matrix, setMatrix] = useState<SearchMatrixResult | null>(null)
  const [log, setLog] = useState<string[]>([])
  const { dir: shardDir, path } = useMemo(() => shardPath('groups'), [])

  const print = useCallback((msg: string) => {
    setLog(prev => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev])
  }, [])

  const handleSetup = useCallback(() => {
    try {
      shard?.close()
      if (shardDir.exists) { shardDir.delete(); shardDir.create() }
      const s = createShard(path, {
        vectors: { '': { size: 4, distance: 'Cosine' } },
        // 0.8.0: per-segment reads run on a parallel search pool.
        max_search_threads: 2,
      })
      s.upsert(CITIES.map(c => ({
        id: c.id,
        vector: c.vec,
        payload: { city: c.city, country: c.country },
      })))
      s.createFieldIndex('country', 'keyword')
      s.flush()
      setShard(s)
      print(`Indexed ${CITIES.length} cities across 4 countries`)
    } catch (e: any) { print(`error: ${e.message}`) }
  }, [shard, shardDir, path, print])

  const runGroups = useCallback(() => {
    if (!shard) return print('tap Setup first')
    try {
      // Nearest cities to the probe, grouped by country — each country
      // appears once with its own top hits, instead of one country
      // dominating the result list.
      const r = shard.queryGroups({
        query: [0.11, 0.21, 0.31, 0.41],
        group_by: 'country',
        limit: 3,
        group_size: 2,
        with_payload: true,
      })
      setGroups(r); setMatrix(null)
      print(`query groups: ${r.length} countries`)
    } catch (e: any) { print(`error: ${e.message}`) }
  }, [shard, print])

  const runMatrix = useCallback(() => {
    if (!shard) return print('tap Setup first')
    try {
      // Sample points and find each sample's nearest neighbours within the
      // sample — near-duplicate pairs surface with the highest scores.
      const r = shard.searchMatrix({ sample: 8, limit: 2 })
      setMatrix(r); setGroups([])
      print(`search matrix: ${r.sample_ids.length} samples`)
    } catch (e: any) { print(`error: ${e.message}`) }
  }, [shard, print])

  return (
    <View style={s.root}>
      <View style={s.statusRow}>
        <View style={[s.dot, { backgroundColor: shard ? '#22c55e' : '#d4d4d8' }]} />
        <Text style={s.statusText}>{shard ? `${CITIES.length} cities indexed` : 'No shard'}</Text>
      </View>

      <View style={s.actions}>
        <Pill label="Setup" onPress={handleSetup} />
        <Pill label="Query groups" onPress={runGroups} />
        <Pill label="Search matrix" onPress={runMatrix} />
        <Pill label="Close" variant="danger" onPress={() => { shard?.close(); setShard(null); setGroups([]); setMatrix(null); print('closed') }} />
      </View>

      {groups.length > 0 && (
        <View style={s.resultsCard}>
          <Text style={s.cardHeader}>nearest cities · grouped by country</Text>
          {groups.map((g, gi) => (
            <View key={String(g.key)} style={[s.groupBlock, gi === groups.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={s.groupKey}>{String(g.key)}</Text>
              {g.hits.map(h => (
                <View key={h.id} style={s.hitRow}>
                  <Text style={s.hitLabel}>{String(h.payload?.city ?? h.id)}</Text>
                  <Text style={s.scoreText}>{h.score.toFixed(3)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      {matrix && (
        <View style={s.resultsCard}>
          <Text style={s.cardHeader}>distance matrix · nearest within sample</Text>
          {matrix.sample_ids.map((id, i) => (
            <View key={id} style={[s.groupBlock, i === matrix.sample_ids.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={s.groupKey}>{CITY_BY_ID.get(id)?.city ?? id}</Text>
              {matrix.nearests[i]?.map(n => (
                <View key={n.id} style={s.hitRow}>
                  <Text style={s.hitLabel}>{CITY_BY_ID.get(n.id)?.city ?? n.id}</Text>
                  <Text style={s.scoreText}>{n.score.toFixed(3)}</Text>
                </View>
              ))}
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
  groupBlock: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f4f4f5' },
  groupKey: { fontSize: 14, fontWeight: '700', color: '#6366f1', marginBottom: 4 },
  hitRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, paddingLeft: 12 },
  hitLabel: { fontSize: 14, color: '#18181b' },
  scoreText: { fontFamily: mono, fontSize: 13, fontWeight: '600', color: '#a1a1aa' },
  logCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  logTitle: { fontSize: 13, fontWeight: '600', color: '#a1a1aa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  logLine: { fontFamily: mono, fontSize: 12, color: '#52525b', lineHeight: 20 },
})
