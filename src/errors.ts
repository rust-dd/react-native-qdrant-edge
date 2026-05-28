/**
 * Structured error type for qdrant-edge operations.
 *
 * The native layer throws a plain `Error` whose message has the shape
 * `"<operation> failed: <cause>"` (e.g. `"upsert failed: invalid JSON path: foo"`).
 * `asQdrantError` parses that into a typed object for callers that want
 * structured access; plain errors whose message doesn't match the expected
 * pattern pass through unchanged.
 *
 * ```ts
 * try {
 *   shard.upsert(badPoints)
 * } catch (err) {
 *   const qe = asQdrantError(err)
 *   if (qe instanceof QdrantError) {
 *     console.log(qe.operation, qe.cause) // "upsert", "invalid JSON path: …"
 *   }
 * }
 * ```
 */
export class QdrantError extends Error {
  readonly operation: string
  readonly cause: string

  constructor(operation: string, cause: string) {
    super(`${operation} failed: ${cause}`)
    this.name = 'QdrantError'
    this.operation = operation
    this.cause = cause
  }
}

const ERROR_PATTERN = /^(.+?) failed: (.+)$/s

/**
 * Parse a caught error into a `QdrantError` if its message matches the
 * `"<op> failed: <cause>"` shape produced by the native layer. Otherwise
 * return the input (wrapped in `Error` if it wasn't one already).
 */
export function asQdrantError(err: unknown): QdrantError | Error {
  if (err instanceof QdrantError) return err
  if (err instanceof Error) {
    const parsed = parse(err.message)
    return parsed ?? err
  }
  if (typeof err === 'string') {
    return parse(err) ?? new Error(err)
  }
  return new Error(String(err))
}

function parse(message: string): QdrantError | null {
  const m = ERROR_PATTERN.exec(message)
  if (!m) return null
  const [, operation, cause] = m
  if (operation === undefined || cause === undefined) return null
  return new QdrantError(operation, cause)
}
