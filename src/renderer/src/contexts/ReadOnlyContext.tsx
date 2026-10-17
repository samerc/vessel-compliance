import { createContext, useContext } from 'react'

/**
 * True inside a read-only view (e.g. an approved quotation): rich text editors stop being
 * editable. Form controls are disabled by the surrounding <fieldset disabled> instead.
 */
export const ReadOnlyContext = createContext(false)

export const useReadOnly = (): boolean => useContext(ReadOnlyContext)
