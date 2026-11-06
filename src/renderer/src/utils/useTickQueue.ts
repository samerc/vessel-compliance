import { useCallback, useEffect, useRef } from 'react'

/**
 * Quick ticks on a list saved as a whole run one after the other, each on the result of the one
 * before: from the same starting list they would overwrite each other's tick. A step gets the
 * latest list and returns the list after its save. It reports its own errors and returns nothing.
 */
export function useTickQueue<T>(
  list: T[]
): (step: (current: T[]) => Promise<T[] | void>) => Promise<void> {
  const latest = useRef(list)
  const chain = useRef<Promise<void>>(Promise.resolve())
  useEffect(() => {
    latest.current = list
  }, [list])
  return useCallback((step) => {
    chain.current = chain.current.then(async () => {
      const next = await step(latest.current)
      if (next) latest.current = next
    })
    return chain.current
  }, [])
}
