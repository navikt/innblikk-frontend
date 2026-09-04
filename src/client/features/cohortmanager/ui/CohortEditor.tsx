import { useState, useEffect } from 'react'
import {
  QueryBuilder,
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
import 'react-querybuilder/dist/query-builder-layout.css'
import { Button, Dialog, VStack, HStack, BodyShort, Box, Tag, Select, TextField, Checkbox } from '@navikt/ds-react'
import { SuggestingValueEditor } from './SuggestingValueEditor.tsx'
import type { SuggestibleColumn } from '../api/columnValuesApi.ts'
import type {
  CohortDetailDto,
  CohortGroupNode,
  CohortNode,
  SequenceRelation,
  SequenceTimeUnit,
} from '../model/types.ts'
import { nodeToRuleGroup, ruleToNode, type ParamValueBlob, type SequenceValueBlob } from '../utils/cohortTreeMapper.ts'
import { createCohort, replaceCriteria, updateCohort } from '../api/cohortManagerApi.ts'
import { isRelativeDateTimeValue } from '../utils/cohortSqlResolver.ts'
import { CohortDateTimeEditor, CohortDateTimeValueEditor } from './CohortDateTimeEditor.tsx'
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
  { name: '__detail__', label: 'Detalj om hendelsen' },
  { name: 'created_at', label: 'Tidspunkt' },
  { name: '__cohort__', label: 'Er i brukergruppe' },
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

/**
 * "Tidspunkt" (created_at) has exactly one operator, BETWEEN — a period is
 * inherently one relation, not two independent >=/<= bounds. This single
 * entry is never rendered as a dropdown (see AkselOperatorSelector and
 * StepConditionsEditor below, both of which hide the operator select for
 * this field entirely); it only exists so getFieldOperators(field)[0]
 * auto-selects BETWEEN the moment "Tidspunkt" is picked as the field.
 */
const DATETIME_OPERATORS: Operator[] = [{ name: 'BETWEEN', label: 'er mellom' }]

const SEQUENCE_OPERATORS: Operator[] = [{ name: 'sequence', label: 'sekvens' }]

/**
 * «Detalj om hendelsen» compares a detail's string value — equality and the
 * set operators make sense; the fuzzy string operators (inneholder/starter
 * med/…) stay available as free-text hints per the locked decisions.
 */
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
  const isDetail = props.value === '__detail__'
  return (
    <VStack gap="space-4" className={props.className}>
      <Select
        label={props.title ?? 'Felt'}
        hideLabel
        size="small"
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.handleOnChange(e.target.value)}
      >
        {toOptions(props.options)}
      </Select>
      {isDetail && (
        <BodyShort size="small" style={{ color: 'var(--ax-text-subtle)' }}>
          Noen hendelser har ekstra informasjon, f.eks. hvilken knapp som ble trykket.
        </BodyShort>
      )}
    </VStack>
  )
}

/**
 * "Tidspunkt" (created_at) has exactly one possible operator (BETWEEN — see
 * DATETIME_OPERATORS), so there's nothing meaningful to choose: hide the
 * dropdown entirely rather than show a disabled/single-option select.
 */
function AkselOperatorSelector(props: OperatorSelectorProps) {
  if (props.field === 'created_at') return null
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
 * Default value editor for plain conditions (everything except __detail__/
 * __sequence__/created_at, which get their own components). __cohort__ keeps
 * its RQB-provided select (values come from getValues); every real column
 * gets a suggestion-backed combobox — IN_SET/NOT_IN_SET as multi-select,
 * everything else single-select with allowNewValues (free text stays the
 * escape hatch; suggestions are also shown for f.eks. «inneholder» as
 * harmless hints).
 */
function AkselDefaultValueEditor(props: ValueEditorProps, websiteId?: string) {
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
    <SuggestingValueEditor
      websiteId={websiteId}
      column={props.field as SuggestibleColumn}
      label={props.title ?? 'Verdi'}
      multi={props.operator === 'IN_SET' || props.operator === 'NOT_IN_SET'}
      value={(props.value as string) ?? ''}
      disabled={props.disabled}
      onChange={(v) => props.handleOnChange(v)}
    />
  )
}

// ─── Custom value editors (field-dispatched, fall back to RQB's default) ─────
// See https://react-querybuilder.js.org/docs/tips/custom-with-fallback

/**
 * «Detalj» key combobox + conditional «Verdi» combobox + «Sjekk bare at
 * detaljen finnes» toggle — shared by DetailValueEditor (RQB's valueEditor
 * slot) and StepConditionsEditor (sequence steps). The «Verdi» combobox is
 * key-scoped (column=event_data_value&key=X) and stays disabled with
 * «Velg en detalj først» until a key is chosen (conditional cascade —
 * accepted UX tradeoff). No legacy support: old event_data_key /
 * event_data_value / __param__ cohort data can break gracefully.
 */
function DetailInlineEditor({
  value,
  onChange,
  websiteId,
  operator,
}: {
  value: string
  onChange: (value: string) => void
  websiteId: string | undefined
  operator?: string
}) {
  let blob: ParamValueBlob
  try {
    blob = JSON.parse(value || '{}') as ParamValueBlob
  } catch {
    blob = { paramKey: '', value: '' }
  }

  const update = (next: Partial<ParamValueBlob>) => onChange(JSON.stringify({ ...blob, ...next }))
  const isSetOperator = operator === 'IN_SET' || operator === 'NOT_IN_SET'
  const hasKey = blob.paramKey.length > 0

  return (
    <VStack gap="space-8" className="cohort-detail-editor">
      <HStack gap="space-8" align="end">
        <SuggestingValueEditor
          websiteId={websiteId}
          column="event_data_key"
          label="Detalj"
          value={blob.paramKey}
          onChange={(paramKey) => update({ paramKey, value: '' })}
          placeholder="f.eks. skjemaId"
        />
        <SuggestingValueEditor
          websiteId={websiteId}
          column="event_data_value"
          suggestionKey={hasKey ? blob.paramKey : undefined}
          label="Verdi"
          multi={isSetOperator}
          value={blob.value}
          onChange={(v) => update({ value: v })}
          disabled={!hasKey || blob.existsOnly === true}
          placeholder={!hasKey ? 'Velg en detalj først' : undefined}
        />
      </HStack>
      <Checkbox
        size="small"
        checked={blob.existsOnly === true}
        onChange={(e) => update({ existsOnly: e.target.checked, value: e.target.checked ? '' : blob.value })}
      >
        Sjekk bare at detaljen finnes
      </Checkbox>
    </VStack>
  )
}

/** Thin RQB `valueEditor` adapter over DetailInlineEditor — see that component for the actual UI. */
function DetailValueEditor(props: ValueEditorProps, websiteId: string | undefined) {
  return (
    <DetailInlineEditor
      value={(props.value as string) || ''}
      onChange={(v) => props.handleOnChange(v)}
      websiteId={websiteId}
      operator={props.operator}
    />
  )
}

interface StepConditionsEditorProps {
  query: RuleGroupType
  onChange: (next: RuleGroupType) => void
  websiteId?: string
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
function StepConditionsEditor({ query, onChange, websiteId }: StepConditionsEditorProps) {
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
                    field === '__detail__' ? JSON.stringify({ paramKey: '', value: '' } satisfies ParamValueBlob) : '',
                })
              }}
            >
              {SEQUENCE_STEP_FIELDS.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.label}
                </option>
              ))}
            </Select>

            {rule.field !== 'created_at' && (
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
            )}

            {rule.field === '__detail__' ? (
              <DetailInlineEditor
                value={rule.value as string}
                onChange={(v) => updateRule(index, { value: v })}
                websiteId={websiteId}
                operator={rule.operator}
              />
            ) : rule.field === 'created_at' ? (
              <CohortDateTimeEditor value={rule.value as string} onChange={(v) => updateRule(index, { value: v })} />
            ) : (
              <SuggestingValueEditor
                websiteId={websiteId}
                column={rule.field as SuggestibleColumn}
                label="Verdi"
                multi={rule.operator === 'IN_SET' || rule.operator === 'NOT_IN_SET'}
                value={rule.value as string}
                onChange={(v) => updateRule(index, { value: v })}
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
 * internal field guard here (unlike DetailValueEditor), since that would be a
 * conditional hook call ahead of the useState below (React hooks rule).
 */
function SequenceEditor(props: ValueEditorProps, websiteId?: string) {
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
        <StepConditionsEditor query={blob.anchor} onChange={(q) => update({ anchor: q })} websiteId={websiteId} />
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
        <StepConditionsEditor query={blob.target} onChange={(q) => update({ target: q })} websiteId={websiteId} />
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

/** Top-level dispatcher passed to `controlElements.valueEditor` — routes __detail__/__sequence__/created_at fields to their custom editors, everything else to the suggestion-backed default. */
function makeCohortValueEditor(websiteId?: string) {
  return function CohortValueEditor(props: ValueEditorProps) {
    if (props.field === '__detail__') return DetailValueEditor(props, websiteId)
    if (props.field === '__sequence__') return SequenceEditor(props, websiteId)
    if (props.field === 'created_at') return <CohortDateTimeValueEditor {...props} />
    return AkselDefaultValueEditor(props, websiteId)
  }
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
  created_at: 'tidspunkt',
  __cohort__: 'brukergruppe',
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
  EXISTS: 'har detaljen',
}

/** Human-readable rendering of an IN_SET/NOT_IN_SET JSON string-array value. */
function formatSetValue(rawValue: string): string {
  try {
    const parsed: unknown = JSON.parse(rawValue)
    if (Array.isArray(parsed)) return parsed.map((v) => `«${String(v)}»`).join(', ')
  } catch {
    // fall through
  }
  return `«${rawValue}»`
}

const RELATIVE_UNIT_LABELS: Record<string, string> = {
  minute: 'minutt',
  hour: 'time',
  day: 'dag',
  week: 'uke',
  month: 'måned',
  year: 'år',
}

const RELATIVE_ANCHOR_LABELS: Record<string, string> = {
  now: 'nå',
  startOfDay: 'start av dagen',
  endOfDay: 'slutt av dagen',
  startOfWeek: 'start av uken',
  endOfWeek: 'slutt av uken',
  startOfMonth: 'start av måneden',
  endOfMonth: 'slutt av måneden',
  startOfYear: 'start av året',
  endOfYear: 'slutt av året',
}

/** Human-readable rendering of a single `created_at` bound — a JSON RelativeDateTimeValue, or a plain ISO date string. */
function formatDateTimeBound(rawValue: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawValue)
  } catch {
    parsed = rawValue
  }

  if (isRelativeDateTimeValue(parsed)) {
    const anchorLabel = RELATIVE_ANCHOR_LABELS[parsed.anchor] ?? parsed.anchor
    if (parsed.offset === 0) return anchorLabel
    const unitLabel = RELATIVE_UNIT_LABELS[parsed.unit] ?? parsed.unit
    const amount = Math.abs(parsed.offset)
    const direction = parsed.offset < 0 ? 'før' : 'etter'
    return `${amount} ${unitLabel}${amount === 1 ? '' : 'er'} ${direction} ${anchorLabel}`
  }

  if (typeof parsed === 'string') {
    const date = new Date(parsed)
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString('nb-NO')
  }

  return rawValue
}

/** Human-readable rendering of a "Tidspunkt" (created_at) BETWEEN condition's `{from, to}` value — see CohortDateTimeEditor.tsx. */
function formatDateTimeValue(rawValue: string): string {
  try {
    const parsed = JSON.parse(rawValue) as { from?: unknown; to?: unknown }
    if (typeof parsed.from === 'string' && typeof parsed.to === 'string') {
      return `fra ${formatDateTimeBound(parsed.from)} til ${formatDateTimeBound(parsed.to)}`
    }
  } catch {
    // fall through
  }
  return rawValue
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
      if (node.field === 'created_at') {
        return `tidspunkt ${formatDateTimeValue(node.value)}`
      }
      if (node.paramKey != null) {
        if (node.conditionType === 'EXISTS') return `har detaljen «${node.paramKey}»`
        const op = OP_LABELS[node.conditionType] ?? node.conditionType
        const valueText =
          node.conditionType === 'IN_SET' || node.conditionType === 'NOT_IN_SET'
            ? formatSetValue(node.value)
            : `«${node.value}»`
        return `${node.paramKey} ${op} ${valueText}`
      }
      const field = FIELD_LABELS[node.field ?? ''] ?? node.field
      const op = OP_LABELS[node.conditionType] ?? node.conditionType
      const valueText =
        node.conditionType === 'IN_SET' || node.conditionType === 'NOT_IN_SET'
          ? formatSetValue(node.value)
          : `«${node.value}»`
      return `${field} ${op} ${valueText}`
    }
    case 'COHORT_REF': {
      const name = cohortNames[String(node.referencedCohortId)] ?? `brukergruppe #${node.referencedCohortId}`
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
  /** Existing cohort when editing, null when creating a new one. */
  cohort: CohortDetailDto | null
  /** Website the new cohort belongs to — required when `cohort` is null. */
  websiteId?: string
  allCohorts: CohortDetailDto[]
  onClose: () => void
  onChanged: () => void
}

/**
 * One dialog for both creating and editing a brukergruppe: name + description
 * at the top, criteria tree right under it. For a new cohort the criteria are
 * saved via replaceCriteria right after the create call (creating is what
 * assigns the id the criteria endpoint needs) — a failed criteria save then
 * deletes the just-created shell so no name-less ghost cohort is left behind.
 */
export function CohortEditor({ cohort, websiteId, allCohorts, onClose, onChanged }: CohortEditorProps) {
  const isNew = cohort === null
  const [name, setName] = useState(cohort?.name ?? '')
  const [description, setDescription] = useState(cohort?.description ?? '')
  const [query, setQuery] = useState<RuleGroupType>(() =>
    cohort ? cohortToQuery(cohort) : nodeToRuleGroup(EMPTY_ROOT),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)

  useEffect(() => {
    if (!cohort) return
    setName(cohort.name)
    setDescription(cohort.description ?? '')
    setQuery(cohortToQuery(cohort))
  }, [cohort])

  // Map cohort IDs → names for the __cohort__ value editor
  const cohortOptions = allCohorts
    .filter((c) => c.id !== cohort?.id)
    .map((c) => ({ value: String(c.id), label: c.name }))

  const cohortNames = Object.fromEntries(allCohorts.map((c) => [String(c.id), c.name]))

  const handleSave = async () => {
    // Field-level validation error lives on the input itself (Aksel `error`
    // prop) — not in the catch-all at the bottom, which is for save failures.
    if (!name.trim()) {
      setNameError('Navn er påkrevd')
      return
    }
    setNameError(null)
    setSaving(true)
    setError(null)
    try {
      const root = ruleToNode(query) as CohortGroupNode
      if (isNew) {
        if (!websiteId) throw new Error('Mangler websiteId for ny brukergruppe')
        const created = await createCohort({
          websiteId,
          name: name.trim(),
          description: description.trim() || undefined,
        })
        try {
          await replaceCriteria(created.id, root)
        } catch (criteriaErr: unknown) {
          // Roll back the shell so a failed criteria save doesn't leave a
          // half-created cohort occupying the (unique per website) name.
          await fetch(`/api/backend/cohort/${created.id}`, { method: 'DELETE' })
          throw criteriaErr
        }
      } else {
        await updateCohort(cohort.id, {
          name: name.trim(),
          websiteId: cohort.websiteId,
          description: description.trim() || undefined,
        })
        await replaceCriteria(cohort.id, root)
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
      <Dialog.Popup width="min(90vw, 1400px)">
        <Dialog.Header>
          <Dialog.Title>{isNew ? 'Ny brukergruppe' : `Rediger «${cohort.name}»`}</Dialog.Title>
        </Dialog.Header>
        <Dialog.Body>
          <VStack gap="space-16">
            <div style={{ maxWidth: 480 }}>
              <VStack gap="space-12">
                <TextField
                  label="Navn"
                  size="small"
                  value={name}
                  error={nameError ?? undefined}
                  onChange={(e) => {
                    setName(e.target.value)
                    if (nameError && e.target.value.trim()) setNameError(null)
                  }}
                  autoFocus
                />
                <TextField
                  label="Beskrivelse (valgfri)"
                  size="small"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </VStack>
            </div>

            <div>
              <BodyShort size="small" weight="semibold" spacing>
                Kriterier
              </BodyShort>
              <BodyShort size="small" style={{ color: 'var(--ax-text-subtle)' }} spacing>
                En bruker tilhører denne brukergruppen hvis de oppfyller kriteriene nedenfor. Bruk <strong>IKKE</strong>
                -bryteren for å ekskludere en gruppe i stedet.
              </BodyShort>

              <div className="cohort-qb-wrapper">
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
                    valueEditor: makeCohortValueEditor(cohort?.websiteId ?? websiteId),
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
                  getDefaultValue={(rule) => {
                    if (rule.field === '__detail__') {
                      return JSON.stringify({ paramKey: '', value: '', existsOnly: false } satisfies ParamValueBlob)
                    }
                    if (rule.operator === 'IN_SET' || rule.operator === 'NOT_IN_SET') return '[]'
                    return ''
                  }}
                  getOperators={getFieldOperators}
                />
              </div>
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
            {isNew ? 'Opprett brukergruppe' : 'Lagre'}
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
