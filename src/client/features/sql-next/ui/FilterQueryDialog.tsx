import { useState } from 'react'
import { Alert, Button, Checkbox, CheckboxGroup, CopyButton, Modal, Select } from '@navikt/ds-react'
import { getFilterEdit, getFilterTargets, hasSqlFilters, periodNeedsWebsite } from '../model/sqlFilters'

interface FilterQueryDialogProps {
  projectId: string
  query: string
  onApply: (query: string) => void
  onClose: () => void
}

export default function FilterQueryDialog({ projectId, query, onApply, onClose }: FilterQueryDialogProps) {
  const existing = hasSqlFilters(query)
  const targets = getFilterTargets(query)
  const [selected, setSelected] = useState<string[]>(() => [
    ...(existing.website ? [] : ['website']),
    ...(existing.period ? [] : ['period']),
  ])
  const [reference, setReference] = useState(targets[0]?.reference ?? '')
  const websiteLocked = selected.includes('period') && periodNeedsWebsite(query)
  const checked = websiteLocked && !selected.includes('website') ? [...selected, 'website'] : selected
  const needsTable = targets.length > 1 && checked.includes('website')
  const edit = getFilterEdit(query, projectId, {
    website: checked.includes('website'),
    period: checked.includes('period'),
    reference: needsTable ? reference : null,
  })
  const nothingToAdd = existing.website && existing.period

  return (
    <Modal open onClose={onClose} header={{ heading: 'Legg til filtre' }} width="medium">
      <Modal.Body>
        <div className="flex min-w-0 flex-col gap-4">
          <CheckboxGroup legend="Legg til" size="small" value={checked} onChange={setSelected}>
            <Checkbox
              value="website"
              disabled={websiteLocked || existing.website}
              description={websiteLocked ? 'Følger med perioden' : existing.website ? 'Finnes allerede' : undefined}
            >
              Nettside
            </Checkbox>
            <Checkbox
              value="period"
              disabled={existing.period}
              description={existing.period ? 'Finnes allerede' : undefined}
            >
              Periode
            </Checkbox>
          </CheckboxGroup>
          {needsTable && (
            <Select
              label="Nettside gjelder for tabell"
              size="small"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            >
              {targets.map((target) => (
                <option key={target.reference} value={target.reference}>
                  {target.label}
                </option>
              ))}
            </Select>
          )}
          {nothingToAdd ? (
            <Alert variant="info" size="small">
              Spørringen har allerede både nettside og periode.
            </Alert>
          ) : (
            edit.snippet && (
              <div className="flex min-w-0 flex-col gap-2">
                <CopyButton
                  copyText={edit.snippet}
                  text="Kopier SQL"
                  activeText="SQL kopiert"
                  size="small"
                  className="self-start"
                />
                <pre
                  aria-label="SQL som settes inn"
                  className="m-0 max-h-80 overflow-auto rounded border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] p-3 text-xs whitespace-pre-wrap break-words"
                >
                  {edit.snippet}
                </pre>
                {!edit.sql && (
                  <Alert variant="info" size="small">
                    Denne spørringen er for sammensatt til å settes inn automatisk. Kopier koden og legg den i riktig
                    WHERE.
                  </Alert>
                )}
              </div>
            )
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button
          disabled={!edit.sql}
          onClick={() => {
            if (!edit.sql) return
            onApply(edit.sql)
            onClose()
          }}
        >
          Sett inn
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Avbryt
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
