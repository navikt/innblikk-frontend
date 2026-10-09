import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Alert,
  BodyShort,
  Button,
  Dialog,
  Heading,
  HelpText,
  HStack,
  Loader,
  Select,
  Table,
  TextField,
  VStack,
} from '@navikt/ds-react'
import { ArrowLeftIcon, PencilIcon, PlusIcon, TrashIcon } from '@navikt/aksel-icons'
import { fetchWebsites } from '../../../shared/api/websiteApi.ts'
import { useUnsavedChangesGuard } from '../../../shared/hooks/useUnsavedChangesGuard.ts'
import type { Website } from '../../../shared/types/website.ts'
import { BetaFeatureNotice, BetaFeedbackLine } from '../../../shared/ui/BetaFeatureNotice.tsx'
import { WebsiteSelect } from '../../../shared/ui/WebsiteSelect.tsx'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { createSidegroup, listSidegroups, updateSidegroup } from '../api/sidegroupsApi.ts'
import { sidegroupMatchFields, type SidegroupMatchField, type SidegroupRequest } from '../model/types.ts'
import { hasMultipleValues, parseBulkPatterns } from '../utils/bulkPatterns.ts'

type MatchCondition = {
  id: number
  field: SidegroupMatchField
  pattern: string
}

const LIST_PATH = '/sidegrupper'

const toRequest = (
  name: string,
  description: string,
  websiteId: string,
  conditions: MatchCondition[],
): SidegroupRequest => {
  const patternsFor = (field: SidegroupMatchField) =>
    conditions.filter((condition) => condition.field === field).map((condition) => condition.pattern.trim())

  return {
    name: name.trim(),
    description: description.trim(),
    websiteId,
    include: patternsFor('include'),
    exclude: patternsFor('exclude'),
    exact: patternsFor('exact'),
    startWith: patternsFor('startWith'),
    endWith: patternsFor('endWith'),
  }
}

const snapshotOf = (name: string, websiteId: string | null, conditions: MatchCondition[], pending: string) =>
  JSON.stringify({ name, websiteId, conditions: conditions.map((c) => [c.field, c.pattern]), pending })

/** Remounts per route target so state never leaks between «ny» and an existing sidegroup. */
export default function SidegroupEditorRoute() {
  const { id } = useParams()
  return <SidegroupEditorPage key={id ?? 'new'} />
}

function SidegroupEditorPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isNew = !id

  const [websites, setWebsites] = useState<Website[]>([])
  const [websiteId, setWebsiteId] = useState<string | null>(searchParams.get('websiteId'))
  const [loading, setLoading] = useState(!isNew)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  // Not editable here, but kept so saving an existing sidegroup doesn't drop it.
  const [description, setDescription] = useState('')
  const [conditions, setConditions] = useState<MatchCondition[]>([])
  const [newConditionField, setNewConditionField] = useState<SidegroupMatchField>('include')
  const [newConditionPattern, setNewConditionPattern] = useState('')
  const [showPendingPatternDecision, setShowPendingPatternDecision] = useState(false)
  const [editingConditionId, setEditingConditionId] = useState<number | null>(null)
  const [editingConditionField, setEditingConditionField] = useState<SidegroupMatchField>('include')
  const [editingConditionPattern, setEditingConditionPattern] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [patternError, setPatternError] = useState('')
  const [snapshot, setSnapshot] = useState<string | null>(() => (isNew ? snapshotOf('', websiteId, [], '') : null))
  const nextConditionId = useRef(0)

  useEffect(() => {
    fetchWebsites()
      .then(setWebsites)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    listSidegroups()
      .then((all) => {
        if (cancelled) return
        // The backend may return numeric ids even though the type says string; the route param is always a string.
        const sidegroup = all.find((s) => String(s.id) === id)
        if (!sidegroup) {
          setLoadError('Fant ikke sidegruppen')
          return
        }
        const loaded = sidegroupMatchFields.flatMap((field) =>
          (sidegroup[field.key] ?? []).map((pattern) => ({ id: nextConditionId.current++, field: field.key, pattern })),
        )
        setName(sidegroup.name)
        setDescription(sidegroup.description ?? '')
        setWebsiteId(sidegroup.websiteId)
        setConditions(loaded)
        setSnapshot(snapshotOf(sidegroup.name, sidegroup.websiteId, loaded, ''))
      })
      .catch(
        (err: unknown) =>
          !cancelled && setLoadError(err instanceof Error ? err.message : 'Kunne ikke laste sidegruppen'),
      )
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id])

  const dirty = snapshot !== null && snapshot !== snapshotOf(name, websiteId, conditions, newConditionPattern)
  const { leaveTarget, requestLeave, cancelLeave } = useUnsavedChangesGuard(dirty)

  const website = websites.find((w) => w.id === websiteId)
  const websiteLabel = website ? `${website.name} — ${website.domain}` : ''
  const listHref = `${LIST_PATH}${websiteId ? `?websiteId=${encodeURIComponent(websiteId)}` : ''}`
  const nameError = showErrors && !name.trim() ? 'Gi sidegruppen et navn' : undefined
  const websiteError = showErrors && !websiteId ? 'Velg hvilket nettsted sidegruppen gjelder' : undefined

  const addCondition = () => {
    const text = newConditionPattern.trim()
    if (!text) return
    const { patterns, invalid } = parseBulkPatterns(text, website?.domain)
    if (patterns.length > 0) addPatterns(patterns)
    if (invalid.length > 0) {
      setNewConditionPattern(invalid.join(', '))
      setPatternError(
        `Ikke lagt til fordi de ikke tilhører ${website?.domain ?? 'valgt nettsted'}: ${invalid.join(', ')}`,
      )
      return
    }
    setNewConditionPattern('')
    setPatternError('')
  }

  const addPatterns = (patterns: string[]) => {
    const existing = new Set(conditions.filter((c) => c.field === newConditionField).map((c) => c.pattern))
    const fresh = patterns.filter((pattern) => !existing.has(pattern))
    setConditions((current) => [
      ...current,
      ...fresh.map((pattern) => ({ id: nextConditionId.current++, field: newConditionField, pattern })),
    ])
    setShowPendingPatternDecision(false)
  }

  const handlePatternPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text')
    if (!hasMultipleValues(text)) return
    event.preventDefault()
    const { patterns, invalid } = parseBulkPatterns(text, website?.domain)
    if (patterns.length > 0) addPatterns(patterns)
    if (invalid.length > 0) {
      setNewConditionPattern(invalid.join(', '))
      setPatternError(
        `Ikke lagt til fordi de ikke tilhører ${website?.domain ?? 'valgt nettsted'}: ${invalid.join(', ')}`,
      )
      return
    }
    setNewConditionPattern('')
    setPatternError('')
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

  const removeCondition = (conditionId: number) => {
    setConditions((current) => current.filter((condition) => condition.id !== conditionId))
    if (editingConditionId === conditionId) setEditingConditionId(null)
  }

  const save = async () => {
    if (!name.trim() || !websiteId) {
      setShowErrors(true)
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const request = toRequest(name, description, websiteId, conditions)
      if (id) await updateSidegroup(id, request)
      else await createSidegroup(request)
      setSnapshot(snapshotOf(name, websiteId, conditions, ''))
      void navigate(listHref)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Kunne ikke lagre sidegruppen')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (newConditionPattern.trim()) {
      setShowPendingPatternDecision(true)
      return
    }
    void save()
  }

  const saveWithoutAddingPending = () => {
    setNewConditionPattern('')
    setShowPendingPatternDecision(false)
    void save()
  }

  const handleCancel = () => (dirty ? requestLeave(listHref) : void navigate(listHref))

  const changeWebsite = (nextId: string | null) => setWebsiteId(nextId)

  const title = isNew ? 'Ny sidegruppe' : 'Rediger sidegruppe'

  if (loading) {
    return (
      <AppBlock className="py-16">
        <Loader title="Laster sidegruppen…" />
      </AppBlock>
    )
  }

  if (loadError) {
    return (
      <AppBlock className="py-16">
        <VStack gap="space-16" align="start">
          <Alert variant="error">{loadError}</Alert>
          <Button as={Link} to={listHref} variant="secondary" icon={<ArrowLeftIcon aria-hidden />}>
            Tilbake til sidegrupper
          </Button>
        </VStack>
      </AppBlock>
    )
  }

  return (
    <>
      <PageHeader title={title} description={!isNew && websiteLabel ? `Nettsted: ${websiteLabel}` : undefined} beta />

      <AppBlock className="pb-16">
        <BetaFeatureNotice id="sidegrupper" title="Sidegrupper er i beta" className="mb-4">
          Sidegrupper er under utvikling, og funksjonalitet kan endre seg.
          <BetaFeedbackLine />
        </BetaFeatureNotice>

        <form onSubmit={handleSubmit}>
          <VStack gap="space-24" style={{ maxWidth: '56rem' }}>
            <Button
              as={Link}
              to={listHref}
              variant="tertiary"
              size="small"
              icon={<ArrowLeftIcon aria-hidden />}
              style={{ alignSelf: 'flex-start' }}
            >
              Tilbake til sidegrupper
            </Button>

            <VStack gap="space-12" style={{ maxWidth: '32rem' }}>
              <TextField
                label="Navn"
                value={name}
                error={nameError}
                autoFocus={isNew}
                onChange={(event) => setName(event.target.value)}
              />
              {isNew && (
                <WebsiteSelect
                  websites={websites}
                  selectedId={websiteId}
                  onSelect={changeWebsite}
                  error={websiteError}
                  fullWidth
                />
              )}
            </VStack>

            <VStack gap="space-16" as="section" aria-labelledby="sidegroup-conditions">
              <HStack gap="space-8" align="center">
                <Heading level="2" size="small" id="sidegroup-conditions">
                  Hvilke sider skal være med i gruppen?
                </Heading>
                <HelpText title="URL-sti">For eksempel /artikler/.</HelpText>
              </HStack>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(12rem,1fr)_minmax(0,2fr)_auto] md:items-end">
                <Select
                  label="Samsvar"
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
                  label="URL-sti"
                  value={newConditionPattern}
                  onChange={(event) => {
                    setNewConditionPattern(event.target.value)
                    setPatternError('')
                  }}
                  error={patternError || undefined}
                  onPaste={handlePatternPaste}
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
                    <BodyShort>URL-stien er ikke lagt til ennå.</BodyShort>
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
                        <Table.HeaderCell>URL-sti</Table.HeaderCell>
                        <Table.HeaderCell>
                          <span className="sr-only">Handlinger</span>
                        </Table.HeaderCell>
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
                                  label="Samsvar"
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
                                  label="URL-sti"
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
                                      aria-label="Rediger regel"
                                      onClick={() => startEditingCondition(condition)}
                                    />
                                    <Button
                                      type="button"
                                      size="xsmall"
                                      variant="tertiary-neutral"
                                      data-color="danger"
                                      icon={<TrashIcon aria-hidden />}
                                      aria-label="Fjern regel"
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
            </VStack>

            {formError && <Alert variant="error">{formError}</Alert>}

            <HStack gap="space-12">
              <Button type="submit" loading={saving}>
                {isNew ? 'Opprett sidegruppe' : 'Lagre endringer'}
              </Button>
              <Button type="button" variant="secondary" disabled={saving} onClick={handleCancel}>
                Avbryt
              </Button>
            </HStack>
          </VStack>
        </form>
      </AppBlock>

      <Dialog open={leaveTarget !== null} onOpenChange={(open) => !open && cancelLeave()}>
        <Dialog.Popup width="small" role="alertdialog">
          <Dialog.Header withClosebutton={false}>
            <Dialog.Title>Forkaste endringene?</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <BodyShort>Du har endringer som ikke er lagret.</BodyShort>
          </Dialog.Body>
          <Dialog.Footer>
            <Button
              data-color="danger"
              onClick={() => {
                const target = leaveTarget ?? listHref
                setSnapshot(null)
                cancelLeave()
                void navigate(target)
              }}
            >
              Forkast
            </Button>
            <Dialog.CloseTrigger>
              <Button type="button" variant="secondary">
                Fortsett å redigere
              </Button>
            </Dialog.CloseTrigger>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog>
    </>
  )
}
