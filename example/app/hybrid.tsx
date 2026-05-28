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
  createBm25,
  createShard,
  type Bm25,
  type ScoredPoint,
  type Shard,
  type SparseVector,
} from 'react-native-qdrant-edge'

// Tiny doc corpus — titles + sample body text. BM25 will index the body,
// the search just returns the title.
const DOCS = [
  { id: 1, title: 'Cooking pasta',         text: 'Boil water with salt. Add pasta. Drain after eight minutes.' },
  { id: 2, title: 'Bread baking',          text: 'Mix flour water salt yeast. Knead. Let dough rise. Bake hot.' },
  { id: 3, title: 'Riding a bike',         text: 'Saddle up. Keep balance. Pedal. Brake gently downhill.' },
  { id: 4, title: 'Brewing coffee',        text: 'Grind beans. Heat water. Pour over the filter. Wait four minutes.' },
  { id: 5, title: 'Knitting a scarf',      text: 'Cast on. Knit and purl. Repeat for length. Bind off the stitches.' },
  { id: 6, title: 'Tying shoelaces',       text: 'Cross laces. Tuck one under. Pull tight. Make two loops and knot.' },
  { id: 7, title: 'Sharpening a knife',    text: 'Set whetstone angle. Slide blade flat. Repeat both sides. Rinse.' },
  { id: 8, title: 'Brewing tea',           text: 'Heat water. Steep leaves. Wait three minutes. Pour into a cup.' },
  { id: 9, title: 'Boiling an egg',        text: 'Place egg in water. Boil six minutes. Cool under running water.' },
  { id: 10, title: 'Charging a phone',     text: 'Plug cable. Connect to phone. Wait until battery is full.' },
]

const QUERIES = ['boil water tea', 'knead bread', 'sharpen blade', 'pasta minutes']

function shardPath(name: string) {
  const dir = new Directory(Paths.document, name)
  if (!dir.exists) dir.create()
  return { dir, path: dir.uri.replace('file://', '') }
}

export default function HybridScreen() {
  const [shard, setShard] = useState<Shard | null>(null)
  const [bm25, setBm25] = useState<Bm25 | null>(null)
  const [results, setResults] = useState<ScoredPoint[]>([])
  const [log, setLog] = useState<string[]>([])
  const [lastQuery, setLastQuery] = useState('')
  const { dir: shardDir, path } = useMemo(() => shardPath('hybrid'), [])

  const print = useCallback((msg: string) => {
    setLog(prev => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev])
  }, [])

  const handleSetup = useCallback(() => {
    try {
      shard?.close()
      bm25?.close()
      if (shardDir.exists) { shardDir.delete(); shardDir.create() }
      const model = createBm25({ language: 'english' })
      const s = createShard(path, {
        vectors: {},
        sparse_vectors: { bm25: { modifier: 'idf' } },
      })
      s.upsert(DOCS.map(d => ({
        id: d.id,
        vector: { bm25: model.embedDocument(d.text) },
        payload: { title: d.title, text: d.text },
      })))
      s.flush()
      setShard(s)
      setBm25(model)
      print(`Indexed ${DOCS.length} docs (BM25 sparse)`)
    } catch (e: any) { print(`error: ${e.message}`) }
  }, [shard, bm25, shardDir, path, print])

  const runQuery = useCallback((q: string) => {
    if (!shard || !bm25) return print('tap Setup first')
    setLastQuery(q)
    const sparse: SparseVector = bm25.embedQuery(q)
    // Direct sparse search through the named "bm25" slot.
    const r = shard.search({
      vector: sparse,
      using: 'bm25',
      limit: 5,
      with_payload: true,
    })
    setResults(r)
    print(`"${q}" → ${r.length} hits (${sparse.indices.length} tokens)`)
  }, [shard, bm25, print])

  const runHybrid = useCallback(() => {
    if (!shard || !bm25) return print('tap Setup first')
    // Demonstrate the prefetch + RRF fusion path with two BM25 prefetches
    // against the same field but different queries (no dense model here,
    // but the API surface is identical when one is added).
    const a = bm25.embedQuery('boil water')
    const b = bm25.embedQuery('cooking time minutes')
    setLastQuery('boil water  ⊕  cooking time minutes (RRF)')
    const r = shard.query({
      prefetch: [
        { query: a, using: 'bm25', limit: 10 },
        { query: b, using: 'bm25', limit: 10 },
      ],
      query: { fusion: 'rrf' },
      limit: 5,
      with_payload: true,
    })
    setResults(r)
    print(`RRF fusion: ${r.length} hits`)
  }, [shard, bm25, print])

  const handleClose = useCallback(() => {
    shard?.close(); bm25?.close()
    setShard(null); setBm25(null); setResults([]); setLastQuery('')
    print('closed')
  }, [shard, bm25, print])

  return (
    <View style={s.root}>
      <View style={s.statusRow}>
        <View style={[s.dot, { backgroundColor: shard && bm25 ? '#22c55e' : '#d4d4d8' }]} />
        <Text style={s.statusText}>{shard && bm25 ? `${DOCS.length} docs · BM25 ready` : 'Not ready'}</Text>
      </View>

      <View style={s.actions}>
        <Pill label="Setup" onPress={handleSetup} />
        <Pill label="Hybrid (RRF)" onPress={runHybrid} />
        <Pill label="Close" variant="danger" onPress={handleClose} />
      </View>

      <Text style={s.label}>Try a query:</Text>
      <View style={s.queriesRow}>
        {QUERIES.map(q => <Pill key={q} label={q} onPress={() => runQuery(q)} />)}
      </View>

      {lastQuery !== '' && (
        <Text style={s.queryEcho}>query: {lastQuery}</Text>
      )}

      {results.length > 0 && (
        <View style={s.resultsCard}>
          {results.map((r, i) => (
            <View key={r.id} style={[s.resultRow, i === results.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={s.scoreChip}>
                <Text style={s.scoreText}>{r.score.toFixed(3)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.titleText}>{(r.payload as any)?.title}</Text>
                <Text style={s.bodyText} numberOfLines={1}>{(r.payload as any)?.text}</Text>
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '600', color: '#71717a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  queriesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  queryEcho: { fontFamily: mono, fontSize: 12, color: '#6366f1', marginBottom: 12 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: '#f4f4f5', borderWidth: 1, borderColor: '#e4e4e7' },
  pillDanger: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  pillText: { fontSize: 13, fontWeight: '600', color: '#18181b' },
  pillTextDanger: { color: '#dc2626' },
  resultsCard: { backgroundColor: '#fff', borderRadius: 16, padding: 4, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f4f4f5', gap: 12 },
  scoreChip: { backgroundColor: '#eef2ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  scoreText: { fontSize: 13, fontWeight: '700', color: '#6366f1', fontFamily: mono },
  titleText: { fontSize: 15, fontWeight: '600', color: '#18181b' },
  bodyText: { fontSize: 12, color: '#a1a1aa', marginTop: 2 },
  logCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  logTitle: { fontSize: 13, fontWeight: '600', color: '#a1a1aa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  logLine: { fontFamily: mono, fontSize: 12, color: '#52525b', lineHeight: 20 },
})
