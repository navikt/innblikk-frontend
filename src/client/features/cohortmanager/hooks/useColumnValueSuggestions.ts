import { useCallback, useRef, useState } from 'react'
import { fetchColumnValues, type SuggestibleColumn } from '../api/columnValuesApi.ts'

export interface ColumnValueSuggestionsResult {
  values: string[]
  /** Lookback actually scanned (30/14/7); drive «Forslag fra siste N dager» from this. */
  scannedDays: number | null
  /** True after a fetch that failed — render the degrade-to-free-text note. */
  failed: boolean
  loading: boolean
  /** Fire on field-pick (not on focus). Idempotent: cached results resolve instantly. */
  load: () => void
}

/**
 * Lazy suggestion loader for one cohort-condition value combobox, session-cached
 * per (websiteId, column, key, eventName). Two renders of the same cache key
 * share one entry, so the top-level QueryBuilder and StepConditionsEditor
 * (sequence steps) never refetch what the other already fetched.
 *
 * The cache is in-memory only (cleared on reload); failed fetches are NOT
 * cached — a transient error must not doom the whole session to free text.
 */
export function createColumnValuesSuggestionsSource() {
  const cache = new Map<string, { values: string[]; scannedDays: number }>()

  function useColumnValueSuggestions(
    websiteId: string | undefined,
    column: SuggestibleColumn,
    key?: string,
    eventName?: string,
  ): ColumnValueSuggestionsResult {
    const cacheKey = `${websiteId ?? ''}|${column}|${key ?? ''}|${eventName ?? ''}`
    const [state, setState] = useState(() => ({
      cacheKey,
      requestId: 0,
      entry: cache.get(cacheKey) ?? null,
      failed: false,
      loading: false,
    }))
    const requestSequence = useRef(0)

    const load = useCallback(() => {
      const requestId = ++requestSequence.current
      const entry = cache.get(cacheKey) ?? null
      setState({ cacheKey, requestId, entry, failed: false, loading: !!websiteId && !entry })
      if (!websiteId || cache.has(cacheKey)) {
        return
      }
      fetchColumnValues(websiteId, column, key, eventName)
        .then((res) => {
          const next = { values: res.values, scannedDays: res.scannedDays }
          cache.set(cacheKey, next)
          setState((current) =>
            current.requestId === requestId ? { ...current, entry: next, loading: false } : current,
          )
        })
        .catch(() => {
          setState((current) =>
            current.requestId === requestId ? { ...current, failed: true, loading: false } : current,
          )
        })
    }, [websiteId, column, key, eventName, cacheKey])

    const current = state.cacheKey === cacheKey ? state : null
    const entry = current ? current.entry : (cache.get(cacheKey) ?? null)
    return {
      values: entry?.values ?? [],
      scannedDays: entry?.scannedDays ?? null,
      failed: current?.failed ?? false,
      loading: current?.loading ?? false,
      load,
    }
  }

  return {
    useColumnValueSuggestions,
    /** Test hook — wipes the session cache. */
    clearColumnValuesCache: () => cache.clear(),
  }
}

/** Shared app-wide instance — cohort editor and any future autocomplete consumers use this one. */
export const columnValuesSuggestions = createColumnValuesSuggestionsSource()
