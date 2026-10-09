import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Alert,
  BodyShort,
  Button,
  Dialog,
  ErrorSummary,
  Heading,
  HStack,
  Loader,
  Select,
  TextField,
  VStack,
} from '@navikt/ds-react'
import { ArrowLeftIcon, PlusIcon } from '@navikt/aksel-icons'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { fetchWebsites } from '../../../shared/api/websiteApi.ts'
import {
  createCohort,
  deleteCohort,
  getCohort,
  listCohorts,
  replaceCriteria,
  updateCohort,
} from '../../cohortmanager/api/cohortManagerApi.ts'
import type { CohortDetailDto, CohortDto, LogicalOperator } from '../../cohortmanager/model/types.ts'
import {
  draftToTree,
  emptyCohortCard,
  emptyDraft,
  emptyEventCard,
  emptySequenceCard,
  treeToDraft,
  type Card,
  type Draft,
} from '../model/draft.ts'
import { validateDraft, anchorFor, type ValidationIssue } from '../utils/validate.ts'
import { CriterionCard } from './CriterionCard.tsx'
import { SummaryPanel } from './SummaryPanel.tsx'

const LIST_PATH = '/brukergrupper-next'

function focusAnchor(anchorId: string) {
  const el = document.getElementById(anchorId)
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  const target = el.matches('input,select,button,textarea') ? el : el.querySelector<HTMLElement>('input,select,button')
  target?.focus({ preventScroll: true })
}

/** Remounts per route target so state never leaks between «ny» and an existing group. */
export default function CohortEditorRoute() {
  const { id } = useParams()
  return <CohortEditorPage key={id ?? 'new'} />
}

function CohortEditorPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const cohortId = id ? Number(id) : null
  const isNew = cohortId === null

  const [websiteId, setWebsiteId] = useState<string | null>(searchParams.get('websiteId'))
  const [websiteLabel, setWebsiteLabel] = useState('')
  const [loading, setLoading] = useState(!isNew)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [unsupportedReason, setUnsupportedReason] = useState<string | null>(null)
  const [others, setOthers] = useState<CohortDto[]>([])

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [initialDraft] = useState<Draft>(() => emptyDraft())
  const [draft, setDraft] = useState<Draft>(initialDraft)
  const [snapshot, setSnapshot] = useState<string | null>(() =>
    isNew ? JSON.stringify({ name: '', description: '', draft: initialDraft }) : null,
  )

  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)
  const summaryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isNew) return
    let cancelled = false
    getCohort(cohortId)
      .then((detail: CohortDetailDto) => {
        if (cancelled) return
        setWebsiteId(detail.websiteId)
        setName(detail.name)
        setDescription(detail.description ?? '')
        const result = treeToDraft(detail.root)
        if (result.ok) {
          setDraft(result.draft)
          setSnapshot(
            JSON.stringify({
              name: detail.name,
              description: detail.description ?? '',
              draft: result.draft,
            }),
          )
        } else {
          setUnsupportedReason(result.reason)
        }
      })
      .catch(
        (err: unknown) =>
          !cancelled && setLoadError(err instanceof Error ? err.message : 'Kunne ikke laste brukergruppen'),
      )
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [cohortId, isNew])

  useEffect(() => {
    if (!websiteId) return
    listCohorts(websiteId)
      .then((list) => setOthers(list.filter((c) => c.id !== cohortId)))
      .catch(() => setOthers([]))
    fetchWebsites()
      .then((sites) => {
        const site = sites.find((s) => s.id === websiteId)
        setWebsiteLabel(site ? `${site.name} — ${site.domain}` : '')
      })
      .catch(() => {})
  }, [websiteId, cohortId])

  const dirty = snapshot !== null && snapshot !== JSON.stringify({ name, description, draft })

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  useEffect(() => {
    if (!pendingFocus) return
    focusAnchor(anchorFor(pendingFocus))
    setPendingFocus(null)
  }, [pendingFocus, draft])

  const names = useMemo(() => Object.fromEntries(others.map((c) => [String(c.id), c.name])), [others])
  const issues: ValidationIssue[] = useMemo(() => validateDraft(draft), [draft])
  const nameError = showErrors && !name.trim() ? 'Gi brukergruppen et navn' : undefined
  const listHref = `${LIST_PATH}${websiteId ? `?websiteId=${encodeURIComponent(websiteId)}` : ''}`

  const updateCard = (cardId: string, next: Card) =>
    setDraft((d) => ({ ...d, cards: d.cards.map((c) => (c.id === cardId ? next : c)) }))

  const addCard = (card: Card) => {
    setDraft((d) => ({ ...d, cards: [...d.cards, card] }))
    setPendingFocus(card.id)
  }

  const removeCard = (cardId: string) => setDraft((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== cardId) }))

  const splitCondition = (cardId: string, conditionId: string) =>
    setDraft((d) => {
      const index = d.cards.findIndex((c) => c.id === cardId)
      const card = d.cards[index]
      if (!card || card.kind !== 'event') return d
      const moved = card.conditions.find((c) => c.id === conditionId)
      if (!moved) return d
      const split = { ...emptyEventCard(), negated: card.negated, time: card.time, conditions: [moved] }
      const cards = d.cards.slice()
      cards[index] = { ...card, conditions: card.conditions.filter((c) => c.id !== conditionId) }
      cards.splice(index + 1, 0, split)
      return { ...d, cards }
    })

  const handleSave = async () => {
    setSaveError(null)
    if (!name.trim() || issues.length > 0) {
      setShowErrors(true)
      requestAnimationFrame(() => summaryRef.current?.focus())
      return
    }
    if (!websiteId) {
      setSaveError('Mangler nettsted. Gå tilbake til oversikten og velg et nettsted.')
      return
    }
    setSaving(true)
    try {
      const root = draftToTree(draft)
      const trimmed = { name: name.trim(), description: description.trim() || undefined }
      if (isNew) {
        const created = await createCohort({ websiteId, ...trimmed })
        try {
          await replaceCriteria(created.id, root)
        } catch (criteriaErr: unknown) {
          // Don't leave a criteria-less group behind occupying the unique name.
          await deleteCohort(created.id)
          throw criteriaErr
        }
      } else {
        await updateCohort(cohortId, { websiteId, ...trimmed })
        await replaceCriteria(cohortId, root)
      }
      setSnapshot(JSON.stringify({ name, description, draft }))
      void navigate(listHref)
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Kunne ikke lagre brukergruppen')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => (dirty ? setConfirmLeave(true) : void navigate(listHref))

  const title = isNew ? 'Ny brukergruppe' : 'Rediger brukergruppe'

  if (loading) {
    return (
      <AppBlock className="py-16">
        <Loader title="Laster brukergruppen…" />
      </AppBlock>
    )
  }

  if (loadError) {
    return (
      <AppBlock className="py-16">
        <VStack gap="space-16" align="start">
          <Alert variant="error">{loadError}</Alert>
          <Button as={Link} to={listHref} variant="secondary" icon={<ArrowLeftIcon aria-hidden />}>
            Tilbake til brukergrupper
          </Button>
        </VStack>
      </AppBlock>
    )
  }

  if (unsupportedReason) {
    return (
      <>
        <PageHeader title={name || title} />
        <AppBlock className="pb-16">
          <VStack gap="space-16" align="start">
            <Alert variant="info">
              <VStack gap="space-8">
                <BodyShort weight="semibold">Denne brukergruppen kan ikke redigeres her ennå</BodyShort>
                <BodyShort>{unsupportedReason} Åpne den i den gamle editoren for å endre den.</BodyShort>
              </VStack>
            </Alert>
            <HStack gap="space-12">
              <Button as={Link} to={`/brukergrupper${websiteId ? `?websiteId=${encodeURIComponent(websiteId)}` : ''}`}>
                Åpne i den gamle editoren
              </Button>
              <Button as={Link} to={listHref} variant="secondary" icon={<ArrowLeftIcon aria-hidden />}>
                Tilbake
              </Button>
            </HStack>
          </VStack>
        </AppBlock>
      </>
    )
  }

  return (
    <>
      <PageHeader title={title} description={websiteLabel ? `Nettsted: ${websiteLabel}` : undefined} />

      <AppBlock className="pb-16">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <VStack gap="space-24">
            <Button
              as={Link}
              to={listHref}
              variant="tertiary"
              size="small"
              icon={<ArrowLeftIcon aria-hidden />}
              style={{ alignSelf: 'flex-start' }}
              onClick={(e: React.MouseEvent) => {
                if (dirty) {
                  e.preventDefault()
                  setConfirmLeave(true)
                }
              }}
            >
              Tilbake til brukergrupper
            </Button>

            {showErrors && (name.trim() === '' || issues.length > 0) && (
              <ErrorSummary ref={summaryRef} heading="Dette må rettes før du kan lagre:">
                {!name.trim() && (
                  <ErrorSummary.Item
                    href="#cohort-next-name"
                    onClick={(e) => {
                      e.preventDefault()
                      focusAnchor('cohort-next-name')
                    }}
                  >
                    Gi brukergruppen et navn
                  </ErrorSummary.Item>
                )}
                {issues.map((issue, i) => (
                  <ErrorSummary.Item
                    key={i}
                    href={`#${issue.anchorId}`}
                    onClick={(e) => {
                      e.preventDefault()
                      focusAnchor(issue.anchorId)
                    }}
                  >
                    {issue.message}
                  </ErrorSummary.Item>
                ))}
              </ErrorSummary>
            )}

            <VStack gap="space-12" style={{ maxWidth: '32rem' }}>
              <TextField
                id="cohort-next-name"
                label="Navn på brukergruppen"
                description="F.eks. «Søkte på dagpenger fra mobil»"
                value={name}
                error={nameError}
                autoFocus={isNew}
                onChange={(e) => setName(e.target.value)}
              />
              <TextField
                label="Beskrivelse (valgfri)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </VStack>

            <VStack gap="space-12" as="section" aria-labelledby="cohort-next-criteria">
              <VStack gap="space-4">
                <Heading level="2" size="small" id="cohort-next-criteria">
                  Hvem skal være med i gruppen?
                </Heading>
                <BodyShort textColor="subtle">
                  Beskriv hva brukerne har gjort. Hvert kriterium er ett kort, og kortene kombineres nedenfor.
                </BodyShort>
              </VStack>

              {draft.cards.length > 1 && (
                <HStack gap="space-8" align="center" wrap>
                  <BodyShort as="span">Brukeren må oppfylle</BodyShort>
                  <Select
                    label="Hvor mange kriterier må oppfylles?"
                    hideLabel
                    size="small"
                    style={{ width: '9rem' }}
                    value={draft.combinator}
                    onChange={(e) => setDraft((d) => ({ ...d, combinator: e.target.value as LogicalOperator }))}
                  >
                    <option value="AND">alle</option>
                    <option value="OR">minst ett</option>
                  </Select>
                  <BodyShort as="span">av kriteriene under.</BodyShort>
                </HStack>
              )}

              <VStack gap="space-8">
                {draft.cards.map((card, index) => (
                  <div key={card.id}>
                    {index > 0 && (
                      <BodyShort
                        weight="semibold"
                        textColor="subtle"
                        style={{ textAlign: 'center', paddingBottom: '0.5rem' }}
                      >
                        {draft.combinator === 'OR' ? 'eller' : 'og'}
                      </BodyShort>
                    )}
                    <CriterionCard
                      card={card}
                      index={index}
                      total={draft.cards.length}
                      websiteId={websiteId ?? undefined}
                      cohorts={others}
                      showErrors={showErrors}
                      onChange={(next) => updateCard(card.id, next)}
                      onRemove={() => removeCard(card.id)}
                      onSplitCondition={(conditionId) => splitCondition(card.id, conditionId)}
                    />
                  </div>
                ))}
              </VStack>

              <VStack gap="space-8" id={anchorFor('add-card')}>
                <HStack gap="space-8" wrap>
                  <Button
                    type="button"
                    size="small"
                    variant="secondary"
                    icon={<PlusIcon aria-hidden />}
                    onClick={() => addCard(emptyEventCard())}
                  >
                    Aktivitet
                  </Button>
                  <Button
                    type="button"
                    size="small"
                    variant="secondary"
                    icon={<PlusIcon aria-hidden />}
                    onClick={() => addCard(emptyCohortCard())}
                  >
                    Annen brukergruppe
                  </Button>
                  <Button
                    type="button"
                    size="small"
                    variant="secondary"
                    icon={<PlusIcon aria-hidden />}
                    onClick={() => addCard(emptySequenceCard())}
                  >
                    Rekkefølge
                  </Button>
                </HStack>
              </VStack>
            </VStack>
          </VStack>

          <div className="lg:sticky lg:top-4 lg:self-start">
            <VStack gap="space-16">
              <SummaryPanel draft={draft} names={names} />
              {saveError && <Alert variant="error">{saveError}</Alert>}
              <HStack gap="space-12">
                <Button loading={saving} onClick={() => void handleSave()}>
                  {isNew ? 'Opprett brukergruppe' : 'Lagre endringer'}
                </Button>
                <Button variant="secondary" onClick={handleCancel}>
                  Avbryt
                </Button>
              </HStack>
            </VStack>
          </div>
        </div>
      </AppBlock>

      <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
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
                setSnapshot(null)
                void navigate(listHref)
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
