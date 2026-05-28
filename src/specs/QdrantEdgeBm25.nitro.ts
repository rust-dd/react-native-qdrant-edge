import type { HybridObject } from 'react-native-nitro-modules'

/**
 * On-device BM25 sparse-embedding model.
 *
 * Construct via `createBm25(config)`. The output JSON shape is
 * `{ indices: number[], values: number[] }`. `embedQuery` weights each
 * unique token at `1.0`; `embedDocument` weights by the BM25 TF formula.
 *
 * Tokenization (lowercase, ASCII folding, stopwords, stemming, min/max token
 * length) is applied automatically — see `Bm25Config`.
 */
export interface QdrantEdgeBm25 extends HybridObject<{
  ios: 'c++'
  android: 'c++'
}> {
  /** Embed a query string; returns JSON `{ indices, values }`. */
  embedQuery(text: string): string
  /** Embed a document string; returns JSON `{ indices, values }`. */
  embedDocument(text: string): string
  /** Free the underlying native model. */
  close(): void
}
