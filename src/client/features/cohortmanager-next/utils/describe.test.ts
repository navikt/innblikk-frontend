import { describe, it, expect } from 'vitest'
import { describeDraft, describeTreeInline } from './describe.ts'
import { describeTime, matchPreset, presetValue, TIME_PRESETS } from './time.ts'
import { conditionError, findConflictingConditionIds, validateDraft } from './validate.ts'
import {
  emptyCondition,
  emptyDraft,
  emptyEventCard,
  eventToSequence,
  type Draft,
  type EventCard,
} from '../model/draft.ts'
import type { CohortGroupNode } from '../../cohortmanager/model/types.ts'

const card = (overrides: Partial<EventCard> = {}): EventCard => ({ ...emptyEventCard(), ...overrides })
const cond = (field: 'url_path' | 'device', value: string) => ({ ...emptyCondition(field), value })

describe('describeDraft', () => {
  it('reads a two-card draft as plain sentences', () => {
    const draft: Draft = {
      combinator: 'AND',
      cards: [
        card({
          conditions: [cond('url_path', '/soknad'), cond('device', 'mobile')],
          time: presetValue(TIME_PRESETS[2]),
        }),
        card({ negated: true, conditions: [{ ...emptyCondition('event_name'), value: 'skjema_sendt' }] }),
      ],
    }
    const { lines } = describeDraft(draft, {})
    expect(lines[0]).toEqual({
      connector: null,
      text: 'har gjort noe der URL-sti er «/soknad» og enhet er «mobile» i løpet av siste 30 dager',
    })
    expect(lines[1]).toEqual({ connector: 'og', text: 'har ikke gjort noe der hendelsen er «skjema_sendt»' })
  })

  it('uses «eller» between cards for an OR draft', () => {
    const draft: Draft = { combinator: 'OR', cards: [card(), card()] }
    expect(describeDraft(draft, {}).lines[1].connector).toBe('eller')
  })

  it('describes a list value', () => {
    const draft: Draft = {
      combinator: 'AND',
      cards: [card({ conditions: [{ ...emptyCondition('url_path'), operator: 'IN_SET', value: '["/a","/b"]' }] })],
    }
    expect(describeDraft(draft, {}).lines[0].text).toContain('URL-sti er en av «/a», «/b»')
  })
})

describe('describeTreeInline', () => {
  it('flags trees the cards cannot show', () => {
    const nested: CohortGroupNode = {
      nodeType: 'GROUP',
      combinator: 'AND',
      negated: false,
      children: [
        {
          nodeType: 'GROUP',
          combinator: 'AND',
          negated: false,
          children: [{ nodeType: 'GROUP', combinator: 'AND', negated: false, children: [] }],
        },
      ],
    }
    expect(describeTreeInline(nested, {})).toMatch(/Avansert logikk/)
  })
})

describe('time', () => {
  it('recognises presets and custom relative windows', () => {
    const preset = TIME_PRESETS[1]
    expect(matchPreset(presetValue(preset))?.id).toBe(preset.id)
    const custom = JSON.stringify({
      from: JSON.stringify({ mode: 'relative', anchor: 'now', offset: -45, unit: 'day' }),
      to: JSON.stringify({ mode: 'relative', anchor: 'now', offset: 0, unit: 'day' }),
    })
    expect(describeTime(custom)).toBe('i løpet av siste 45 dager')
    expect(describeTime(null)).toBe('')
  })

  it('describes fixed dates', () => {
    const fixed = JSON.stringify({ from: '2026-01-01T00:00:00', to: '2026-01-31T23:59:59' })
    expect(describeTime(fixed)).toMatch(/^fra .* til .*$/)
  })
})

describe('validation', () => {
  it('requires values', () => {
    expect(conditionError(cond('url_path', ''))).toBeTruthy()
    expect(conditionError(cond('url_path', '/a'))).toBeUndefined()
    expect(conditionError({ ...emptyCondition('detail'), operator: 'EXISTS' })).toBe('Velg hvilken detalj det gjelder')
    expect(conditionError({ ...emptyCondition('detail'), detailKey: 'k', operator: 'EXISTS' })).toBeUndefined()
    expect(conditionError({ ...emptyCondition('url_path'), operator: 'IN_SET', value: '[]' })).toBeTruthy()
  })

  it('flags two different exact values for one field in one card', () => {
    const a = cond('url_path', '/a')
    const b = cond('url_path', '/b')
    const conflicts = findConflictingConditionIds({ conditions: [a, b], time: null })
    expect([...conflicts]).toEqual([b.id])
    expect(findConflictingConditionIds({ conditions: [a, cond('device', 'mobile')], time: null }).size).toBe(0)
  })

  it('only accepts whole-number sequence windows', () => {
    const sequence = {
      ...eventToSequence({ ...card({ conditions: [cond('url_path', '/a')] }) }),
      windowValue: 1.5,
    }
    sequence.then = { conditions: [cond('url_path', '/b')], time: null }
    const issues = validateDraft({ combinator: 'AND', cards: [sequence] })
    expect(issues.map((i) => i.message)).toEqual([expect.stringContaining('helt tall')])
    expect(validateDraft({ combinator: 'AND', cards: [{ ...sequence, windowValue: 2 }] })).toEqual([])
  })

  it('reports issues for an incomplete draft and none for a complete one', () => {
    expect(validateDraft(emptyDraft()).length).toBeGreaterThan(0)
    const ok: Draft = { combinator: 'AND', cards: [card({ conditions: [cond('url_path', '/a')] })] }
    expect(validateDraft(ok)).toEqual([])
  })
})
