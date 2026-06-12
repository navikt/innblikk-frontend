import { useState, useEffect } from 'react'
import {
  QueryBuilder,
  type RuleGroupType,
  type RuleType,
  type Field,
  type Operator,
  type Path,
} from 'react-querybuilder'
import { QueryBuilderDateTime } from '@react-querybuilder/datetime'
import '@react-querybuilder/datetime/query-builder-datetime.css'
import 'react-querybuilder/dist/query-builder-layout.css'
import { Button, Dialog, VStack, BodyShort, Box, Tag } from '@navikt/ds-react'
import type {
  CohortDetailDto,
  CohortEntryDto,
  CohortEntryConditionDto,
  CreateCohortEntryRequest,
  ComparisonOperator,
} from '../model/types.ts'
import { createEntry, deleteEntry } from '../api/cohortManagerApi.ts'
import './cohortEditor.css'

// ─── Fields ──────────────────────────────────────────────────────────────────

const FIELDS: Field[] = [
  { name: 'url_path', label: 'URL-sti' },
  { name: 'referrer_domain', label: 'Referrer-domene' },
  { name: 'browser', label: 'Nettleser' },
  { name: 'os', label: 'Operativsystem' },
  { name: 'device', label: 'Enhettype' },
  { name: 'country', label: 'Land' },
  { name: 'event_name', label: 'Hendelsesnavn' },
  { name: 'event_data_key', label: 'Hendelsesdata — nøkkel' },
  { name: 'event_data_value', label: 'Hendelsesdata — verdi' },
  { name: 'created_at', label: 'Tidspunkt', inputType: 'datetime-local', datatype: 'datetime' },
  { name: '__cohort__', label: 'Er i kohort' },
]

const OPERATORS: Operator[] = [
  { name: 'EQUALS', label: 'er lik' },
  { name: 'NOT_EQUALS', label: 'er ikke lik' },
  { name: 'CONTAINS', label: 'inneholder' },
  { name: 'NOT_CONTAINS', label: 'inneholder ikke' },
  { name: 'STARTS_WITH', label: 'starter med' },
  { name: 'ENDS_WITH', label: 'slutter med' },
  { name: 'GREATER_THAN_OR_EQUAL', label: 'er etter eller lik' },
  { name: 'LESS_THAN_OR_EQUAL', label: 'er før eller lik' },
  { name: 'IN_SET', label: 'er i liste' },
  { name: 'NOT_IN_SET', label: 'er ikke i liste' },
  { name: 'in_cohort', label: 'tilhører' },
]

const DATETIME_OPERATORS: Operator[] = [
  { name: 'GREATER_THAN_OR_EQUAL', label: 'er etter eller lik' },
  { name: 'LESS_THAN_OR_EQUAL', label: 'er før eller lik' },
]

// ─── RQB ↔ Backend mapping ────────────────────────────────────────────────────

/**
 * Each CohortEntryDto becomes one RQB sub-group.
 * - condition=IN_COHORT  → single rule with field='__cohort__', operator='in_cohort', value=referencedCohortId
 * - condition=PERFORMED  → group.not = false, rules = conditions
 * - condition=NOT_PERFORMED → group.not = true, rules = conditions
 */
function entryToGroup(entry: CohortEntryDto): RuleGroupType {
  if (entry.inCohort) {
    return {
      combinator: 'and',
      not: false,
      rules: [
        {
          field: '__cohort__',
          operator: 'in_cohort',
          value: String(entry.referencedCohortId ?? ''),
        },
      ],
    }
  }
  return {
    combinator: (entry.operator ?? 'AND').toLowerCase(),
    not: entry.negated,
    rules: entry.conditions.map((c) => ({
      field: c.field,
      operator: c.conditionType,
      value: c.value,
    })),
  }
}

/** Top-level query = all entries ANDed together */
export function cohortToQuery(cohort: CohortDetailDto): RuleGroupType {
  return {
    combinator: 'and',
    rules: cohort.entries
      .slice()
      .sort((a, b) => a.ordering - b.ordering)
      .map(entryToGroup),
  }
}

/** Convert a single sub-group back to a CreateCohortEntryRequest */
function groupToEntryRequest(group: RuleGroupType): CreateCohortEntryRequest {
  const firstRule = group.rules[0]
  if (
    group.rules.length === 1 &&
    !('combinator' in (firstRule as object)) &&
    (firstRule as RuleType).field === '__cohort__'
  ) {
    return {
      negated: false,
      inCohort: true,
      referencedCohortId: Number((firstRule as RuleType).value) || undefined,
      conditions: [],
    }
  }

  const conditions: CohortEntryConditionDto[] = group.rules
    .filter((r): r is RuleType => !('combinator' in r))
    .map((r, i) => ({
      ordering: i,
      conditionType: r.operator as ComparisonOperator,
      field: r.field,
      value: String(r.value),
    }))

  return {
    negated: group.not ?? false,
    inCohort: false,
    operator: group.combinator.toUpperCase() as 'AND' | 'OR',
    conditions,
  }
}

// ─── Human-readable summary ───────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  url_path: 'URL-sti',
  referrer_domain: 'referrer',
  browser: 'nettleser',
  os: 'OS',
  device: 'enhet',
  country: 'land',
  event_name: 'hendelse',
  event_data_key: 'datanøkkel',
  event_data_value: 'dataverdi',
  created_at: 'tidspunkt',
  __cohort__: 'kohort',
}

const OP_LABELS: Record<string, string> = {
  EQUALS: '=',
  NOT_EQUALS: '≠',
  CONTAINS: 'inneholder',
  NOT_CONTAINS: 'inneholder ikke',
  STARTS_WITH: 'starter med',
  ENDS_WITH: 'slutter med',
  GREATER_THAN_OR_EQUAL: '>=',
  LESS_THAN_OR_EQUAL: '<=',
  IN_SET: 'i',
  NOT_IN_SET: 'ikke i',
  in_cohort: 'tilhører',
}

function ruleToHuman(rule: RuleType, cohortNames: Record<string, string>): string {
  const field = FIELD_LABELS[rule.field] ?? rule.field
  const op = OP_LABELS[rule.operator] ?? rule.operator
  const val = rule.field === '__cohort__' ? (cohortNames[rule.value] ?? `kohort #${rule.value}`) : `«${rule.value}»`
  return `${field} ${op} ${val}`
}

export function queryToHuman(query: RuleGroupType, cohortNames: Record<string, string> = {}): string {
  if (query.rules.length === 0) return '(ingen kriterier)'

  const parts = query.rules.map((r) => {
    if ('combinator' in r) {
      const group = r
      const inner = group.rules
        .filter((x): x is RuleType => !('combinator' in x))
        .map((x) => ruleToHuman(x, cohortNames))
        .join(` ${(group.combinator ?? 'and').toUpperCase()} `)
      const prefix = group.not ? 'IKKE (' : '('
      return `${prefix}${inner})`
    }
    return ruleToHuman(r, cohortNames)
  })

  return parts.join(` ${query.combinator.toUpperCase()} `)
}

// ─── CohortEditor ─────────────────────────────────────────────────────────────

interface CohortEditorProps {
  cohort: CohortDetailDto
  allCohorts: CohortDetailDto[]
  onClose: () => void
  onChanged: () => void
}

export function CohortEditor({ cohort, allCohorts, onClose, onChanged }: CohortEditorProps) {
  const [query, setQuery] = useState<RuleGroupType>(() => cohortToQuery(cohort))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setQuery(cohortToQuery(cohort))
  }, [cohort])

  // Map cohort IDs → names for the __cohort__ value editor
  const cohortOptions = allCohorts
    .filter((c) => c.id !== cohort.id)
    .map((c) => ({ value: String(c.id), label: c.name }))

  const cohortNames = Object.fromEntries(allCohorts.map((c) => [String(c.id), c.name]))

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      // Each sub-group at the root level = one backend entry.
      // If the user added rules directly at root (no sub-groups), treat the
      // whole root as one entry — this avoids adding a nesting level on each save.
      const subGroups = query.rules.filter((r): r is RuleGroupType => 'combinator' in r)
      const rootRules = query.rules.filter((r): r is RuleType => !('combinator' in r))

      const desiredGroups: RuleGroupType[] =
        subGroups.length > 0
          ? subGroups
          : rootRules.length > 0
            ? [{ combinator: query.combinator, not: query.not ?? false, rules: rootRules }]
            : []

      // Delete all existing entries, then re-create in order
      for (const entry of cohort.entries) {
        if (entry.id) await deleteEntry(cohort.id, entry.id)
      }
      for (const group of desiredGroups) {
        await createEntry(cohort.id, groupToEntryRequest(group))
      }

      onChanged()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Feil ved lagring')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <Dialog.Popup width="large">
        <Dialog.Header>
          <Dialog.Title>Kriterier: {cohort.name}</Dialog.Title>
          {cohort.description && <Dialog.Description>{cohort.description}</Dialog.Description>}
        </Dialog.Header>
        <Dialog.Body>
          <VStack gap="space-16">
            <BodyShort size="small" style={{ color: 'var(--ax-text-subtle)' }}>
              En bruker tilhører denne kohorten hvis de oppfyller kriteriene nedenfor. Bruk <strong>IKKE</strong>
              -bryteren på en gruppe for å invertere den.
            </BodyShort>

            <div className="cohort-qb-wrapper">
              <QueryBuilderDateTime>
                <QueryBuilder
                  fields={FIELDS}
                  operators={OPERATORS}
                  query={query}
                  onQueryChange={setQuery}
                  showNotToggle
                  showCombinatorsBetweenRules={false}
                  addRuleToNewGroups
                  // Block plain rules at root — only groups (entries) belong at root level
                  onAddRule={(rule: RuleType, parentPath: Path) => (parentPath.length > 0 ? rule : false)}
                  controlClassnames={{
                    queryBuilder: 'cohort-qb queryBuilder-branches',
                    ruleGroup: 'cohort-qb-group',
                    rule: 'cohort-qb-rule',
                    addRule: 'cohort-qb-add-rule',
                    addGroup: 'cohort-qb-add-group',
                    removeRule: 'cohort-qb-remove',
                    removeGroup: 'cohort-qb-remove',
                    combinators: 'cohort-qb-combinator',
                    fields: 'cohort-qb-field',
                    operators: 'cohort-qb-operator',
                    value: 'cohort-qb-value',
                    notToggle: 'cohort-qb-not',
                  }}
                  translations={{
                    addRule: { label: '+ Filter' },
                    addGroup: { label: '+ Gruppe' },
                    removeRule: { label: '✕' },
                    removeGroup: { label: '✕' },
                    notToggle: { label: 'IKKE', title: 'Inverter denne gruppen' },
                    combinators: { title: 'Kombinator' },
                  }}
                  getValueEditorType={(field) => {
                    if (field === '__cohort__') return 'select'
                    return 'text'
                  }}
                  getValues={(field) => {
                    if (field === '__cohort__') return cohortOptions
                    return []
                  }}
                  getOperators={(field) => {
                    if (field === '__cohort__') {
                      return [{ name: 'in_cohort', label: 'tilhører' }]
                    }
                    if (field === 'created_at') return DATETIME_OPERATORS
                    return OPERATORS
                  }}
                />
              </QueryBuilderDateTime>
            </div>

            {/* Live human-readable preview */}
            <Box padding="space-12" background="neutral-soft" borderRadius="4">
              <VStack gap="space-4">
                <BodyShort size="small" weight="semibold" style={{ color: 'var(--ax-text-subtle)' }}>
                  Forhåndsvisning
                </BodyShort>
                <BodyShort size="small" style={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>
                  {queryToHuman(query, cohortNames)}
                </BodyShort>
              </VStack>
            </Box>

            {error && (
              <BodyShort size="small" style={{ color: 'var(--ax-text-danger)' }}>
                {error}
              </BodyShort>
            )}
          </VStack>
        </Dialog.Body>
        <Dialog.Footer>
          <Button onClick={() => void handleSave()} loading={saving}>
            Lagre kriterier
          </Button>
          <Dialog.CloseTrigger>
            <Button type="button" variant="secondary">
              Avbryt
            </Button>
          </Dialog.CloseTrigger>
        </Dialog.Footer>
      </Dialog.Popup>
    </Dialog>
  )
}

// ─── Compact summary tag for list view ───────────────────────────────────────

interface CohortSummaryTagProps {
  cohort: CohortDetailDto
  allCohorts: CohortDetailDto[]
}

export function CohortSummaryTag({ cohort }: CohortSummaryTagProps) {
  const query = cohortToQuery(cohort)
  const entryCount = query.rules.filter((r) => 'combinator' in r).length

  if (entryCount === 0) {
    return (
      <Tag variant="neutral" size="small">
        Ingen kriterier
      </Tag>
    )
  }

  return (
    <Tag variant="info" size="small">
      {entryCount} gruppe{entryCount !== 1 ? 'r' : ''}
    </Tag>
  )
}
