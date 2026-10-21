/**
 * Thrown by a write-once document write when a document already exists at the key, on every store
 * backend. Callers that use write-once as a claim (`./deliveries.ts`) tell a lost race from an
 * outage by this type alone, without a second read.
 */
export class DocumentExistsError extends Error {
  constructor(key: string, options?: { cause?: unknown }) {
    super(`A document already exists at ${key}.`, options);
    this.name = "DocumentExistsError";
  }
}
