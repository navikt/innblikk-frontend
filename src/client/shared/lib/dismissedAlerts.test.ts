import { describe, it, expect, beforeEach } from 'vitest'
import { dismissAlert, isAlertDismissed } from './dismissedAlerts.ts'

describe('dismissedAlerts', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('reports an alert as not dismissed initially', () => {
    expect(isAlertDismissed('foo')).toBe(false)
  })

  it('remembers a dismissal', () => {
    dismissAlert('foo')
    expect(isAlertDismissed('foo')).toBe(true)
  })

  it('tracks ids independently', () => {
    dismissAlert('foo')
    expect(isAlertDismissed('bar')).toBe(false)
  })

  it('preserves the dismissed builder notice after its feature id is renamed', () => {
    localStorage.setItem('innblikk_dismissed_alerts', JSON.stringify(['grafbygger-next', 'foo']))
    expect(isAlertDismissed('grafbyggeren-alfa')).toBe(true)
    expect(isAlertDismissed('foo')).toBe(true)
    dismissAlert('bar')
    expect(JSON.parse(localStorage.getItem('innblikk_dismissed_alerts')!)).toEqual(['grafbyggeren-alfa', 'foo', 'bar'])
  })

  it('stores new builder dismissals using the Alfa feature id', () => {
    dismissAlert('grafbyggeren-alfa')
    expect(JSON.parse(localStorage.getItem('innblikk_dismissed_alerts')!)).toEqual(['grafbyggeren-alfa'])
  })

  it('does not duplicate ids on repeated dismissal', () => {
    dismissAlert('foo')
    dismissAlert('foo')
    expect(JSON.parse(localStorage.getItem('innblikk_dismissed_alerts')!)).toEqual(['foo'])
  })

  it('treats corrupt stored JSON as nothing dismissed', () => {
    localStorage.setItem('innblikk_dismissed_alerts', 'not-json')
    expect(isAlertDismissed('foo')).toBe(false)
  })

  it('ignores non-string entries in the stored array', () => {
    localStorage.setItem('innblikk_dismissed_alerts', JSON.stringify(['foo', 42, null]))
    expect(isAlertDismissed('foo')).toBe(true)
    expect(isAlertDismissed('42')).toBe(false)
  })
})
