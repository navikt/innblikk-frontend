import { useState, useEffect } from 'react'
import { QueryBuilder, type RuleGroupType, type Field, type Operator } from 'react-querybuilder'
import { QueryBuilderDateTime } from '@react-querybuilder/datetime'
import '@react-querybuilder/datetime/dist/datetime.css'
import '@react-querybuilder/datetime/dist/datetime-layout.css'
import 'react-querybuilder/dist/query-builder-layout.css'
import { Button, Dialog, VStack, BodyShort, Box, Tag } from '@navikt/ds-react'
import type { CohortDetailDto, CohortGroupNode, CohortNode } from '../model/types.ts'
import { nodeToRuleGroup, ruleToNode } from '../utils/cohortTreeMapper.ts'
import { replaceCriteria } from '../api/cohortManagerApi.ts'
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
  { name: 'not_in_cohort', label: 'tilhører ikke' },
]

const DATETIME_OPERATORS: Operator[] = [
  { name: 'GREATER_THAN_OR_EQUAL', label: 'er etter eller lik' },
  { name: 'LESS_THAN_OR_EQUAL', label: 'er før eller lik' },
]

const EMPTY_ROOT: CohortGroupNode = { nodeType: 'GROUP', combinator: 'AND', negated: false, children: [] }

// ─── RQB ↔ Backend mapping ────────────────────────────────────────────────────
// Delegates to cohortTreeMapper.ts (nodeToRule/ruleToNode), which is unit-tested
// against arbitrary nesting, negated cohort refs, OR-of-cohort-refs, and
// sequence nodes — see cohortTreeMapper.test.ts.

/** Top-level query = the cohort's criteria tree, or an empty AND group if none saved yet. */
export function cohortToQuery(cohort: CohortDetailDto): RuleGroupType {
  // Root is always a GROUP by construction (enforced server-side by CohortTreeValidator).
  return nodeToRuleGroup((cohort.root as CohortGroupNode | null) ?? EMPTY_ROOT)
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
}

function nodeToHuman(node: CohortNode, cohortNames: Record<string, string>): string {
  switch (node.nodeType) {
    case 'GROUP': {
      if (node.children.length === 0) return '(ingen kriterier)'
      const inner = node.children.map((c) => nodeToHuman(c, cohortNames)).join(` ${node.combinator} `)
      const wrapped = node.children.length > 1 ? `(${inner})` : inner
      return node.negated ? `IKKE ${wrapped}` : wrapped
    }
    case 'CONDITION': {
      const field = FIELD_LABELS[node.field] ?? node.field
      const op = OP_LABELS[node.conditionType] ?? node.conditionType
      return `${field} ${op} «${node.value}»`
    }
    case 'COHORT_REF': {
      const name = cohortNames[String(node.referencedCohortId)] ?? `kohort #${node.referencedCohortId}`
      return `${node.negated ? 'IKKE ' : ''}tilhører ${name}`
    }
    case 'SEQUENCE': {
      const anchorText = nodeToHuman(node.anchor, cohortNames)
      const targetText = nodeToHuman(node.target, cohortNames)
      const relationText = node.relation === 'NOT_FOLLOWED_BY' ? 'IKKE etterfulgt av' : 'etterfulgt av'
      return `${anchorText} ${relationText} ${targetText} innen ${node.windowValue} ${node.windowUnit}`
    }
  }
}

export function queryToHuman(query: RuleGroupType, cohortNames: Record<string, string> = {}): string {
  return nodeToHuman(ruleToNode(query), cohortNames)
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
      const root = ruleToNode(query) as CohortGroupNode
      await replaceCriteria(cohort.id, root)
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
                      return [
                        { name: 'in_cohort', label: 'tilhører' },
                        { name: 'not_in_cohort', label: 'tilhører ikke' },
                      ]
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
  // Root is always a GROUP by construction (enforced server-side by CohortTreeValidator).
  const criteriaCount = (cohort.root as CohortGroupNode | null)?.children.length ?? 0

  if (criteriaCount === 0) {
    return (
      <Tag variant="neutral" size="small">
        Ingen kriterier
      </Tag>
    )
  }

  return (
    <Tag variant="info" size="small">
      {criteriaCount} kriterie{criteriaCount !== 1 ? 'r' : ''}
    </Tag>
  )
}
