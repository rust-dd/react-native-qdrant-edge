# react-native-qdrant-edge

Embedded vector search for React Native. Runs the [Qdrant](https://qdrant.tech) search engine **in-process** on the device -- no server, no network, fully offline.

Built on [qdrant-edge](https://qdrant.tech/documentation/edge/) (Rust) with [Nitro Modules](https://nitro.margelo.com) for near-zero JS-native overhead.

## Features

- HNSW-indexed vector search (dense, sparse, multi-vector)
- Structured payload filtering (`must` / `should` / `must_not`)
- Persistent storage -- survives app restarts
- Snapshot interop with server Qdrant
- Multiple independent shards
- React hooks API
- iOS and Android (Expo + bare RN)

## Install

```sh
npm install react-native-qdrant-edge react-native-nitro-modules
```

Prebuilt native binaries for iOS (arm64 + simulator) and Android (arm64 + x86_64) are included in the npm package -- no Rust toolchain required.

### Expo

Add the plugin to `app.json`:

```json
{
  "plugins": ["react-native-qdrant-edge"]
}
```

Then run:

```sh
npx expo run:ios
npx expo run:android
```

### Bare React Native

```sh
cd ios && pod install
```

## Quick start

```ts
import { createShard, loadShard } from 'react-native-qdrant-edge'

// Create a new shard
const shard = createShard('/path/to/shard', {
  vectors: { default: { size: 384, distance: 'Cosine' } },
})

// Insert points
shard.upsert([
  { id: 1, vector: [0.1, 0.2, ...], payload: { title: 'Hello' } },
  { id: 2, vector: [0.3, 0.4, ...], payload: { title: 'World' } },
])

// Search
const results = shard.search({
  vector: [0.1, 0.2, ...],
  limit: 10,
  with_payload: true,
})
// [{ id: '1', score: 0.98, payload: { title: 'Hello' } }, ...]

// Persist to disk
shard.flush()
shard.close()

// Reload from disk on next app launch
const loaded = loadShard('/path/to/shard')
const count = loaded.count()  // 2
const info = loaded.info()    // { points_count: 2, segments_count: 1, ... }
```

## API

### `createShard(path, config)`

Create a new shard at the given filesystem path.

```ts
const shard = createShard(path, {
  vectors: {
    '': { size: 384, distance: 'Cosine' },        // default vector
    'title': { size: 128, distance: 'Dot' },       // named vector
  },
  sparse_vectors: {
    'keywords': { modifier: 'Idf' },               // sparse vector
  },
})
```

**Distance metrics:** `Cosine` | `Euclid` | `Dot` | `Manhattan`

### `loadShard(path, config?)`

Load an existing shard from disk. Config is optional -- if omitted, uses the stored config.

### Shard methods

#### Data

```ts
shard.upsert([{ id: 1, vector: [...], payload: { ... } }])
shard.deletePoints([1, 2, 3])
shard.setPayload(1, { key: 'value' })
shard.deletePayload(1, ['key'])
shard.createFieldIndex('category', 'keyword')
shard.deleteFieldIndex('category')
```

#### Search

```ts
const results = shard.search({
  vector: [0.1, 0.2, ...],
  limit: 10,
  offset: 0,
  with_payload: true,
  with_vector: false,
  score_threshold: 0.5,
  filter: {
    must: [{ key: 'category', match: { value: 'electronics' } }],
  },
})
```

#### Query (advanced)

```ts
const results = shard.query({
  vector: [0.1, 0.2, ...],
  limit: 10,
  filter: { ... },
  fusion: 'rrf',  // reciprocal rank fusion
})
```

#### Retrieval

```ts
const points = shard.retrieve([1, 2, 3], {
  withPayload: true,
  withVector: false,
})

const { points, next_offset } = shard.scroll({
  limit: 100,
  with_payload: true,
})

const count = shard.count({
  must: [{ key: 'active', match: { value: true } }],
})
```

#### Lifecycle

```ts
shard.flush()       // persist to disk
shard.optimize()    // merge segments, build HNSW index
shard.info()        // { points_count, segments_count, indexed_vectors_count }
shard.close()       // flush and release resources
```

### Filtering

Filters follow the [Qdrant filter syntax](https://qdrant.tech/documentation/concepts/filtering/):

```ts
{
  must: [
    { key: 'price', range: { gte: 10, lte: 100 } },
    { key: 'category', match: { value: 'shoes' } },
  ],
  must_not: [
    { key: 'brand', match: { any: ['Nike', 'Adidas'] } },
  ],
}
```

**Field index types:** `keyword` | `integer` | `float` | `geo` | `text` | `bool` | `datetime`

Create an index before filtering on a field for best performance:

```ts
shard.createFieldIndex('price', 'float')
shard.createFieldIndex('category', 'keyword')
```

### React hooks

#### `useShard`

```ts
import { useShard } from 'react-native-qdrant-edge'

function NotesScreen() {
  const { shard, isOpen, error, open, close } = useShard({
    path: `${documentDir}/notes`,
    config: { vectors: { default: { size: 384, distance: 'Cosine' } } },
    create: true,  // create new shard, or use false / omit to load existing
  })

  useEffect(() => { open() }, [])
  // Automatically closes the shard on unmount

  if (!isOpen) return <Text>Loading...</Text>

  return <NotesList shard={shard} />
}
```

#### `useSearch`

```ts
import { useSearch } from 'react-native-qdrant-edge'

function SearchView({ shard, queryEmbedding }) {
  const { results, error, search } = useSearch({
    shard,
    request: { vector: queryEmbedding, limit: 10, with_payload: true },
    enabled: true,  // auto-search when request changes
  })

  // Or trigger manually:
  const handleRefresh = () => search({ vector: newEmbedding, limit: 5 })

  return results.map(r => <ResultCard key={r.id} point={r} />)
}
```

#### `useQuery`

Same as `useSearch` but uses the advanced query API with fusion support.

#### `useShardInfo`

```ts
import { useShardInfo } from 'react-native-qdrant-edge'

function ShardStats({ shard }) {
  const { info, refresh } = useShardInfo(shard)

  return (
    <Text>
      {info?.points_count} points, {info?.segments_count} segments
    </Text>
  )
}
```

#### Multiple shards with hooks

```ts
function App() {
  const notes = useShard({
    path: `${dataDir}/notes`,
    config: { vectors: { default: { size: 384, distance: 'Cosine' } } },
  })

  const photos = useShard({
    path: `${dataDir}/photos`,
    config: { vectors: { default: { size: 512, distance: 'Dot' } } },
  })

  useEffect(() => {
    notes.open()
    photos.open()
  }, [])

  // Search across both
  const noteResults = useSearch({
    shard: notes.shard,
    request: { vector: queryVec384, limit: 5, with_payload: true },
  })

  const photoResults = useSearch({
    shard: photos.shard,
    request: { vector: queryVec512, limit: 10, with_payload: true },
  })

  return (
    <>
      <Section title="Notes" results={noteResults.results} />
      <Section title="Photos" results={photoResults.results} />
    </>
  )
}
```

### Multiple shards

Each shard is independent with its own storage, index, and config:

```ts
import { createShard, loadShard } from 'react-native-qdrant-edge'

// Separate shards for different data types
const documents = createShard(`${dataDir}/documents`, {
  vectors: { default: { size: 768, distance: 'Cosine' } },
})

const images = createShard(`${dataDir}/images`, {
  vectors: { default: { size: 512, distance: 'Dot' } },
})

// Insert into each independently
documents.upsert([
  { id: 1, vector: docEmbedding, payload: { title: 'Getting started', category: 'docs' } },
  { id: 2, vector: docEmbedding2, payload: { title: 'API reference', category: 'docs' } },
])

images.upsert([
  { id: 1, vector: imgEmbedding, payload: { filename: 'photo.jpg', album: 'vacation' } },
])

// Search each shard separately
const docResults = documents.search({ vector: queryVec768, limit: 5, with_payload: true })
const imgResults = images.search({ vector: queryVec512, limit: 10, with_payload: true })

// Persist both
documents.flush()
images.flush()

// Later, reload from disk
const docs = loadShard(`${dataDir}/documents`)
const imgs = loadShard(`${dataDir}/images`)
```

## Building from source

Only needed if you're contributing or the prebuilt binaries don't cover your target.

### Requirements

- [Rust](https://rustup.rs)
- Xcode (iOS)
- Android NDK (Android)

### Build

```sh
# iOS (device + simulator xcframework)
npm run rust:build:ios

# Android (arm64 + x86_64)
npm run rust:build:android

# Both
npm run rust:build
```

## Architecture

```
TypeScript API
  -> Nitro HybridObject (C++, near-zero overhead)
    -> extern "C" FFI
      -> qdrant-edge (Rust)
        -> HNSW index, WAL, segment storage
```

All search operations are synchronous and run on the JS thread via JSI -- no bridge, no serialization overhead for the call itself. Vector data is passed as JSON strings across the FFI boundary and deserialized in Rust.

## License

MIT
