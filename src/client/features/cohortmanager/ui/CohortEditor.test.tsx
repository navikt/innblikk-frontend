import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { StrictMode } from 'react'
import { CohortEditor } from './CohortEditor.tsx'
import { replaceCriteria } from '../api/cohortManagerApi.ts'
import type { CohortDetailDto, CohortNode } from '../model/types.ts'

vi.mock('../api/cohortManagerApi.ts', () => ({
  replaceCriteria: vi.fn().mockResolvedValue({ nodeType: 'GROUP', combinator: 'AND', negated: false, children: [] }),
  updateCohort: vi.fn().mockResolvedValue({}),
  createCohort: vi.fn().mockResolvedValue({ id: 2, websiteId: 'site-1', name: 'New', root: null }),
}))

// Suggestion fetches are irrelevant to these tests — keep the comboboxes offline.
vi.mock('../api/columnValuesApi.ts', () => ({
  fetchColumnValues: vi.fn().mockResolvedValue({ values: [], scannedDays: 30 }),
}))

const mockReplaceCriteria = vi.mocked(replaceCriteria)

const emptyCohort: CohortDetailDto = {
  id: 1,
  websiteId: 'site-1',
  name: 'Test cohort',
  root: null,
}

function renderEditor(cohort: CohortDetailDto = emptyCohort) {
  const onClose = vi.fn()
  const onChanged = vi.fn()
  render(
    <StrictMode>
      <CohortEditor cohort={cohort} allCohorts={[cohort]} onClose={onClose} onChanged={onChanged} />
    </StrictMode>,
  )
  return { onClose, onChanged }
}

/**
 * The RQB field <select> for the top-level rule row. Located via the Aksel
 * field-selector wrapper (the «Felt» label is hidden with hideLabel, so it's
 * not an accessible label for getByLabelText).
 */
const topLevelFieldSelect = () =>
  within(document.querySelector('.cohort-qb-field') as HTMLElement).getByRole('combobox')

describe('CohortEditor — building and saving a SEQUENCE node end-to-end', () => {
  it('includes the anchor/target conditions typed into the sequence editor in the saved payload (regression: query.rules ended up empty)', async () => {
    const user = userEvent.setup()
    renderEditor()

    // Add the first (and only, for an empty root group) rule.
    await user.click(screen.getByRole('button', { name: '+ Filter' }))

    // Change its field to __sequence__.
    const fieldSelects = screen.getAllByDisplayValue(/URL-sti|url_path/i)
    // Fall back to querying by role if display value match is brittle across RQB versions.
    const ruleFieldSelect = fieldSelects[0] ?? screen.getAllByRole('combobox')[0]
    await user.selectOptions(ruleFieldSelect, 'Sekvens (gjorde X, så (ikke) Y)')

    // The SequenceEditor should now be rendered with two "+ Filter" buttons
    // (one for anchor, one for target) beyond any top-level ones.
    const addFilterButtons = screen.getAllByRole('button', { name: '+ Filter' })
    expect(addFilterButtons.length).toBeGreaterThanOrEqual(2)

    // Add one condition to the anchor step.
    await user.click(addFilterButtons[addFilterButtons.length - 2])
    // Add one condition to the target step.
    const addFilterButtonsAfterAnchor = screen.getAllByRole('button', { name: '+ Filter' })
    await user.click(addFilterButtonsAfterAnchor[addFilterButtonsAfterAnchor.length - 1])

    // Find the two condition rows' field selects (excluding the outer builder's).
    // Each StepConditionsEditor row renders a "Felt" (hidden label) select.
    const feltSelects = screen.getAllByLabelText('Felt')
    expect(feltSelects.length).toBe(2)
    await user.selectOptions(feltSelects[0], 'URL-sti')
    await user.selectOptions(feltSelects[1], 'Nettleser')

    // Fill in the two condition values (comboboxes now — typed text commits on blur).
    const verdiInputs = screen.getAllByLabelText('Verdi')
    expect(verdiInputs.length).toBe(2)
    await user.click(verdiInputs[0])
    await user.keyboard('/')
    await user.tab()
    await waitFor(() => expect(screen.getByText('/')).toBeInTheDocument())
    await user.click(screen.getAllByLabelText('Verdi')[1])
    await user.keyboard('Chrome')
    await user.tab()
    await waitFor(() => expect(screen.getByText('Chrome')).toBeInTheDocument())

    // Save.
    await user.click(screen.getByRole('button', { name: 'Lagre' }))

    expect(mockReplaceCriteria).toHaveBeenCalledTimes(1)
    const [, savedRoot] = mockReplaceCriteria.mock.calls[0]
    const savedRootTyped = savedRoot as Extract<CohortNode, { nodeType: 'GROUP' }>
    const sequenceNode = savedRootTyped.children[0] as Extract<CohortNode, { nodeType: 'SEQUENCE' }>

    expect(sequenceNode.nodeType).toBe('SEQUENCE')
    expect(sequenceNode.anchor.children).toHaveLength(1)
    expect(sequenceNode.anchor.children[0]).toMatchObject({ nodeType: 'CONDITION', field: 'url_path', value: '/' })
    expect(sequenceNode.target.children).toHaveLength(1)
    expect(sequenceNode.target.children[0]).toMatchObject({ nodeType: 'CONDITION', field: 'browser', value: 'Chrome' })
  })
})

describe('CohortEditor — loading an EXISTING cohort that already has a SEQUENCE node', () => {
  it('populates the sequence editor with the saved anchor/target conditions on render (regression: showed blank fields)', () => {
    const cohortWithSequence: CohortDetailDto = {
      ...emptyCohort,
      root: {
        nodeType: 'GROUP',
        combinator: 'AND',
        negated: false,
        children: [
          {
            nodeType: 'SEQUENCE',
            anchor: {
              nodeType: 'GROUP',
              combinator: 'AND',
              negated: false,
              children: [{ nodeType: 'CONDITION', field: 'url_path', conditionType: 'EQUALS', value: '/' }],
            },
            target: {
              nodeType: 'GROUP',
              combinator: 'AND',
              negated: false,
              children: [{ nodeType: 'CONDITION', field: 'browser', conditionType: 'EQUALS', value: 'Chrome' }],
            },
            relation: 'FOLLOWED_BY',
            windowValue: 1,
            windowUnit: 'DAY',
          },
        ],
      },
    }

    renderEditor(cohortWithSequence)

    // Selected values render as combobox chips (single-select: the chip label IS
    // the value), not as text in the search input — the input itself stays empty.
    expect(screen.getByText('/')).toBeInTheDocument()
    expect(screen.getByText('Chrome')).toBeInTheDocument()
  })
})

describe('CohortEditor — «Detalj om hendelsen» (event-detail condition)', () => {
  it('saves a detail condition as a paramKey node, with the exists-toggle mapping to EXISTS', async () => {
    const user = userEvent.setup()
    renderEditor()

    await user.click(screen.getByRole('button', { name: '+ Filter' }))
    await user.selectOptions(topLevelFieldSelect(), '__detail__')

    // «Verdi» is disabled until a detail key is chosen.
    const detaljInput = screen.getByLabelText('Detalj')
    expect(screen.getByLabelText('Verdi')).toBeDisabled()

    await user.click(detaljInput)
    await user.keyboard('skjemaId')
    await user.tab()
    await waitFor(() => expect(screen.getByLabelText('Verdi')).toBeEnabled())

    await user.click(screen.getByLabelText('Verdi'))
    await user.keyboard('1234')
    await user.tab()

    await user.click(screen.getByRole('button', { name: 'Lagre' }))

    const [, savedRoot] = mockReplaceCriteria.mock.calls[mockReplaceCriteria.mock.calls.length - 1]
    const saved = savedRoot as Extract<CohortNode, { nodeType: 'GROUP' }>
    expect(saved.children[0]).toMatchObject({
      nodeType: 'CONDITION',
      paramKey: 'skjemaId',
      conditionType: 'EQUALS',
      value: '1234',
    })
  })

  it('«Sjekk bare at detaljen finnes» saves conditionType EXISTS with empty value', async () => {
    const user = userEvent.setup()
    renderEditor()

    await user.click(screen.getByRole('button', { name: '+ Filter' }))
    await user.selectOptions(topLevelFieldSelect(), '__detail__')

    await user.click(screen.getByLabelText('Detalj'))
    await user.keyboard('skjemaId')
    await user.tab()
    await waitFor(() => expect(screen.getByLabelText('Verdi')).toBeEnabled())
    await user.click(screen.getByLabelText('Sjekk bare at detaljen finnes'))

    // «Verdi» becomes disabled again in exists-mode.
    expect(screen.getByLabelText('Verdi')).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Lagre' }))

    const [, savedRoot] = mockReplaceCriteria.mock.calls[mockReplaceCriteria.mock.calls.length - 1]
    const saved = savedRoot as Extract<CohortNode, { nodeType: 'GROUP' }>
    expect(saved.children[0]).toMatchObject({
      nodeType: 'CONDITION',
      paramKey: 'skjemaId',
      conditionType: 'EXISTS',
      value: '',
    })
  })
})
