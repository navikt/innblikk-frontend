import { useCallback, useState } from 'react'
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
    const [entry, setEntry] = useState(() => cache.get(cacheKey) ?? null)
    const [failed, setFailed] = useState(false)
    const [loading, setLoading] = useState(false)

    const load = useCallback(() => {
      if (!websiteId || cache.has(cacheKey)) {
        setEntry(cache.get(cacheKey) ?? null)
        return
      }
      setLoading(true)
      setFailed(false)
      fetchColumnValues(websiteId, column, key, eventName)
        .then((res) => {
          const next = { values: res.values, scannedDays: res.scannedDays }
          cache.set(cacheKey, next)
          setEntry(next)
        })
        .catch(() => setFailed(true))
        .finally(() => setLoading(false))
    }, [websiteId, column, key, eventName, cacheKey])

    return { values: entry?.values ?? [], scannedDays: entry?.scannedDays ?? null, failed, loading, load }
  }

  return {
    useColumnValueSuggestions,
    /** Test hook — wipes the session cache. */
    clearColumnValuesCache: () => cache.clear(),
  }
}

/** Shared app-wide instance — cohort editor and any future autocomplete consumers use this one. */
export const columnValuesSuggestions = createColumnValuesSuggestionsSource()
