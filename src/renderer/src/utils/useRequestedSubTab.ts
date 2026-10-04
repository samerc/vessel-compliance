import { useEffect } from 'react'

/**
 * Applies a sub-tab requested from outside the page (command palette, Features page,
 * notifications). `nonce` changes on every request so asking for the same sub-tab twice works.
 */
export function useRequestedSubTab<K extends string>(
  sub: string | undefined,
  nonce: number | undefined,
  allowed: readonly K[],
  apply: (key: K) => void
): void {
  useEffect(() => {
    if (sub && (allowed as readonly string[]).includes(sub)) apply(sub as K)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, nonce])
}

/** Props a page takes to receive a requested sub-tab */
export interface SubTabProps {
  subTab?: string
  subTabNonce?: number
}
