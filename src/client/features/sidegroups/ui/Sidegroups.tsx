import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Alert,
  BodyShort,
  Button,
  Dialog,
  HStack,
  Heading,
  HelpText,
  Loader,
  Select,
  Table,
  TextField,
  UNSAFE_Combobox,
  VStack,
} from '@navikt/ds-react'
import { ChevronDownIcon, ChevronUpIcon, PencilIcon, PlusIcon, TrashIcon } from '@navikt/aksel-icons'
import { fetchWebsites } from '../../../shared/api/websiteApi.ts'
import type { Website } from '../../../shared/types/website.ts'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { createSidegroup, deleteSidegroup, listSidegroups, updateSidegroup } from '../api/sidegroupsApi.ts'
import {
  sidegroupMatchFields,
  type Sidegroup,
  type SidegroupMatchField,
  type SidegroupRequest,
} from '../model/types.ts'

type SidegroupForm = {
  name: string
  description: string
  websiteId: string
}

type MatchCondition = {
  id: number
  field: SidegroupMatchField
  pattern: string
}

const emptyForm: SidegroupForm = {
  name: '',
  description: '',
  websiteId: '',
}

const toForm = (sidegroup: Sidegroup): SidegroupForm => ({
  name: sidegroup.name,
  description: sidegroup.description ?? '',
  websiteId: sidegroup.websiteId,
})

const toRequest = (form: SidegroupForm, conditions: MatchCondition[]): SidegroupRequest => {
  const patternsFor = (field: SidegroupMatchField) =>
    conditions.filter((condition) => condition.field === field).map((condition) => condition.pattern.trim())

  return {
    name: form.name.trim(),
    description: form.description.trim(),
    websiteId: form.websiteId,
    include: patternsFor('include'),
    exclude: patternsFor('exclude'),
    exact: patternsFor('exact'),
    startWith: patternsFor('startWith'),
    endWith: patternsFor('endWith'),
  }
}

export default function Sidegroups() {
  const [searchParams] = useSearchParams()
  const requestedWebsiteId = searchParams.get('websiteId')
  const [sidegroups, setSidegroups] = useState<Sidegroup[]>([])
  const [expandedSidegroups, setExpandedSidegroups] = useState<Set<string>>(() => new Set())
  const [websites, setWebsites] = useState<Website[]>([])
  const [websitesLoading, setWebsitesLoading] = useState(true)
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string | null>(null)
  const [websiteFilter, setWebsiteFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [editorTarget, setEditorTarget] = useState<Sidegroup | null | undefined>(undefined)
  const [form, setForm] = useState<SidegroupForm>(emptyForm)
  const [conditions, setConditions] = useState<MatchCondition[]>([])
  const [newConditionField, setNewConditionField] = useState<SidegroupMatchField>('include')
  const [newConditionPattern, setNewConditionPattern] = useState('')
  const [showPendingPatternDecision, setShowPendingPatternDecision] = useState(false)
  const [editingConditionId, setEditingConditionId] = useState<number | null>(null)
  const [editingConditionField, setEditingConditionField] = useState<SidegroupMatchField>('include')
  const [editingConditionPattern, setEditingConditionPattern] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Sidegroup | null>(null)
  const [deleting, setDeleting] = useState(false)
  const nextConditionId = useRef(0)

  const loadSidegroups = async () => {
    setLoading(true)
    setError(null)
    try {
      setSidegroups(await listSidegroups())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke laste sidegrupper')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSidegroups()
    fetchWebsites()
      .then((data) => {
        setWebsites(data)
        setSelectedWebsiteId(data.find((website) => website.id === requestedWebsiteId)?.id ?? data[0]?.id ?? null)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Kunne ikke laste nettsteder'))
      .finally(() => setWebsitesLoading(false))
  }, [requestedWebsiteId])

  const openEditor = (sidegroup?: Sidegroup) => {
    setEditorTarget(sidegroup ?? null)
    setForm(sidegroup ? toForm(sidegroup) : { ...emptyForm, websiteId: selectedWebsiteId ?? websites[0]?.id ?? '' })
    nextConditionId.current = 0
    setConditions(
      sidegroup
        ? sidegroupMatchFields.flatMap((field) =>
            (sidegroup[field.key] ?? []).map((pattern) => ({
              id: nextConditionId.current++,
              field: field.key,
              pattern,
            })),
          )
        : [],
    )
    setNewConditionField('include')
    setNewConditionPattern('')
    setShowPendingPatternDecision(false)
    setEditingConditionId(null)
    setFormError(null)
  }

  const closeEditor = () => {
    if (!saving) setEditorTarget(undefined)
  }

  const addCondition = () => {
    const pattern = newConditionPattern.trim()
    if (!pattern) return
    const id = nextConditionId.current++
    setConditions((current) => [...current, { id, field: newConditionField, pattern }])
    setNewConditionPattern('')
    setShowPendingPatternDecision(false)
  }

  const startEditingCondition = (condition: MatchCondition) => {
    setEditingConditionId(condition.id)
    setEditingConditionField(condition.field)
    setEditingConditionPattern(condition.pattern)
  }

  const saveConditionEdit = () => {
    const pattern = editingConditionPattern.trim()
    if (editingConditionId === null || !pattern) return
    setConditions((current) =>
      current.map((condition) =>
        condition.id === editingConditionId ? { ...condition, field: editingConditionField, pattern } : condition,
      ),
    )
    setEditingConditionId(null)
  }

  const removeCondition = (id: number) => {
    setConditions((current) => current.filter((condition) => condition.id !== id))
    if (editingConditionId === id) setEditingConditionId(null)
  }

  const saveSidegroup = async (nextConditions: MatchCondition[]) => {
    setSaving(true)
    setFormError(null)
    try {
      const request = toRequest(form, nextConditions)
      if (editorTarget) await updateSidegroup(editorTarget.id, request)
      else await createSidegroup(request)
      setSelectedWebsiteId(form.websiteId)
      setWebsiteFilter('')
      setEditorTarget(undefined)
      await loadSidegroups()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Kunne ikke lagre sidegruppen')
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (newConditionPattern.trim()) {
      setShowPendingPatternDecision(true)
      return
    }
    await saveSidegroup(conditions)
  }

  const saveWithoutAddingPending = () => {
    setNewConditionPattern('')
    setShowPendingPatternDecision(false)
    void saveSidegroup(conditions)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setError(null)
    try {
      await deleteSidegroup(deleteTarget.id)
      setDeleteTarget(null)
      await loadSidegroups()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke slette sidegruppen')
    } finally {
      setDeleting(false)
    }
  }

  const websiteOptions = websites.map((website) => ({
    label: `${website.name} — ${website.domain}`,
    value: website.id,
  }))
  const filteredWebsiteOptions = websiteFilter.trim()
    ? websiteOptions.filter((option) => option.label.toLowerCase().includes(websiteFilter.trim().toLowerCase()))
    : websiteOptions
  const selectedWebsite = websites.find((website) => website.id === selectedWebsiteId)
  const selectedWebsiteLabel = selectedWebsite ? `${selectedWebsite.name} — ${selectedWebsite.domain}` : ''
  const visibleSidegroups = selectedWebsiteId
    ? sidegroups.filter((sidegroup) => sidegroup.websiteId === selectedWebsiteId)
    : []

  const handleWebsiteKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Backspace' || !selectedWebsiteId) return
    const inputValue = (event.target as HTMLInputElement).value
    if (inputValue === selectedWebsiteLabel || inputValue === websiteFilter) {
      setSelectedWebsiteId(null)
      setWebsiteFilter('')
    }
  }

  return (
    <>
      <PageHeader title="Sidegrupper" description="Administrer alle grupper på nettstedet ditt" beta />
      <AppBlock className="pb-16">
        <VStack gap="space-16">
          <div
            className="relative focus-within:z-10"
            style={{ maxWidth: 400 }}
            onKeyDownCapture={handleWebsiteKeyDownCapture}
          >
            {websitesLoading ? (
              <Loader size="small" title="Laster nettsteder…" />
            ) : (
              <UNSAFE_Combobox
                label="Nettsted"
                options={websiteOptions}
                filteredOptions={filteredWebsiteOptions}
                selectedOptions={selectedWebsite ? [{ label: selectedWebsiteLabel, value: selectedWebsite.id }] : []}
                onToggleSelected={(value, isSelected) => {
                  setSelectedWebsiteId(isSelected ? value : null)
                  setWebsiteFilter('')
                }}
                value={websiteFilter}
                onChange={setWebsiteFilter}
                placeholder="Søk etter nettsted…"
                clearButton
                isMultiSelect={false}
                size="small"
              />
            )}
          </div>
          <HStack justify="space-between" align="center">
            <Heading size="small" level="2">
              Sidegrupper
            </Heading>
            <Button
              size="small"
              variant="secondary"
              icon={<PlusIcon aria-hidden />}
              onClick={() => openEditor()}
              disabled={!selectedWebsiteId}
            >
              Ny sidegruppe
            </Button>
          </HStack>
          {error && <Alert variant="error">{error}</Alert>}
          {loading || websitesLoading ? (
            <Loader size="medium" title="Laster sidegrupper…" />
          ) : !selectedWebsiteId ? (
            <Alert variant="info" inline>
              {websites.length === 0 ? 'Ingen nettsteder tilgjengelig.' : 'Velg et nettsted for å se sidegrupper.'}
            </Alert>
          ) : visibleSidegroups.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <Alert variant="info" inline>
                Ingen sidegrupper for dette nettstedet.
              </Alert>
              <Button size="small" variant="secondary" icon={<PlusIcon aria-hidden />} onClick={() => openEditor()}>
                Ny sidegruppe
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table size="small">
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell scope="col" />
                    <Table.HeaderCell>Navn</Table.HeaderCell>
                    <Table.HeaderCell>URL-vilkår</Table.HeaderCell>
                    <Table.HeaderCell />
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {visibleSidegroups.map((sidegroup) => {
                    const conditions = sidegroupMatchFields.flatMap((field) =>
                      (sidegroup[field.key] ?? []).map((pattern, index) => ({
                        key: `${field.key}-${index}-${pattern}`,
                        label: field.label,
                        pattern,
                      })),
                    )
                    const isExpanded = expandedSidegroups.has(sidegroup.id)
                    return (
                      <Table.ExpandableRow
                        key={sidegroup.id}
                        open={isExpanded}
                        onOpenChange={(open) =>
                          setExpandedSidegroups((current) => {
                            const next = new Set(current)
                            if (open) next.add(sidegroup.id)
                            else next.delete(sidegroup.id)
                            return next
                          })
                        }
                        expansionDisabled={conditions.length === 0}
                        content={
                          <div id={`sidegroup-conditions-${sidegroup.id}`}>
                            {conditions.length === 0 ? (
                              <BodyShort size="small">Ingen URL-vilkår.</BodyShort>
                            ) : (
                              <div style={{ maxWidth: '640px', overflowX: 'auto' }}>
                                <Table size="small">
                                  <Table.Header>
                                    <Table.Row>
                                      <Table.HeaderCell>Samsvar</Table.HeaderCell>
                                      <Table.HeaderCell>URL-mønster</Table.HeaderCell>
                                    </Table.Row>
                                  </Table.Header>
                                  <Table.Body>
                                    {conditions.map((condition) => (
                                      <Table.Row key={condition.key}>
                                        <Table.DataCell>{condition.label}</Table.DataCell>
                                        <Table.DataCell>{condition.pattern}</Table.DataCell>
                                      </Table.Row>
                                    ))}
                                  </Table.Body>
                                </Table>
                              </div>
                            )}
                          </div>
                        }
                      >
                        <Table.HeaderCell scope="row">{sidegroup.name}</Table.HeaderCell>
                        <Table.DataCell>
                          <div className="flex items-center gap-2">
                            <span>{conditions.length}</span>
                            {conditions.length > 0 && (
                              <Button
                                type="button"
                                size="xsmall"
                                variant="secondary"
                                icon={isExpanded ? <ChevronUpIcon aria-hidden /> : <ChevronDownIcon aria-hidden />}
                                aria-expanded={isExpanded}
                                aria-controls={`sidegroup-conditions-${sidegroup.id}`}
                                onClick={() => {
                                  setExpandedSidegroups((current) => {
                                    const next = new Set(current)
                                    if (isExpanded) next.delete(sidegroup.id)
                                    else next.add(sidegroup.id)
                                    return next
                                  })
                                }}
                              >
                                {isExpanded ? 'Skjul' : 'Vis'}
                              </Button>
                            )}
                          </div>
                        </Table.DataCell>
                        <Table.DataCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              size="xsmall"
                              variant="secondary"
                              icon={<PencilIcon aria-hidden />}
                              onClick={() => openEditor(sidegroup)}
                            >
                              Rediger
                            </Button>
                            <Button
                              size="xsmall"
                              variant="secondary"
                              data-color="danger"
                              icon={<TrashIcon aria-hidden />}
                              onClick={() => setDeleteTarget(sidegroup)}
                            >
                              Slett
                            </Button>
                          </div>
                        </Table.DataCell>
                      </Table.ExpandableRow>
                    )
                  })}
                </Table.Body>
              </Table>
            </div>
          )}
        </VStack>
      </AppBlock>

      <Dialog open={editorTarget !== undefined} onOpenChange={(open) => !open && closeEditor()}>
        <Dialog.Popup width="large">
          <Dialog.Header>
            <Dialog.Title>{editorTarget ? 'Rediger sidegruppe' : 'Ny sidegruppe'}</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <form id="sidegroup-form" onSubmit={(event) => void handleSave(event)}>
              <VStack gap="space-16">
                <TextField
                  label="Navn"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  required
                />
                <div className="flex items-center gap-2">
                  <Heading level="3" size="small">
                    URL-vilkår
                  </Heading>
                  <HelpText title="URL-mønster">For eksempel /artikler/.</HelpText>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(12rem,1fr)_minmax(0,2fr)_auto] md:items-end">
                  <Select
                    label="Samsvarsvilkår"
                    value={newConditionField}
                    onChange={(event) => setNewConditionField(event.target.value as SidegroupMatchField)}
                  >
                    {sidegroupMatchFields.map((field) => (
                      <option key={field.key} value={field.key}>
                        {field.label}
                      </option>
                    ))}
                  </Select>
                  <TextField
                    label="URL-mønster"
                    value={newConditionPattern}
                    onChange={(event) => setNewConditionPattern(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        addCondition()
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    icon={<PlusIcon aria-hidden />}
                    onClick={addCondition}
                    disabled={!newConditionPattern.trim()}
                  >
                    Legg til
                  </Button>
                </div>
                {showPendingPatternDecision && (
                  <Alert variant="warning">
                    <VStack gap="space-8">
                      <BodyShort>URL-mønsteret er ikke lagt til ennå.</BodyShort>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="small" variant="secondary" disabled={saving} onClick={addCondition}>
                          Legg til
                        </Button>
                        <Button type="button" size="small" disabled={saving} onClick={saveWithoutAddingPending}>
                          Lagre uten å legge til
                        </Button>
                      </div>
                    </VStack>
                  </Alert>
                )}
                {conditions.length > 0 && (
                  <div className="overflow-x-auto">
                    <Table size="small">
                      <Table.Header>
                        <Table.Row>
                          <Table.HeaderCell>Samsvar</Table.HeaderCell>
                          <Table.HeaderCell>URL-mønster</Table.HeaderCell>
                          <Table.HeaderCell />
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {conditions.map((condition) => {
                          const isEditing = editingConditionId === condition.id
                          return (
                            <Table.Row key={condition.id}>
                              <Table.DataCell>
                                {isEditing ? (
                                  <Select
                                    label="Samsvarsvilkår"
                                    hideLabel
                                    value={editingConditionField}
                                    onChange={(event) =>
                                      setEditingConditionField(event.target.value as SidegroupMatchField)
                                    }
                                  >
                                    {sidegroupMatchFields.map((field) => (
                                      <option key={field.key} value={field.key}>
                                        {field.label}
                                      </option>
                                    ))}
                                  </Select>
                                ) : (
                                  sidegroupMatchFields.find((field) => field.key === condition.field)?.label
                                )}
                              </Table.DataCell>
                              <Table.DataCell>
                                {isEditing ? (
                                  <TextField
                                    label="URL-mønster"
                                    hideLabel
                                    value={editingConditionPattern}
                                    onChange={(event) => setEditingConditionPattern(event.target.value)}
                                  />
                                ) : (
                                  condition.pattern
                                )}
                              </Table.DataCell>
                              <Table.DataCell>
                                <div className="flex justify-end gap-2">
                                  {isEditing ? (
                                    <>
                                      <Button
                                        type="button"
                                        size="xsmall"
                                        onClick={saveConditionEdit}
                                        disabled={!editingConditionPattern.trim()}
                                      >
                                        Lagre
                                      </Button>
                                      <Button
                                        type="button"
                                        size="xsmall"
                                        variant="secondary"
                                        onClick={() => setEditingConditionId(null)}
                                      >
                                        Avbryt
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button
                                        type="button"
                                        size="xsmall"
                                        variant="tertiary-neutral"
                                        icon={<PencilIcon aria-hidden />}
                                        aria-label="Rediger URL-vilkår"
                                        onClick={() => startEditingCondition(condition)}
                                      />
                                      <Button
                                        type="button"
                                        size="xsmall"
                                        variant="tertiary-neutral"
                                        data-color="danger"
                                        icon={<TrashIcon aria-hidden />}
                                        aria-label="Fjern URL-vilkår"
                                        onClick={() => removeCondition(condition.id)}
                                      />
                                    </>
                                  )}
                                </div>
                              </Table.DataCell>
                            </Table.Row>
                          )
                        })}
                      </Table.Body>
                    </Table>
                  </div>
                )}
                {formError && <Alert variant="error">{formError}</Alert>}
              </VStack>
            </form>
          </Dialog.Body>
          <Dialog.Footer>
            <Button type="submit" form="sidegroup-form" loading={saving}>
              Lagre
            </Button>
            <Dialog.CloseTrigger>
              <Button type="button" variant="secondary" disabled={saving}>
                Avbryt
              </Button>
            </Dialog.CloseTrigger>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <Dialog.Popup width="small" role="alertdialog">
          <Dialog.Header>
            <Dialog.Title>Slett «{deleteTarget?.name}»?</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <BodyShort>Sidegruppen blir slettet permanent.</BodyShort>
          </Dialog.Body>
          <Dialog.Footer>
            <Button data-color="danger" onClick={() => void handleDelete()} loading={deleting}>
              Slett
            </Button>
            <Dialog.CloseTrigger>
              <Button type="button" variant="secondary">
                Avbryt
              </Button>
            </Dialog.CloseTrigger>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog>
    </>
  )
}
