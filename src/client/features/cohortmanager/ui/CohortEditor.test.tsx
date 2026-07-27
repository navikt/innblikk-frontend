import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { StrictMode } from 'react'
import { CohortEditor } from './CohortEditor.tsx'
import { replaceCriteria } from '../api/cohortManagerApi.ts'
import type { CohortDetailDto, CohortNode } from '../model/types.ts'

vi.mock('../api/cohortManagerApi.ts', () => ({
  replaceCriteria: vi.fn().mockResolvedValue({ nodeType: 'GROUP', combinator: 'AND', negated: false, children: [] }),
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

    // Fill in the two condition values.
    const verdiInputs = screen.getAllByLabelText('Verdi')
    expect(verdiInputs.length).toBe(2)
    await user.type(verdiInputs[0], '/')
    await user.type(verdiInputs[1], 'Chrome')

    // Save.
    await user.click(screen.getByRole('button', { name: 'Lagre kriterier' }))

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

    const verdiInputs = screen.getAllByLabelText('Verdi')
    expect(verdiInputs.map((i) => (i as HTMLInputElement).value)).toEqual(['/', 'Chrome'])
  })
})
