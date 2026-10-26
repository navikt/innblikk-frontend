import { useEffect, useState } from 'react'
import {
  Alert,
  BodyShort,
  Button,
  Checkbox,
  CheckboxGroup,
  Heading,
  Link,
  Loader,
  Modal,
  Tabs,
  TextField,
} from '@navikt/ds-react'
import { ExternalLinkIcon } from '@navikt/aksel-icons'
import { listSidegroups } from '../../sidegroups/api/sidegroupsApi'
import { getCohort, listCohorts } from '../../cohortmanager/api/cohortManagerApi'
import type { CohortDetailDto, CohortDto } from '../../cohortmanager/model/types'
import type { Sidegroup } from '../../sidegroups/model/types'
import { previewReferenceIds } from '../../cohortmanager-next/utils/previewQuery'
import { addGroupsWithFilters, type SqlGroup } from '../model/sqlGroups'
import { WebsiteSelect } from '../../../shared/ui/WebsiteSelect.tsx'
import type { Website } from '../model/types'

interface GroupQueryDialogProps {
  projectId: string
  query: string
  websiteIds: readonly string[]
  websites: Website[]
  onWebsiteIdsChange: (ids: string[]) => void
  onApply: (query: string) => void
  onClose: () => void
}

export default function GroupQueryDialog({
  projectId,
  query,
  websiteIds,
  websites,
  onWebsiteIdsChange,
  onApply,
  onClose,
}: GroupQueryDialogProps) {
  const [sidegroups, setSidegroups] = useState<Sidegroup[]>([])
  const [cohorts, setCohorts] = useState<CohortDto[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('cohorts')
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const websiteKey = websiteIds.join(',')

  useEffect(() => {
    let active = true
    const ids = websiteKey.split(',').filter(Boolean)
    if (!ids.length) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setSelected([])
    void Promise.all([listSidegroups(), Promise.all(ids.map(listCohorts))])
      .then(([pages, people]) => {
        if (!active) return
        setSidegroups(pages.filter((group) => ids.includes(group.websiteId)))
        setCohorts(people.flat().filter((group) => ids.includes(group.websiteId)))
      })
      .catch(() => {
        if (active) setError('Kunne ikke hente gruppene. Prøv igjen.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [websiteKey, retry])

  const apply = async () => {
    setApplying(true)
    setError(null)
    try {
      const lookup = new Map<string, CohortDetailDto>()
      const load = async (id: number): Promise<void> => {
        if (lookup.has(String(id))) return
        const group = await getCohort(id)
        lookup.set(String(id), group)
        if (group.root) {
          for (const reference of previewReferenceIds(group.root)) await load(Number(reference))
        }
      }
      const groups: SqlGroup[] = []
      for (const group of sidegroups) {
        if (selected.includes(`sidegroup:${group.id}`)) groups.push({ kind: 'sidegroup', group })
      }
      for (const group of cohorts) {
        if (!selected.includes(`cohort:${group.id}`)) continue
        await load(group.id)
        const detail = lookup.get(String(group.id))!
        if (detail.websiteId !== group.websiteId)
          throw new Error('Brukergruppen har byttet nettside. Åpne gruppevelgeren på nytt.')
        groups.push({ kind: 'cohort', group: detail })
      }
      onApply(await addGroupsWithFilters(query, projectId, groups, lookup))
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Kunne ikke legge til gruppene. Prøv igjen.')
    } finally {
      setApplying(false)
    }
  }
  const matches = (group: { name: string }) =>
    group.name.toLocaleLowerCase('nb').includes(search.toLocaleLowerCase('nb'))
  const isCohortTab = activeTab === 'cohorts'
  const activeGroups = isCohortTab ? cohorts : sidegroups
  const groupType = isCohortTab ? 'brukergruppe' : 'sidegruppe'
  const createHref = `/${isCohortTab ? 'brukergrupper' : 'sidegrupper'}?${new URLSearchParams({ websiteId: websiteIds[0] ?? '' })}`

  return (
    <Modal open onClose={onClose} header={{ heading: 'Legg til grupper' }} width="medium">
      <Modal.Body>
        <div className="flex min-w-0 flex-col gap-4">
          <WebsiteSelect
            websites={websites}
            selectedId={websiteIds[0] ?? null}
            onSelect={(id) => onWebsiteIdsChange(id ? [id] : [])}
            selectedIds={[...websiteIds]}
            onSelectMultiple={onWebsiteIdsChange}
            label="Nettsider eller apper"
            fullWidth
            size="small"
          />
          {!websiteIds.length ? null : loading ? (
            <Loader title="Henter grupper" />
          ) : (
            <>
              {error && (
                <Alert variant="error" size="small">
                  {error}
                </Alert>
              )}
              {error && !sidegroups.length && !cohorts.length ? (
                <Button variant="secondary" size="small" onClick={() => setRetry(retry + 1)}>
                  Prøv igjen
                </Button>
              ) : (
                <>
                  {activeGroups.length > 0 && (
                    <TextField
                      label="Søk etter gruppe"
                      size="small"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  )}
                  <Tabs
                    value={activeTab}
                    onChange={(value) => {
                      setActiveTab(value)
                      setSearch('')
                    }}
                    size="small"
                  >
                    <Tabs.List>
                      <Tabs.Tab value="cohorts" label="Brukergrupper" />
                      <Tabs.Tab value="sidegroups" label="Sidegrupper" />
                    </Tabs.List>
                    <Tabs.Panel value={activeTab} className="max-h-[min(40vh,24rem)] overflow-y-auto px-1 py-4">
                      {!activeGroups.length ? (
                        <div className="flex flex-col items-start gap-3 py-2">
                          <Heading level="3" size="small">
                            Ingen {isCohortTab ? 'brukergrupper' : 'sidegrupper'} ennå
                          </Heading>
                          <Link href={createHref} target="_blank" rel="noopener noreferrer">
                            Opprett din første {groupType}
                            <ExternalLinkIcon aria-label="Åpnes i ny fane" />
                          </Link>
                        </div>
                      ) : isCohortTab ? (
                        <CheckboxGroup
                          legend="Brukergrupper"
                          hideLegend
                          size="small"
                          value={selected}
                          onChange={setSelected}
                        >
                          {cohorts.filter(matches).map((group) => (
                            <Checkbox key={group.id} value={`cohort:${group.id}`} description={group.description}>
                              {group.name}
                            </Checkbox>
                          ))}
                          {!cohorts.some(matches) && (
                            <BodyShort>
                              {search
                                ? 'Ingen brukergrupper funnet.'
                                : 'Ingen lagrede brukergrupper for de valgte nettsidene.'}
                            </BodyShort>
                          )}
                        </CheckboxGroup>
                      ) : (
                        <CheckboxGroup
                          legend="Sidegrupper"
                          hideLegend
                          size="small"
                          value={selected}
                          onChange={setSelected}
                        >
                          {sidegroups.filter(matches).map((group) => (
                            <Checkbox key={group.id} value={`sidegroup:${group.id}`} description={group.description}>
                              {group.name}
                            </Checkbox>
                          ))}
                          {!sidegroups.some(matches) && (
                            <BodyShort>
                              {search
                                ? 'Ingen sidegrupper funnet.'
                                : 'Ingen lagrede sidegrupper for de valgte nettsidene.'}
                            </BodyShort>
                          )}
                        </CheckboxGroup>
                      )}
                    </Tabs.Panel>
                  </Tabs>
                  {selected.length > 0 && (
                    <BodyShort size="small">
                      {selected.length === 1 ? '1 gruppe valgt' : `${selected.length} grupper valgt`}
                    </BodyShort>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button disabled={loading || !selected.length} loading={applying} onClick={() => void apply()}>
          Legg til i SQL
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Avbryt
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
