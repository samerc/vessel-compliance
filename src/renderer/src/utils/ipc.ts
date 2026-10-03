// IPC result helpers.
//
// Most failed MUTATIONS already reject (see src/preload/ipcErrorPolicy.ts). A few channels keep
// the legacy contract (resolve with { error: true, message }) because some callers branch on it;
// every other caller of those channels wraps the result in ok() so a failure is never reported
// as success.

export interface IpcErrorValue {
  error: true
  message?: string
}

export function isIpcError(r: unknown): r is IpcErrorValue {
  return !!r && typeof r === 'object' && (r as any).error === true
}

/** Throw if an IPC call resolved with { error: true }; otherwise pass the value through. */
export function ok<T>(r: T): T {
  if (isIpcError(r)) throw new Error(r.message || 'The operation failed')
  return r
}

/** List loads: an IPC error value (or anything non-array) becomes [] instead of crashing render. */
export function asArray<T = any>(r: unknown): T[] {
  return Array.isArray(r) ? (r as T[]) : []
}
