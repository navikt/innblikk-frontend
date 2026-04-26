import { BodyShort, Button, Heading, Select, TextField } from '@navikt/ds-react'
import { useMemo, useState } from 'react'
import type { SentenceFilter } from '../model/types'

type WhereFilterBuilderProps = {
  filters: SentenceFilter[]
  onAddFilter: (filter: Omit<SentenceFilter, 'id'>) => void
  onRemoveFilter: (id: string) => void
}

const FILTER_COLUMNS: Array<{ value: SentenceFilter['column']; label: string }> = [
  { value: 'event_name', label: 'Hendelsesnavn' },
  { value: 'url_path', label: 'Side (URL-sti)' },
  { value: 'country', label: 'Land' },
  { value: 'device', label: 'Enhetstype' },
]

const FILTER_OPERATORS: Array<{ value: SentenceFilter['operator']; label: string }> = [
  { value: 'equals', label: 'er lik' },
  { value: 'not_equals', label: 'er ikke lik' },
  { value: 'contains', label: 'inneholder' },
  { value: 'starts_with', label: 'starter med' },
]

const getColumnLabel = (column: SentenceFilter['column']) =>
  FILTER_COLUMNS.find((item) => item.value === column)?.label ?? column

const getOperatorLabel = (operator: SentenceFilter['operator']) =>
  FILTER_OPERATORS.find((item) => item.value === operator)?.label ?? operator

export default function WhereFilterBuilder({ filters, onAddFilter, onRemoveFilter }: WhereFilterBuilderProps) {
  const [column, setColumn] = useState<SentenceFilter['column']>('event_name')
  const [operator, setOperator] = useState<SentenceFilter['operator']>('equals')
  const [value, setValue] = useState<string>('')

  const canAdd = useMemo(() => value.trim().length > 0, [value])

  return (
    <section className="space-y-3 rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-3">
      <Heading size="xsmall" level="3">
        Hvor (avgrensning)
      </Heading>

      <div className="grid gap-2 md:grid-cols-[1fr_1fr_2fr_auto] md:items-end">
        <Select
          label="Felt"
          size="small"
          value={column}
          onChange={(event) => setColumn(event.target.value as SentenceFilter['column'])}
        >
          {FILTER_COLUMNS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>

        <Select
          label="Operator"
          size="small"
          value={operator}
          onChange={(event) => setOperator(event.target.value as SentenceFilter['operator'])}
        >
          {FILTER_OPERATORS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>

        <TextField label="Verdi" size="small" value={value} onChange={(event) => setValue(event.target.value)} />

        <Button
          size="small"
          variant="secondary"
          disabled={!canAdd}
          onClick={() => {
            if (!canAdd) return
            onAddFilter({ column, operator, value: value.trim() })
            setValue('')
          }}
        >
          + velg
        </Button>
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <div
              key={filter.id}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] px-3 py-1"
            >
              <BodyShort size="small">
                {getColumnLabel(filter.column)} {getOperatorLabel(filter.operator)} {filter.value}
              </BodyShort>
              <button
                type="button"
                aria-label="Fjern filter"
                className="text-sm text-[var(--ax-text-subtle)] hover:text-[var(--ax-text-default)]"
                onClick={() => onRemoveFilter(filter.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {filters.length === 0 && (
        <BodyShort size="small" textColor="subtle">
          Ingen filtre lagt til ennå.
        </BodyShort>
      )}
    </section>
  )
}
