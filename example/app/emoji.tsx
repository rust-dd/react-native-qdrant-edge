import { Directory, Paths } from 'expo-file-system'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { createShard, type Shard } from 'react-native-qdrant-edge'

const DIMS = 8
const EMOJIS = [
  { emoji: '🐶', label: 'dog',       vec: [0.9, 0.1, 0.8, 0.2, 0.1, 0.7, 0.3, 0.1] },
  { emoji: '🐱', label: 'cat',       vec: [0.85, 0.1, 0.75, 0.2, 0.1, 0.6, 0.3, 0.15] },
  { emoji: '🐭', label: 'mouse',     vec: [0.7, 0.1, 0.6, 0.3, 0.1, 0.5, 0.2, 0.1] },
  { emoji: '🐰', label: 'rabbit',    vec: [0.8, 0.1, 0.7, 0.25, 0.1, 0.55, 0.25, 0.12] },
  { emoji: '🦊', label: 'fox',       vec: [0.88, 0.15, 0.78, 0.2, 0.1, 0.65, 0.35, 0.1] },
  { emoji: '🐻', label: 'bear',      vec: [0.92, 0.2, 0.85, 0.15, 0.15, 0.75, 0.4, 0.2] },
  { emoji: '🐼', label: 'panda',     vec: [0.9, 0.18, 0.83, 0.15, 0.12, 0.72, 0.38, 0.18] },
  { emoji: '🐸', label: 'frog',      vec: [0.5, 0.1, 0.4, 0.6, 0.1, 0.3, 0.15, 0.05] },
  { emoji: '🐟', label: 'fish',      vec: [0.4, 0.1, 0.3, 0.8, 0.7, 0.2, 0.1, 0.05] },
  { emoji: '🐦', label: 'bird',      vec: [0.6, 0.1, 0.5, 0.4, 0.3, 0.5, 0.6, 0.3] },
  { emoji: '🦁', label: 'lion',      vec: [0.95, 0.25, 0.9, 0.1, 0.1, 0.8, 0.45, 0.25] },
  { emoji: '🐴', label: 'horse',     vec: [0.88, 0.2, 0.82, 0.15, 0.1, 0.7, 0.5, 0.3] },
  { emoji: '🦈', label: 'shark',     vec: [0.45, 0.3, 0.35, 0.75, 0.8, 0.25, 0.15, 0.1] },
  { emoji: '🦋', label: 'butterfly', vec: [0.3, 0.1, 0.3, 0.5, 0.2, 0.4, 0.7, 0.5] },
  { emoji: '🍎', label: 'apple',     vec: [0.1, 0.9, 0.1, 0.1, 0.1, 0.1, 0.8, 0.6] },
  { emoji: '🍊', label: 'orange',    vec: [0.1, 0.88, 0.1, 0.12, 0.1, 0.1, 0.75, 0.55] },
  { emoji: '🍕', label: 'pizza',     vec: [0.1, 0.8, 0.2, 0.1, 0.1, 0.2, 0.6, 0.9] },
  { emoji: '🍔', label: 'burger',    vec: [0.1, 0.78, 0.22, 0.1, 0.1, 0.2, 0.55, 0.88] },
  { emoji: '🍣', label: 'sushi',     vec: [0.1, 0.75, 0.15, 0.3, 0.2, 0.15, 0.5, 0.85] },
  { emoji: '🍩', label: 'donut',     vec: [0.1, 0.82, 0.18, 0.1, 0.1, 0.15, 0.65, 0.92] },
  { emoji: '🥑', label: 'avocado',   vec: [0.1, 0.9, 0.12, 0.15, 0.1, 0.1, 0.82, 0.5] },
  { emoji: '⚽', label: 'soccer',    vec: [0.1, 0.1, 0.1, 0.1, 0.1, 0.9, 0.1, 0.1] },
  { emoji: '🏀', label: 'basketball',vec: [0.1, 0.1, 0.12, 0.1, 0.1, 0.88, 0.12, 0.12] },
  { emoji: '🎾', label: 'tennis',    vec: [0.1, 0.1, 0.1, 0.12, 0.1, 0.85, 0.1, 0.1] },
  { emoji: '☀️', label: 'sun',       vec: [0.1, 0.1, 0.1, 0.1, 0.9, 0.1, 0.9, 0.1] },
  { emoji: '🌙', label: 'moon',      vec: [0.1, 0.1, 0.1, 0.1, 0.85, 0.1, 0.3, 0.1] },
  { emoji: '🌈', label: 'rainbow',   vec: [0.1, 0.1, 0.1, 0.1, 0.8, 0.1, 0.95, 0.5] },
  { emoji: '🌊', label: 'wave',      vec: [0.1, 0.1, 0.1, 0.8, 0.7, 0.1, 0.5, 0.1] },
  { emoji: '🔥', label: 'fire',      vec: [0.1, 0.1, 0.1, 0.1, 0.7, 0.1, 0.95, 0.8] },
  { emoji: '😀', label: 'happy',     vec: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.9] },
  { emoji: '😢', label: 'sad',       vec: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.2] },
  { emoji: '😍', label: 'love',      vec: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.15, 0.95] },
  { emoji: '🚗', label: 'car',       vec: [0.1, 0.1, 0.9, 0.1, 0.1, 0.1, 0.5, 0.1] },
  { emoji: '✈️', label: 'airplane',  vec: [0.1, 0.1, 0.85, 0.1, 0.5, 0.1, 0.6, 0.1] },
  { emoji: '🚀', label: 'rocket',    vec: [0.1, 0.1, 0.88, 0.1, 0.7, 0.1, 0.8, 0.3] },
  { emoji: '🎸', label: 'guitar',    vec: [0.1, 0.1, 0.1, 0.1, 0.1, 0.3, 0.5, 0.7] },
  { emoji: '🎹', label: 'piano',     vec: [0.1, 0.1, 0.1, 0.1, 0.1, 0.25, 0.45, 0.65] },
  { emoji: '🎵', label: 'music',     vec: [0.1, 0.1, 0.1, 0.1, 0.1, 0.3, 0.5, 0.75] },
]

function ensureDir(name: string) {
  const dir = new Directory(Paths.document, name)
  if (!dir.exists) dir.create()
  return { dir, path: dir.uri.replace('file://', '') }
}

function scoreColor(score: number) {
  if (score > 0.95) return '#22c55e'
  if (score > 0.85) return '#6366f1'
  if (score > 0.7) return '#f59e0b'
  return '#d4d4d8'
}

export default function EmojiScreen() {
  const [shard, setShard] = useState<Shard | null>(null)
  const [results, setResults] = useState<any[]>([])
  const [selected, setSelected] = useState<typeof EMOJIS[0] | null>(null)
  const [query, setQuery] = useState('')
  const { dir, path } = useMemo(() => ensureDir('emoji-shard'), [])

  useEffect(() => {
    try {
      if (dir.exists) { dir.delete(); dir.create() }
      const s = createShard(path, { vectors: { '': { size: DIMS, distance: 'Cosine' } } })
      s.upsert(EMOJIS.map((e, i) => ({ id: i + 1, vector: e.vec, payload: { emoji: e.emoji, label: e.label } })))
      s.flush()
      setShard(s)
    } catch {}
  }, [])

  const doSearch = useCallback((vec: number[], excludeIdx?: number) => {
    if (!shard) return
    const r = shard.search({ vector: vec, limit: 12, with_payload: true })
    setResults(r.filter(p => excludeIdx === undefined || p.id !== String(excludeIdx + 1)).map(p => ({
      emoji: (p.payload as any)?.emoji, label: (p.payload as any)?.label, vec: [], score: p.score,
    })))
  }, [shard])

  const tapEmoji = useCallback((item: typeof EMOJIS[0]) => {
    setSelected(item); setQuery('')
    doSearch(item.vec, EMOJIS.indexOf(item))
  }, [doSearch])

  const textSearch = useCallback((text: string) => {
    setQuery(text); setSelected(null)
    if (!text.trim()) { setResults([]); return }
    const match = EMOJIS.find(e => e.label.toLowerCase().includes(text.toLowerCase()))
    if (!match) { setResults([]); return }
    setSelected(match); doSearch(match.vec)
  }, [doSearch])

  return (
    <View style={s.root}>
      <View style={s.searchRow}>
        <TextInput style={s.searchInput} placeholder="Type to search..." placeholderTextColor="#a1a1aa" value={query} onChangeText={textSearch} autoCorrect={false} />
        {(selected || query) && (
          <Pressable onPress={() => { setQuery(''); setSelected(null); setResults([]) }} style={s.clearBtn}>
            <Text style={s.clearText}>Clear</Text>
          </Pressable>
        )}
      </View>

      {selected && (
        <View style={s.selectedCard}>
          <Text style={{ fontSize: 44 }}>{selected.emoji}</Text>
          <View>
            <Text style={s.selectedLabel}>Similar to "{selected.label}"</Text>
            <Text style={s.selectedSub}>{results.length} matches found</Text>
          </View>
        </View>
      )}

      {results.length > 0 ? (
        <FlatList
          data={results}
          numColumns={4}
          key="results"
          keyExtractor={(_, i) => `r${i}`}
          contentContainerStyle={{ padding: 8 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => { const o = EMOJIS.find(e => e.emoji === item.emoji); if (o) tapEmoji(o) }} style={({ pressed }) => [s.emojiCard, pressed && { transform: [{ scale: 0.93 }] }]}>
              <Text style={{ fontSize: 32 }}>{item.emoji}</Text>
              <Text style={s.emojiLabel}>{item.label}</Text>
              <View style={[s.scorePill, { backgroundColor: scoreColor(item.score) + '20', borderColor: scoreColor(item.score) }]}>
                <Text style={[s.scorePillText, { color: scoreColor(item.score) }]}>{(item.score * 100).toFixed(0)}%</Text>
              </View>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={EMOJIS}
          numColumns={5}
          key="all"
          keyExtractor={(_, i) => `a${i}`}
          contentContainerStyle={{ padding: 8 }}
          ListHeaderComponent={<Text style={s.hint}>Tap any emoji to find similar ones</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => tapEmoji(item)} style={({ pressed }) => [s.emojiCardSmall, pressed && { transform: [{ scale: 0.9 }] }]}>
              <Text style={{ fontSize: 26 }}>{item.emoji}</Text>
              <Text style={s.emojiLabelSmall}>{item.label}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafa' },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 12, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: '#e4e4e7' },
  searchInput: { flex: 1, height: 46, color: '#18181b', fontSize: 16 },
  clearBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f4f4f5' },
  clearText: { fontSize: 13, fontWeight: '600', color: '#71717a' },
  selectedCard: { flexDirection: 'row', alignItems: 'center', gap: 16, marginHorizontal: 16, marginBottom: 12, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e4e4e7' },
  selectedLabel: { fontSize: 17, fontWeight: '700', color: '#18181b' },
  selectedSub: { fontSize: 13, color: '#a1a1aa', marginTop: 2 },
  hint: { color: '#a1a1aa', textAlign: 'center', marginBottom: 12, fontSize: 14 },
  emojiCard: { flex: 1, alignItems: 'center', margin: 4, paddingVertical: 12, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#f4f4f5', minWidth: 70 },
  emojiCardSmall: { flex: 1, alignItems: 'center', margin: 3, paddingVertical: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#f4f4f5', minWidth: 55 },
  emojiLabel: { fontSize: 10, color: '#71717a', marginTop: 4 },
  emojiLabelSmall: { fontSize: 9, color: '#a1a1aa', marginTop: 3 },
  scorePill: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  scorePillText: { fontSize: 11, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
})
