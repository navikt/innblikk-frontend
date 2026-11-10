import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import UserActivityModal from './UserActivityModal'

const activity = [
  { type: 'pageview', title: 'Kalkulator', url: '/aap/kalkulator', createdAt: '2026-10-01T10:00:00Z' },
  { type: 'event', name: 'navigere', title: 'Kalkulator', url: '/aap/kalkulator', createdAt: '2026-10-01T10:00:02Z' },
]

describe('shared visitor activity modal', () => {
  it('preserves profile details, activity counts and URL actions without marking normal profile activity', async () => {
    const user = userEvent.setup()
    const onOpenUrl = vi.fn()
    const onClose = vi.fn()
    render(
      <UserActivityModal
        open
        onClose={onClose}
        activity={activity}
        loading={false}
        details={<div>Profilens enhet og nettleser</div>}
        onOpenUrl={onOpenUrl}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Brukerdetaljer' })
    expect(screen.getByText('Profilens enhet og nettleser')).toBeInTheDocument()
    expect(screen.getByText('Sidevisninger')).toBeInTheDocument()
    expect(screen.getByText('Hendelser')).toBeInTheDocument()
    expect(screen.getByText('Totalt')).toBeInTheDocument()
    expect(dialog.querySelector('[data-highlighted]')).toBeNull()
    await user.click(screen.getAllByRole('button', { name: '/aap/kalkulator' })[0])
    expect(onOpenUrl).toHaveBeenCalledWith('/aap/kalkulator')
    await user.click(screen.getByRole('button', { name: 'Lukk' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('opens event details for normal profile activity without highlighted events', async () => {
    const user = userEvent.setup()
    render(
      <UserActivityModal
        open
        onClose={() => {}}
        activity={[activity[0], { ...activity[1], properties: [{ key: 'knapp', value: 'Neste' }], propertyCount: 2 }]}
        loading={false}
      />,
    )
    expect(screen.getAllByRole('button', { name: 'Hendelsesdetaljer' })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Hendelsesdetaljer' }))
    expect(screen.getByRole('rowheader', { name: 'knapp' })).toBeVisible()
    expect(screen.getByRole('cell', { name: 'Neste' })).toBeVisible()
    expect(screen.getByText('Viser de første 1 av 2 egenskaper.')).toBeVisible()
  })

  it('marks matching profile events without treating different events or unknown details as identical', () => {
    const event = {
      ...activity[1],
      properties: [
        { key: 'knapp', value: 'Neste' },
        { key: 'steg', value: '1' },
      ],
    }
    render(
      <UserActivityModal
        open
        onClose={() => {}}
        loading={false}
        activity={[
          event,
          { ...event, createdAt: '2026-10-01T10:00:02.100Z', properties: [...event.properties].reverse() },
          { ...event, createdAt: '2026-10-01T10:00:04Z' },
          { ...event, type: 'pageview' },
          { ...event, name: 'klikk' },
          { ...event, url: '/annen-side' },
          { ...event, title: 'Annen tittel' },
          { ...event, properties: [{ key: 'knapp', value: 'Tilbake' }] },
          { ...event, properties: undefined },
          { ...event, properties: undefined },
        ]}
      />,
    )
    expect(screen.getAllByText('Nesten samtidige registreringer')).toHaveLength(2)
    expect(screen.getByRole('dialog').querySelectorAll('[data-detail-group]')).toHaveLength(2)
    expect(screen.queryByText('Inngår i funnet')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog').querySelector('[data-highlighted]')).toBeNull()
    expect(screen.queryByRole('table', { name: 'Forskjeller i hendelsesdetaljer' })).not.toBeInTheDocument()
  })

  it('does not mark incomplete profile matches as duplicates', () => {
    const event = { ...activity[1], properties: [{ key: 'knapp', value: 'Neste' }] }
    render(
      <UserActivityModal open onClose={() => {}} loading={false} activity={[{ ...event, propertyCount: 51 }, event]} />,
    )
    expect(screen.queryByText('Nesten samtidige registreringer')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog').querySelector('[data-detail-group]')).toBeNull()
  })

  it('separates duplicate bursts in reverse chronological activity and excludes gaps over 100 ms', () => {
    const event = { ...activity[1], properties: [] }
    render(
      <UserActivityModal
        open
        onClose={() => {}}
        loading={false}
        activity={[
          { ...event, createdAt: '2026-10-01T10:00:04.050Z' },
          { ...event, createdAt: '2026-10-01T10:00:04.000Z' },
          { ...event, createdAt: '2026-10-01T10:00:02.201Z' },
          { ...event, createdAt: '2026-10-01T10:00:02.100Z' },
          { ...event, createdAt: '2026-10-01T10:00:02.000Z' },
        ]}
      />,
    )
    expect(screen.getAllByText('Nesten samtidige registreringer')).toHaveLength(4)
    const groups = screen.getByRole('dialog').querySelectorAll('[data-detail-group]')
    expect(groups[0].getAttribute('data-detail-group')).toBe(groups[1].getAttribute('data-detail-group'))
    expect(groups[2].getAttribute('data-detail-group')).toBe(groups[3].getAttribute('data-detail-group'))
    expect(groups[0].getAttribute('data-detail-group')).not.toBe(groups[2].getAttribute('data-detail-group'))
  })

  it('marks repeated clicks including paired tracking with different component metadata', () => {
    const events = [0, 500, 1000].flatMap((offset) =>
      [0, 4].map((duplicateOffset) => ({
        ...activity[1],
        createdAt: new Date(Date.parse(activity[1].createdAt) + offset + duplicateOffset).toISOString(),
        properties: [
          { key: 'lenketekst', value: 'Chat med oss' },
          { key: 'destinasjon', value: '#' },
          ...(duplicateOffset ? [{ key: 'komponentId', value: 'Lenkepanel navno' }] : []),
        ],
      })),
    )
    render(<UserActivityModal open onClose={() => {}} loading={false} activity={events.reverse()} />)
    expect(screen.getAllByText('Gjentatte klikk')).toHaveLength(4)
    const headings = screen.getAllByRole('heading', { name: 'navigere' })
    for (const heading of headings.slice(-2)) {
      expect(heading.closest('.ml-8')).not.toHaveTextContent('Gjentatte klikk')
    }
    expect(screen.getAllByText('Gjentatte klikk')[0]).toHaveAttribute(
      'title',
      expect.stringContaining('ikke hvorfor brukeren klikket flere ganger'),
    )
    expect(screen.queryByText('Inngår i funnet')).not.toBeInTheDocument()
  })

  it.each([
    { offsets: [0, 4, 8, 12], count: 0 },
    { offsets: [0, 500], count: 0 },
    { offsets: [0, 2500, 5000], count: 2 },
    { offsets: [0, 500, 1000, 1500], count: 3 },
    { offsets: [0, 500, 1000, 10000, 10500, 11000], count: 4 },
    { offsets: [0, 2500, 5001], count: 0 },
    { offsets: [0, 4000, 8000, 12000], count: 0 },
  ])('requires three distinct clicks within five seconds: $offsets', ({ offsets, count }) => {
    render(
      <UserActivityModal
        open
        onClose={() => {}}
        loading={false}
        activity={offsets.map((offset) => ({
          ...activity[1],
          createdAt: new Date(Date.parse(activity[1].createdAt) + offset).toISOString(),
          properties: [{ key: 'lenketekst', value: 'Chat med oss' }],
        }))}
      />,
    )
    expect(screen.queryAllByText('Gjentatte klikk')).toHaveLength(count)
    const headings = screen.getAllByRole('heading', { name: 'navigere' })
    expect(headings[0].closest('.ml-8')).not.toHaveTextContent('Gjentatte klikk')
    if (offsets.includes(10000)) {
      expect(headings[offsets.indexOf(10000)].closest('.ml-8')).not.toHaveTextContent('Gjentatte klikk')
    }
  })

  it.each([
    'pageviews',
    'unknown event',
    'missing target',
    'incomplete details',
    'different targets',
    'different pages',
  ])('does not infer rage clicks from %s', (scenario) => {
    render(
      <UserActivityModal
        open
        onClose={() => {}}
        loading={false}
        activity={[0, 500, 1000].map((offset) => ({
          ...activity[1],
          type: scenario === 'pageviews' ? 'pageview' : 'event',
          name: scenario === 'unknown event' ? 'automatisk oppdatering' : 'navigere',
          url: scenario === 'different pages' ? `/side-${offset}` : '/',
          createdAt: new Date(Date.parse(activity[1].createdAt) + offset).toISOString(),
          properties:
            scenario === 'missing target'
              ? []
              : [{ key: 'lenketekst', value: scenario === 'different targets' ? `Knapp ${offset}` : 'Chat med oss' }],
          propertyCount: scenario === 'incomplete details' ? 51 : 1,
        }))}
      />,
    )
    expect(screen.queryByText('Gjentatte klikk')).not.toBeInTheDocument()
  })

  it('compares marked properties regardless of order and exposes changed, added and missing values', () => {
    render(
      <UserActivityModal
        open
        onClose={() => {}}
        loading={false}
        highlightedEventIds={new Set(['first', 'same', 'different'])}
        activity={[
          { ...activity[1], id: 'context', properties: [{ key: 'knapp', value: 'Ignorer' }] },
          {
            ...activity[1],
            id: 'first',
            properties: [
              { key: 'knapp', value: 'Neste' },
              { key: 'steg', value: '1' },
            ],
          },
          {
            ...activity[1],
            id: 'same',
            properties: [
              { key: 'steg', value: '1' },
              { key: 'knapp', value: 'Neste' },
            ],
          },
          {
            ...activity[1],
            id: 'different',
            properties: [
              { key: 'knapp', value: 'Tilbake' },
              { key: 'ny', value: 'ja' },
            ],
          },
        ]}
      />,
    )
    const matchingGroups = screen.getAllByText('Gruppe 1 · 2 med samme detaljer')
    expect(matchingGroups).toHaveLength(2)
    matchingGroups.forEach((badge) => expect(badge).toHaveAttribute('data-color', 'accent'))
    expect(screen.getByText('Gruppe 2 · egne detaljer')).toHaveAttribute('data-color', 'success')
    expect(screen.queryByText('Første')).not.toBeInTheDocument()
    expect(screen.queryByText('Like detaljer')).not.toBeInTheDocument()
    expect(screen.getByText('3 forskjeller')).toHaveAttribute('data-color', 'warning')
    expect(screen.queryByText('Hendelsesdetaljene nedenfor sammenlignes med denne.')).not.toBeInTheDocument()
    expect(screen.queryByText('Samme viste hendelsesdetaljer som første markerte')).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Første markerte' })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: 'Denne' })).toBeVisible()
    const comparison = within(screen.getByRole('table', { name: 'Forskjeller i hendelsesdetaljer' }))
    expect(comparison.getByRole('cell', { name: 'Tilbake' })).toBeVisible()
    expect(screen.getAllByRole('cell', { name: 'Ikke oppgitt' })).toHaveLength(2)
  })

  it.each([
    {
      propertyCount: 1,
      label: 'Alle 2 har samme detaljer',
      title: 'Alle markerte hendelser i denne loggen har identiske hendelsesdetaljer.',
    },
    {
      propertyCount: 51,
      label: 'Alle 2 har samme viste detaljer',
      title: 'Bare viste hendelsesdetaljer er sammenlignet. Noen detaljer er utelatt.',
    },
  ])('describes matching details without an unnecessary group number: $label', ({ propertyCount, label, title }) => {
    render(
      <UserActivityModal
        open
        onClose={() => {}}
        loading={false}
        highlightedEventIds={new Set(['first', 'second'])}
        activity={[
          { ...activity[1], id: 'first', properties: [{ key: 'knapp', value: 'Neste' }], propertyCount },
          { ...activity[1], id: 'second', properties: [{ key: 'knapp', value: 'Neste' }], propertyCount: 1 },
        ]}
      />,
    )
    expect(screen.getAllByText(label)).toHaveLength(2)
    expect(screen.getAllByText(label)[0]).toHaveAttribute('title', title)
    expect(screen.queryByText(/Gruppe 1|Detaljer 1/)).not.toBeInTheDocument()
  })

  it('shows loading and errors explicitly and offers a retry', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const { rerender } = render(<UserActivityModal open onClose={() => {}} activity={[]} loading />)
    expect(screen.getByTitle('Henter aktivitetslogg')).toBeInTheDocument()
    rerender(
      <UserActivityModal
        open
        onClose={() => {}}
        activity={[]}
        loading={false}
        error="Kunne ikke hente aktivitet"
        onRetry={onRetry}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Kunne ikke hente aktivitet')
    await user.click(screen.getByRole('button', { name: 'Prøv igjen' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
