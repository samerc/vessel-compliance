// ─────────────────────────────────────────────────────────────────────────────
// Promise-based in-app replacements for the native window.confirm/alert/prompt.
// Native dialogs in Electron can leave the renderer with lost keyboard focus
// ("inputs stuck"), so all confirmations route through a single mounted host.
// ─────────────────────────────────────────────────────────────────────────────
// The host component that renders them is DialogRoot.tsx (mounted once in main.tsx).

export interface ConfirmOpts {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  isDangerous?: boolean
}

export type DialogRequest =
  | { kind: 'confirm'; message: string; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'alert'; message: string; opts: ConfirmOpts; resolve: () => void }
  | { kind: 'prompt'; message: string; defaultValue: string; resolve: (v: string | null) => void }

let listener: ((req: DialogRequest) => void) | null = null

/** The mounted host registers here (null when it unmounts) */
export function setDialogListener(fn: ((req: DialogRequest) => void) | null): void {
  listener = fn
}

/** In-app replacement for window.confirm — resolves true when confirmed. */
export function confirmDialog(message: string, opts: ConfirmOpts = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!listener) {
      resolve(window.confirm(message))
      return
    }
    listener({ kind: 'confirm', message, opts: { isDangerous: true, ...opts }, resolve })
  })
}

/** In-app replacement for window.alert. */
export function alertDialog(message: string, opts: ConfirmOpts = {}): Promise<void> {
  return new Promise((resolve) => {
    if (!listener) {
      window.alert(message)
      resolve()
      return
    }
    listener({ kind: 'alert', message, opts, resolve })
  })
}

/** In-app replacement for window.prompt — resolves the entered string or null if cancelled. */
export function promptDialog(message: string, defaultValue = ''): Promise<string | null> {
  return new Promise((resolve) => {
    if (!listener) {
      resolve(window.prompt(message, defaultValue))
      return
    }
    listener({ kind: 'prompt', message, defaultValue, resolve })
  })
}
