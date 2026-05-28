# react-native-qdrant-edge

[![npm](https://img.shields.io/npm/v/react-native-qdrant-edge)](https://www.npmjs.com/package/react-native-qdrant-edge)
[![license](https://img.shields.io/npm/l/react-native-qdrant-edge)](https://github.com/rust-dd/react-native-qdrant-edge/blob/main/LICENSE)
[![platforms](https://img.shields.io/badge/platforms-iOS%20%7C%20Android-lightgrey)](https://github.com/rust-dd/react-native-qdrant-edge)

Embedded vector search for React Native. Runs the [Qdrant](https://qdrant.tech) search engine **in-process** on the device — no server, no network, fully offline.

Built on [qdrant-edge](https://qdrant.tech/documentation/edge/) 0.7 (Rust) with [Nitro Modules](https://nitro.margelo.com) for near-zero JS↔native overhead.

## Features

- **Dense, sparse, and multi-vector** HNSW search
- **On-device BM25** sparse embedding (no embedding model to ship)
- **Hybrid search** via prefetch + fusion (RRF, DBSF)
- **Advanced query modes**: recommend, discover, context, MMR (diversity), order-by, sample
- **Faceting** — count points per unique value of a payload key
- **Snapshot interop** with cloud Qdrant
- Structured payload filtering (`must` / `should` / `must_not` / `min_should`)
- Filter-based payload updates (set / overwrite / delete / clear)
- Dynamic vector slots (add / remove named vectors at runtime)
- Runtime HNSW + optimizer config tuning
- Mobile-tuned WAL options
- UUID and u64 point IDs
- Persistent storage — survives app restarts
- Multiple independent shards
- React hooks API
- iOS and Android (Expo + bare RN)

## Install

```sh
npm install react-native-qdrant-edge react-native-nitro-modules
```

Prebuilt native binaries for iOS (arm64 + simulator) and Android (arm64 + x86_64) are included — no Rust toolchain required.

### Expo

```json
{ "plugins": ["react-native-qdrant-edge"] }
```

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
  vectors: { '': { size: 384, distance: 'Cosine' } },
})

// Insert points
shard.upsert([
  { id: 1, vector: [0.1, 0.2, /* … */], payload: { title: 'Hello' } },
  { id: 2, vector: [0.3, 0.4, /* … */], payload: { title: 'World' } },
])

// Search
const results = shard.search({
  vector: [0.1, 0.2, /* … */],
  limit: 10,
  with_payload: true,
})

// Persist + reload
shard.flush()
shard.close()

const loaded = loadShard('/path/to/shard')
console.log(loaded.count())  // 2
```

## API

### `createShard(path, config)`

Create a new shard at the given filesystem path. The full config:

```ts
const shard = createShard(path, {
  vectors: {
    '':       { size: 384, distance: 'Cosine' },        // default vector
    'title':  { size: 128, distance: 'Dot' },           // additional named dense
    'image':  { size: 512, distance: 'Cosine', on_disk: true },
  },
  sparse_vectors: {
    'bm25': { modifier: 'Idf' },                         // BM25 sparse slot
  },
  on_disk_payload: true,
  hnsw_config:    { m: 16, ef_construct: 100 },
  optimizers:     { default_segment_number: 2, indexing_threshold: 20_000 },
  wal_options:    { segment_capacity: 4 * 1024 * 1024 }, // mobile-friendly 4 MiB
})
```

**Distance metrics:** `Cosine` | `Euclid` | `Dot` | `Manhattan`

For a mobile-tuned WAL preset, see [`mobileWalDefaults()`](#mobile-wal-preset).

### `loadShard(path, config?)`

Load an existing shard. Config is optional — if omitted, the stored config is used.

### Shard data

```ts
// Mixed dense + sparse + multi vectors per point are supported
shard.upsert([
  {
    id: 'a3f1-...-uuid',
    vector: {
      dense: [0.1, 0.2, /* … */],
      bm25:  { indices: [42, 7, 1003], values: [1.0, 1.0, 1.0] },
    },
    payload: { title: 'Mixed', category: 'docs' },
  },
])

shard.deletePoints([1, 2, 'a3f1-...-uuid'])

// Point IDs are u64 numbers OR UUID strings
shard.updateVectors  // (single-point updates use upsert)

// Payload — single point convenience
shard.setPayload(1, { tag: 'new' })
shard.overwritePayload(1, { tag: 'final' })
shard.deletePayload(1, ['old_key'])

// Payload — full power (filter / batch / nested key)
shard.setPayloadOp({
  payload: { archived: true },
  filter:  { must: [{ key: 'created_at', range: { lt: 1_700_000_000 } }] },
})
shard.overwritePayloadOp({ payload, points: [1, 2, 3] })
shard.deletePayloadOp({ keys: ['stale_key'], filter: { /* … */ } })
shard.clearPayload({ filter: { must: [{ key: 'archived', match: { value: true } }] } })

// Field indexes — required for filtering at scale
shard.createFieldIndex('category', 'keyword')
shard.createFieldIndex('price', 'float')
shard.deleteFieldIndex('category')
```

**Field index types:** `keyword` | `integer` | `float` | `geo` | `text` | `bool` | `datetime`

### Search

```ts
const results = shard.search({
  vector: [0.1, 0.2, /* … */],         // dense | { indices, values } | [[…]] (multi)
  using: 'dense',                       // omit for the default vector
  limit: 10,
  offset: 0,
  with_payload: true,
  with_vector: false,
  score_threshold: 0.5,
  filter: {
    must: [{ key: 'category', match: { value: 'electronics' } }],
  },
})
// [{ id: '1', score: 0.98, payload: { category: '…' } }, …]
```

### Hybrid query (dense + BM25 sparse)

The query API mirrors the upstream `qdrant-client` REST shape. A prefetch tree fans out one search per vector type, then a fusion clause merges the rankings.

```ts
import { createBm25 } from 'react-native-qdrant-edge'

const bm25 = createBm25({ language: 'english' })
const dense = await embedDense('quick brown fox')             // your dense model
const sparse = bm25.embedQuery('quick brown fox')             // on-device BM25

const results = shard.query({
  prefetch: [
    { query: dense,  using: 'dense', limit: 100 },
    { query: sparse, using: 'bm25',  limit: 100 },
  ],
  query:  { fusion: 'rrf' },          // or 'dbsf'
  limit:  10,
  with_payload: true,
})

bm25.close()
```

`fusion: { fusion: 'rrf', k: 60, weights: [2.0, 1.0] }` accepts an optional RRF `k` and per-source weights. Prefetches nest arbitrarily.

### Advanced query modes

All of these go in the `query` slot at the root or within a prefetch:

```ts
// Recommend (positive + negative examples)
shard.query({ query: { recommend: { positive: [v1, v2], negative: [v3], strategy: 'best_score' } } })

// Discover (target + positive/negative context pairs)
shard.query({ query: { discover: { target: v, context: [{ positive: p1, negative: n1 }] } } })

// Context (no target, just preference pairs)
shard.query({ query: { context: [{ positive: p1, negative: n1 }] } })

// Order by payload field
shard.query({ query: { order_by: { key: 'created_at', direction: 'desc' } }, limit: 20 })

// Random sample
shard.query({ query: { sample: 'random' }, limit: 50 })

// MMR — diversity-aware rerank (lambda 0 = full diversity, 1 = full relevance)
shard.query({ query: { mmr: { vector: v, lambda: 0.5, candidates_limit: 100 } }, limit: 10 })
```

### Retrieve & scroll

```ts
const points = shard.retrieve([1, 2, 'uuid-…'], { withPayload: true, withVector: false })

const { points, next_offset } = shard.scroll({ limit: 100, with_payload: true })

const total = shard.count()
const active = shard.count({ must: [{ key: 'active', match: { value: true } }] })
```

### Facet

Count points per unique value of a payload key.

```ts
const { hits } = shard.facet({
  key: 'category',
  limit: 20,
  filter: { must: [{ key: 'in_stock', match: { value: true } }] },
  exact: true,
})
// [{ value: 'electronics', count: 42 }, { value: 'books', count: 17 }, …]
```

### Snapshot interop

Treat the snapshot manifest as opaque — pass it back through `recoverPartialSnapshot` verbatim.

```ts
import { unpackSnapshot, recoverPartialSnapshot } from 'react-native-qdrant-edge'

// Apply an external snapshot to an existing local shard
unpackSnapshot('/downloads/snapshot.tar', '/tmp/snapshot-unpacked')

const current  = shard.snapshotManifest()
const incoming = JSON.parse(await fs.readTextFile('/tmp/snapshot-unpacked/manifest.json'))

const merged = recoverPartialSnapshot(shard.path, current, '/tmp/snapshot-unpacked', incoming)
```

### Lifecycle

```ts
shard.flush()       // persist to disk
shard.optimize()    // merge segments, build HNSW indexes
shard.info()        // { points_count, segments_count, indexed_vectors_count }
shard.close()       // flush + release
```

### Runtime config

```ts
shard.setHnswConfig({ m: 32, ef_construct: 200 })
shard.setVectorHnswConfig('bm25', { full_scan_threshold: 5000 })
shard.setOptimizersConfig({ indexing_threshold: 10_000, prevent_unoptimized: true })

shard.createVectorName('caption', { dense: { size: 768, distance: 'Cosine' } })
shard.deleteVectorName('legacy')
```

### Mobile WAL preset

The upstream default WAL segment capacity is 32 MiB — wasteful on phones. Use the helper:

```ts
import { createShard, mobileWalDefaults } from 'react-native-qdrant-edge'

const shard = createShard(path, {
  vectors: { '': { size: 384, distance: 'Cosine' } },
  wal_options: mobileWalDefaults(),     // 4 MiB segments, retain_closed: 1
})
```

### Filtering

Filters follow the [Qdrant filter syntax](https://qdrant.tech/documentation/concepts/filtering/):

```ts
{
  must: [
    { key: 'price', range: { gte: 10, lte: 100 } },
    { key: 'category', match: { value: 'shoes' } },
  ],
  should: [
    { key: 'brand', match: { any: ['Nike', 'Adidas'] } },
  ],
  must_not: [
    { key: 'archived', match: { value: true } },
  ],
}
```

### Error handling

Every Shard / Bm25 method that fails throws a JS `Error` with a message of the form `"<operation> failed: <cause>"`. For structured access:

```ts
import { asQdrantError } from 'react-native-qdrant-edge'

try {
  shard.upsert(points)
} catch (err) {
  const qe = asQdrantError(err)
  console.log(qe.operation, qe.cause)   // e.g. 'upsert', 'invalid JSON path: …'
}
```

## React hooks

```ts
import {
  useShard, useUpsert, useDelete,
  useSearch, useQuery,
  useRetrieve, useScroll, useCount, useShardInfo,
  useBm25, useFacet, useSnapshotManifest,
} from 'react-native-qdrant-edge'

function NotesScreen() {
  const { shard, open, close } = useShard({
    path: `${documentDir}/notes`,
    config: { vectors: { '': { size: 384, distance: 'Cosine' } } },
    create: true,
  })

  const { bm25 } = useBm25({ language: 'english' })

  const { results, search } = useSearch({
    shard,
    request: { vector: queryEmbedding, limit: 10, with_payload: true },
    enabled: true,
  })

  useEffect(() => { open() }, [])
  // shard + bm25 are auto-closed/disposed on unmount

  return <NotesList shard={shard} bm25={bm25} results={results} />
}
```

Hybrid search via `useQuery`:

```ts
const { results } = useQuery({
  shard,
  request: {
    prefetch: [
      { query: denseVec,  using: 'dense', limit: 100 },
      { query: sparseVec, using: 'bm25',  limit: 100 },
    ],
    query: { fusion: 'rrf' },
    limit: 10,
    with_payload: true,
  },
})
```

## Multiple shards

Each shard is independent — separate storage, config, and indexes.

```ts
const docs = createShard(`${dir}/docs`,   { vectors: { '': { size: 768, distance: 'Cosine' } } })
const imgs = createShard(`${dir}/photos`, { vectors: { '': { size: 512, distance: 'Dot' } } })
```

## Migration from 0.2.x

Mostly additive. The only TS-visible widening is:

- `Point.id` and IDs in `deletePoints` / `retrieve`: `number → number | string`. Existing numeric IDs still work.
- `Point.vector` and `SearchRequest.vector`: accept sparse `{ indices, values }` and multi `[[…]]` in addition to dense.
- `Shard.setPayload(pointId, payload)` gains an optional 3rd argument `key?: string` and accepts string IDs. Existing call sites are unchanged.

Note one upstream behavior change: with `optimizers.prevent_unoptimized: true`, points written to unoptimized segments above `indexing_threshold` are persisted as **deferred** — they are excluded from reads/search until you call `shard.optimize()`. Previously this option blocked the write entirely.

## Architecture

```
TypeScript API
  → Nitro HybridObject (C++, near-zero JS overhead)
    → extern "C" FFI
      → qdrant-edge 0.7 (Rust)
        → HNSW index, WAL, segment storage, BM25 tokenizer
```

All operations are synchronous and run on the JS thread via JSI — no bridge, no serialization between JS and the C++ object. Vector and metadata payloads cross the FFI boundary as JSON; the JSON-parse overhead is negligible vs HNSW lookup for search, and measurable but acceptable for bulk upsert (raw `Float32Array` marshaling is on the roadmap — see Future work).

## Building from source

Only needed if you contribute, or the prebuilt binaries don't cover your target.

### Requirements

- [Rust](https://rustup.rs)
- Xcode (iOS)
- Android NDK (Android)
- `cbindgen` for header regen: `cargo install cbindgen`

### Build

```sh
npm run rust:build:ios          # xcframework: device arm64 + simulator
npm run rust:build:android      # arm64 + x86_64
npm run rust:build              # both
```

After modifying any `.nitro.ts`, regenerate the bindings:

```sh
npm run specs
```

## Future work

- **ArrayBuffer / `Float32Array` for vectors** — skip JSON encoding for bulk upsert (HNSW search itself is already JSON-light).
- **Async / background-thread operations** — offload `optimize`, bulk `upsert`, and `snapshotManifest` via Nitro async methods.
- **Formula rescoring** — the upstream AST does not impl Deserialize; will need a typed expression builder API.
- **gRPC client wrapper** — out of scope, but could ship alongside.

## License

MIT
