/**
 * Structured virtual-tool message pipeline diagnostics (always console, production included).
 * Callers must avoid putting full message bodies in `payload`.
 */
export function logVtPipeline(event: string, payload: Record<string, unknown>): void {
  console.log('[st-vfs][vt-msg]', event, payload)
}
