import { useState, useEffect } from 'react'
import {
  QueryBuilder,
  ValueEditor,
  toOptions,
  type RuleGroupType,
  type RuleType,
  type Field,
  type Operator,
  type ValueEditorProps,
  type FieldSelectorProps,
  type OperatorSelectorProps,
  type CombinatorSelectorProps,
  type NotToggleProps,
  type ActionProps,
} from 'react-querybuilder'
import { QueryBuilderDateTime } from '@react-querybuilder/datetime'
import '@react-querybuilder/datetime/dist/datetime.css'
import '@react-querybuilder/datetime/dist/datetime-layout.css'
import 'react-querybuilder/dist/query-builder-layout.css'
import { Button, Dialog, VStack, HStack, BodyShort, Box, Tag, Select, TextField, Checkbox } from '@navikt/ds-react'
import type {
  CohortDetailDto,
  CohortGroupNode,
  CohortNode,
  SequenceRelation,
  SequenceTimeUnit,
} from '../model/types.ts'
import { nodeToRuleGroup, ruleToNode, type ParamValueBlob, type SequenceValueBlob } from '../utils/cohortTreeMapper.ts'
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
  { name: '__param__', label: 'Egendefinert hendelsesparameter' },
  { name: '__cohort__', label: 'Er i kohort' },
  { name: '__sequence__', label: 'Sekvens (gjorde X, så (ikke) Y)' },
]

/**
 * Fields selectable inside a SEQUENCE node's anchor/target steps — same as
 * FIELDS minus `__cohort__`/`__sequence__` themselves, since a sequence step
 * must resolve to a plain timestamped event row (CohortTreeValidator rejects
 * a nested COHORT_REF or SEQUENCE inside anchor/target).
 */
const SEQUENCE_STEP_FIELDS: Field[] = FIELDS.filter((f) => f.name !== '__cohort__' && f.name !== '__sequence__')

/** Norwegian combinator labels — the whole builder should stick to one language, not mix "AND"/"OR" with "IKKE"/"+ Filter". */
const COMBINATORS = [
  { name: 'and', label: 'OG' },
  { name: 'or', label: 'ELLER' },
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

const SEQUENCE_OPERATORS: Operator[] = [{ name: 'sequence', label: 'sekvens' }]

/** Shared by the top-level QueryBuilder and StepConditionsEditor's per-row operator dropdowns. */
function getFieldOperators(field: string): Operator[] {
  if (field === '__cohort__') {
    return [
      { name: 'in_cohort', label: 'tilhører' },
      { name: 'not_in_cohort', label: 'tilhører ikke' },
    ]
  }
  if (field === '__sequence__') return SEQUENCE_OPERATORS
  if (field === 'created_at') return DATETIME_OPERATORS
  return OPERATORS
}

const EMPTY_ROOT: CohortGroupNode = { nodeType: 'GROUP', combinator: 'AND', negated: false, children: [] }
const EMPTY_STEP_QUERY: RuleGroupType = { combinator: 'and', rules: [] }

/** Theming for the top-level QueryBuilder — see cohortEditor.css for the actual styles/layout. */
const CONTROL_CLASSNAMES = {
  queryBuilder: 'cohort-qb',
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
}

const TRANSLATIONS = {
  addRule: { label: '+ Filter' },
  addGroup: { label: '+ Gruppe' },
  removeRule: { label: '✕' },
  removeGroup: { label: '✕' },
  notToggle: { label: 'IKKE', title: 'Inverter denne gruppen' },
  combinators: { title: 'Kombinator' },
}

const WINDOW_UNITS: { value: SequenceTimeUnit; label: string }[] = [
  { value: 'MINUTE', label: 'minutter' },
  { value: 'HOUR', label: 'timer' },
  { value: 'DAY', label: 'dager' },
  { value: 'WEEK', label: 'uker' },
  { value: 'MONTH', label: 'måneder' },
  { value: 'YEAR', label: 'år' },
]

// ─── Aksel-rendered RQB controls ──────────────────────────────────────────────
// RQB renders plain HTML by default (select/input/button). Swapping these in via
// `controlElements` makes the top-level builder use the same Aksel components as
// the hand-rolled sequence editor, instead of the other way around — one design
// language, driven from a single place, rather than a raw-HTML top level trying to
// look like Aksel underneath.

function AkselFieldSelector(props: FieldSelectorProps) {
  return (
    <Select
      label={props.title ?? 'Felt'}
      hideLabel
      size="small"
      className={props.className}
      value={props.value}
      disabled={props.disabled}
      onChange={(e) => props.handleOnChange(e.target.value)}
    >
      {toOptions(props.options)}
    </Select>
  )
}

function AkselOperatorSelector(props: OperatorSelectorProps) {
  return (
    <Select
      label={props.title ?? 'Operator'}
      hideLabel
      size="small"
      className={props.className}
      value={props.value}
      disabled={props.disabled}
      onChange={(e) => props.handleOnChange(e.target.value)}
    >
      {toOptions(props.options)}
    </Select>
  )
}

function AkselCombinatorSelector(props: CombinatorSelectorProps) {
  return (
    <Select
      label={props.title ?? 'Kombinator'}
      hideLabel
      size="small"
      className={props.className}
      value={props.value}
      disabled={props.disabled}
      onChange={(e) => props.handleOnChange(e.target.value)}
    >
      {toOptions(props.options)}
    </Select>
  )
}

function AkselNotToggle(props: NotToggleProps) {
  return (
    <Checkbox
      className={props.className}
      size="small"
      checked={!!props.checked}
      disabled={props.disabled}
      onChange={(e) => props.handleOnChange(e.target.checked)}
    >
      {props.label}
    </Checkbox>
  )
}

/** Add/remove rule/group buttons — RQB calls this same component for all four via `controlElements`. */
function AkselActionButton(props: ActionProps) {
  const isRemove = props.className?.includes('remove')
  return (
    <Button
      type="button"
      variant={isRemove ? 'tertiary' : 'secondary'}
      data-color={isRemove ? 'danger' : undefined}
      size="small"
      className={props.className}
      disabled={props.disabled}
      onClick={(e) => props.handleOnClick(e)}
    >
      {props.label}
    </Button>
  )
}

/**
 * Default value editor for plain conditions (everything except __param__/
 * __sequence__, which get their own components below). Falls back to RQB's
 * own `<ValueEditor>` only for `datatype: 'datetime'` fields (created_at) —
 * that's where `@react-querybuilder/datetime`'s date/time picker behavior
 * lives, and reimplementing it isn't worth it just to swap in an Aksel input.
 */
function AkselDefaultValueEditor(props: ValueEditorProps) {
  if (props.fieldData?.datatype === 'datetime') return <ValueEditor {...props} />

  if (props.type === 'select') {
    return (
      <Select
        label={props.title ?? 'Verdi'}
        hideLabel
        size="small"
        className={props.className}
        value={(props.value as string) ?? ''}
        disabled={props.disabled}
        onChange={(e) => props.handleOnChange(e.target.value)}
      >
        <option value="" disabled>
          Velg...
        </option>
        {(props.values ?? []).map((v) => (
          <option key={v.value} value={v.value}>
            {v.label}
          </option>
        ))}
      </Select>
    )
  }

  return (
    <TextField
      label={props.title ?? 'Verdi'}
      hideLabel
      size="small"
      className={props.className}
      value={(props.value as string) ?? ''}
      disabled={props.disabled}
      onChange={(e) => props.handleOnChange(e.target.value)}
    />
  )
}

// ─── Custom value editors (field-dispatched, fall back to RQB's default) ─────
// See https://react-querybuilder.js.org/docs/tips/custom-with-fallback

/**
 * "Nøkkel" + "Verdi" inputs for a custom event parameter condition — shared
 * by both ParamValueEditor (RQB's valueEditor slot) and StepConditionsEditor.
 * Uses Aksel's <TextField> like every other input control in this editor.
 */
function ParamInlineEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  let blob: ParamValueBlob
  try {
    blob = JSON.parse(value || '{}') as ParamValueBlob
  } catch {
    blob = { paramKey: '', value: '' }
  }

  const update = (next: Partial<ParamValueBlob>) => onChange(JSON.stringify({ ...blob, ...next }))

  return (
    <HStack gap="space-8" className="cohort-param-editor">
      <TextField
        label="Parameternavn"
        hideLabel
        size="small"
        placeholder="Parameternavn (f.eks. tekst)"
        value={blob.paramKey}
        onChange={(e) => update({ paramKey: e.target.value })}
      />
      <TextField
        label="Verdi"
        hideLabel
        size="small"
        placeholder="Verdi"
        value={blob.value}
        onChange={(e) => update({ value: e.target.value })}
      />
    </HStack>
  )
}

/** Thin RQB `valueEditor` adapter over ParamInlineEditor — see that component for the actual UI. */
function ParamValueEditor(props: ValueEditorProps) {
  if (props.field !== '__param__') return <AkselDefaultValueEditor {...props} />
  return <ParamInlineEditor value={(props.value as string) || ''} onChange={(v) => props.handleOnChange(v)} />
}

interface StepConditionsEditorProps {
  query: RuleGroupType
  onChange: (next: RuleGroupType) => void
}

/**
 * A deliberately simple, flat AND/OR-of-conditions editor for a SEQUENCE
 * node's anchor/target step. Deliberately NOT a nested <QueryBuilder> — see
 * SequenceEditor's doc comment for the "Maximum update depth exceeded" bug
 * that ruled that out.
 *
 * Styling: the outer group/row containers reuse RQB's OWN built-in
 * classnames (`rule`, `ruleGroup`, `ruleGroup-header`, `ruleGroup-body`) for
 * borders/spacing/backgrounds, so this looks like just another group in the
 * builder rather than a visually distinct "custom" section — but the actual
 * form controls (selects/inputs/buttons) are Aksel components, same as the
 * rest of the app, not raw HTML elements matched by a shared CSS selector.
 */
function StepConditionsEditor({ query, onChange }: StepConditionsEditorProps) {
  const rules = query.rules as RuleType[]

  const updateRule = (index: number, next: Partial<RuleType>) => {
    onChange({ ...query, rules: rules.map((r, i) => (i === index ? { ...r, ...next } : r)) })
  }

  const addRule = () => {
    const field = SEQUENCE_STEP_FIELDS[0]?.name ?? 'event_name'
    onChange({
      ...query,
      rules: [...rules, { field, operator: getFieldOperators(field)[0]?.name ?? 'EQUALS', value: '' }],
    })
  }

  const removeRule = (index: number) => {
    onChange({ ...query, rules: rules.filter((_, i) => i !== index) })
  }

  return (
    <div className="ruleGroup cohort-step-group">
      <HStack className="ruleGroup-header" align="center">
        <Select
          label="Kombinator"
          hideLabel
          size="small"
          className="cohort-step-combinator"
          value={query.combinator}
          onChange={(e) => onChange({ ...query, combinator: e.target.value })}
        >
          {COMBINATORS.map((c) => (
            <option key={c.name} value={c.name}>
              {c.label}
            </option>
          ))}
        </Select>

        <Button type="button" variant="secondary" size="small" className="cohort-step-add" onClick={addRule}>
          + Filter
        </Button>
      </HStack>

      <div className="ruleGroup-body">
        {rules.map((rule, index) => (
          <HStack key={index} gap="space-8" align="end" className="rule cohort-step-row">
            <Select
              label="Felt"
              hideLabel
              size="small"
              value={rule.field}
              onChange={(e) => {
                const field = e.target.value
                updateRule(index, {
                  field,
                  operator: getFieldOperators(field)[0]?.name ?? 'EQUALS',
                  value:
                    field === '__param__' ? JSON.stringify({ paramKey: '', value: '' } satisfies ParamValueBlob) : '',
                })
              }}
            >
              {SEQUENCE_STEP_FIELDS.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.label}
                </option>
              ))}
            </Select>

            <Select
              label="Operator"
              hideLabel
              size="small"
              value={rule.operator}
              onChange={(e) => updateRule(index, { operator: e.target.value })}
            >
              {getFieldOperators(rule.field).map((op) => (
                <option key={op.name} value={op.name}>
                  {op.label}
                </option>
              ))}
            </Select>

            {rule.field === '__param__' ? (
              <ParamInlineEditor value={rule.value as string} onChange={(v) => updateRule(index, { value: v })} />
            ) : rule.field === 'created_at' ? (
              // Aksel's TextField has no `datetime-local` type — same fallback
              // reasoning as AkselDefaultValueEditor above.
              <input
                type="datetime-local"
                aria-label="Verdi"
                className="navds-text-field__input navds-body-short navds-body-short--medium"
                value={rule.value as string}
                onChange={(e) => updateRule(index, { value: e.target.value })}
              />
            ) : (
              <TextField
                label="Verdi"
                hideLabel
                size="small"
                type="text"
                value={rule.value as string}
                onChange={(e) => updateRule(index, { value: e.target.value })}
              />
            )}

            <Button
              type="button"
              variant="tertiary"
              data-color="danger"
              size="small"
              className="cohort-step-remove"
              onClick={() => removeRule(index)}
            >
              ✕
            </Button>
          </HStack>
        ))}
      </div>
    </div>
  )
}

/**
 * Renders the SEQUENCE node editor for field=__sequence__: two flat
 * StepConditionsEditors (anchor/target — see its doc comment for why these
 * aren't nested QueryBuilders), a relation select, and a window value+unit
 * picker. Same styling approach as StepConditionsEditor — reuses RQB's own
 * `ruleGroup`/`ruleGroup-combinators` classnames rather than inventing
 * parallel CSS, so this whole nested editor looks like one more group in
 * the outer builder, not a visually distinct "custom" section bolted on.
 *
 * Only ever invoked by CohortValueEditor when field === '__sequence__' — no
 * internal field guard here (unlike ParamValueEditor), since that would be a
 * conditional hook call ahead of the useState below (React hooks rule).
 */
function SequenceEditor(props: ValueEditorProps) {
  // Local state, initialized ONCE from props.value (lazy initializer), not
  // re-derived from props.value on every render. This is the crux of the fix
  // for "Maximum update depth exceeded": a nested QueryBuilder normalizes
  // whatever `query` object it's given (assigning internal rule ids the
  // first time it sees a rule without one) and reports back via
  // onQueryChange — which we propagate outward via props.handleOnChange.
  // That write lands back in the *outer* query state, which re-renders this
  // component with a new `props.value` string. If blob were re-derived from
  // props.value on every render (e.g. via `useMemo(..., [props.value])`),
  // that round-trip alone is enough to keep producing "changed" objects
  // indefinitely — an infinite loop, reproducible by saving a cohort with a
  // SEQUENCE node and having its re-fetched tree flow back through here.
  // Owning the state locally and only ever syncing outward breaks that cycle:
  // props.value only matters for the very first render of this component
  // instance (a fresh mount happens whenever the outer query is rebuilt from
  // scratch, e.g. after save+refetch — nodeToRule never preserves RQB's
  // internal rule ids, so React always sees a new key there and remounts).
  const [blob, setBlob] = useState<SequenceValueBlob>(() => {
    try {
      const parsed = JSON.parse((props.value as string) || '') as SequenceValueBlob
      if (!parsed.anchor) throw new Error('missing anchor')
      return parsed
    } catch {
      return {
        anchor: EMPTY_STEP_QUERY,
        target: EMPTY_STEP_QUERY,
        relation: 'FOLLOWED_BY',
        windowValue: 1,
        windowUnit: 'DAY',
      }
    }
  })

  const update = (next: Partial<SequenceValueBlob>) => {
    const merged = { ...blob, ...next }
    setBlob(merged)
    props.handleOnChange(JSON.stringify(merged))
  }

  return (
    <div className="ruleGroup cohort-sequence-editor">
      <div>
        <BodyShort size="small" weight="semibold">
          Gjorde:
        </BodyShort>
        <StepConditionsEditor query={blob.anchor} onChange={(q) => update({ anchor: q })} />
      </div>

      <Select
        label="Relasjon"
        hideLabel
        size="small"
        className="cohort-sequence-relation"
        value={blob.relation}
        onChange={(e) => update({ relation: e.target.value as SequenceRelation })}
      >
        <option value="FOLLOWED_BY">...etterfulgt av</option>
        <option value="NOT_FOLLOWED_BY">...IKKE etterfulgt av</option>
      </Select>

      <div>
        <BodyShort size="small" weight="semibold">
          {blob.relation === 'NOT_FOLLOWED_BY' ? 'Uten (innen fristen):' : 'Etterfulgt av:'}
        </BodyShort>
        <StepConditionsEditor query={blob.target} onChange={(q) => update({ target: q })} />
      </div>

      <HStack gap="space-8" align="end" className="cohort-sequence-window">
        <TextField
          label="Innen"
          size="small"
          type="number"
          min={1}
          value={String(blob.windowValue)}
          onChange={(e) => update({ windowValue: Number(e.target.value) || 1 })}
        />
        <Select
          label="Enhet"
          hideLabel
          size="small"
          value={blob.windowUnit}
          onChange={(e) => update({ windowUnit: e.target.value as SequenceTimeUnit })}
        >
          {WINDOW_UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </Select>
      </HStack>
    </div>
  )
}

/** Top-level dispatcher passed to `controlElements.valueEditor` — routes __param__/__sequence__ fields to their custom editors, everything else to RQB's default. */
function CohortValueEditor(props: ValueEditorProps) {
  if (props.field === '__param__') return <ParamValueEditor {...props} />
  if (props.field === '__sequence__') return <SequenceEditor {...props} />
  return <AkselDefaultValueEditor {...props} />
}

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
      const combinatorText = node.combinator === 'OR' ? 'ELLER' : 'OG'
      const inner = node.children.map((c) => nodeToHuman(c, cohortNames)).join(` ${combinatorText} `)
      const wrapped = node.children.length > 1 ? `(${inner})` : inner
      return node.negated ? `IKKE ${wrapped}` : wrapped
    }
    case 'CONDITION': {
      const field = node.paramKey != null ? node.paramKey : (FIELD_LABELS[node.field ?? ''] ?? node.field)
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
      <Dialog.Popup width="min(90vw, 1400px)">
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
                  combinators={COMBINATORS}
                  query={query}
                  onQueryChange={setQuery}
                  showNotToggle
                  showCombinatorsBetweenRules={false}
                  addRuleToNewGroups
                  controlClassnames={CONTROL_CLASSNAMES}
                  translations={TRANSLATIONS}
                  controlElements={{
                    valueEditor: CohortValueEditor,
                    fieldSelector: AkselFieldSelector,
                    operatorSelector: AkselOperatorSelector,
                    combinatorSelector: AkselCombinatorSelector,
                    notToggle: AkselNotToggle,
                    addRuleAction: AkselActionButton,
                    addGroupAction: AkselActionButton,
                    removeRuleAction: AkselActionButton,
                    removeGroupAction: AkselActionButton,
                  }}
                  getValueEditorType={(field) => {
                    if (field === '__cohort__') return 'select'
                    return 'text'
                  }}
                  getValues={(field) => {
                    if (field === '__cohort__') return cohortOptions
                    return []
                  }}
                  getOperators={getFieldOperators}
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
