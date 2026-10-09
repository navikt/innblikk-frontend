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
  TextField,
  VStack,
} from '@navikt/ds-react'
import { ArrowLeftIcon } from '@navikt/aksel-icons'
import { AppBlock } from '../../../shared/ui/theme/AppBlock/AppBlock.tsx'
import { PageHeader } from '../../../shared/ui/theme/PageHeader/PageHeader.tsx'
import { BetaFeatureNotice, BetaFeedbackLine } from '../../../shared/ui/BetaFeatureNotice.tsx'
import { fetchWebsites } from '../../../shared/api/websiteApi.ts'
import type { Website } from '../../../shared/types/website.ts'
import {
  createCohort,
  getCohort,
  listCohorts,
  replaceCriteria,
  updateCohort,
} from '../../cohortmanager/api/cohortManagerApi.ts'
import { deleteCohortChecked } from '../api/cohortApi.ts'
import type { CohortDetailDto, CohortDto } from '../../cohortmanager/model/types.ts'
import { draftToTree, emptyDraft, resetCohortRefs, treeToDraft, type Draft } from '../model/draft.ts'
import { validateDraft, anchorFor, type ValidationIssue } from '../utils/validate.ts'
import { CardListEditor } from './CardListEditor.tsx'
import { SummaryPanel } from './SummaryPanel.tsx'
import { WebsiteSelect } from './WebsiteSelect.tsx'
import './cohortNext.css'

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
  const [websites, setWebsites] = useState<Website[]>([])
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
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null)
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
    fetchWebsites()
      .then(setWebsites)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!websiteId) return
    let cancelled = false
    listCohorts(websiteId)
      .then((list) => !cancelled && setOthers(list.filter((c) => c.id !== cohortId)))
      .catch(() => !cancelled && setOthers([]))
    return () => {
      cancelled = true
    }
  }, [websiteId, cohortId])

  const changeWebsite = (id: string | null) => {
    setWebsiteId(id)
    setOthers([])
    // A reference to a group on the previous site would point at the wrong place.
    setDraft((d) => ({ ...d, cards: resetCohortRefs(d.cards) }))
  }

  const website = websites.find((s) => s.id === websiteId)
  const websiteLabel = website ? `${website.name} — ${website.domain}` : ''

  const dirty = snapshot !== null && snapshot !== JSON.stringify({ name, description, draft })

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // BrowserRouter has no navigation blocker, so intercept in-app link clicks while there are unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.target === '_blank' || anchor.origin !== window.location.origin) return
      const destination = anchor.pathname + anchor.search + anchor.hash
      if (destination === window.location.pathname + window.location.search + window.location.hash) return
      e.preventDefault()
      e.stopPropagation()
      setLeaveTarget(destination)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [dirty])

  useEffect(() => {
    if (!pendingFocus) return
    focusAnchor(anchorFor(pendingFocus))
    setPendingFocus(null)
  }, [pendingFocus, draft])

  const names = useMemo(() => Object.fromEntries(others.map((c) => [String(c.id), c.name])), [others])
  const issues: ValidationIssue[] = useMemo(() => validateDraft(draft), [draft])
  const nameError = showErrors && !name.trim() ? 'Gi brukergruppen et navn' : undefined
  const websiteError = showErrors && !websiteId ? 'Velg hvilket nettsted brukergruppen gjelder' : undefined
  const listHref = `${LIST_PATH}${websiteId ? `?websiteId=${encodeURIComponent(websiteId)}` : ''}`

  // One simple card already reads as a sentence; the summary only helps once cards combine.
  const showSummary = draft.cards.length > 1 || draft.cards.some((c) => c.kind === 'sequence' || c.kind === 'group')

  const handleSave = async () => {
    setSaveError(null)
    if (!name.trim() || !websiteId || issues.length > 0) {
      setShowErrors(true)
      requestAnimationFrame(() => summaryRef.current?.focus())
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
          try {
            await deleteCohortChecked(created.id)
          } catch {
            throw new Error(
              `Kriteriene kunne ikke lagres, og den tomme brukergruppen «${trimmed.name}» kunne ikke fjernes. Slett den fra oversikten før du prøver igjen.`,
            )
          }
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

  const handleCancel = () => (dirty ? setLeaveTarget(listHref) : void navigate(listHref))

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
                <BodyShort>{unsupportedReason}</BodyShort>
              </VStack>
            </Alert>
            <Button as={Link} to={listHref} variant="secondary" icon={<ArrowLeftIcon aria-hidden />}>
              Tilbake til brukergrupper
            </Button>
          </VStack>
        </AppBlock>
      </>
    )
  }

  return (
    <>
      <PageHeader title={title} description={!isNew && websiteLabel ? `Nettsted: ${websiteLabel}` : undefined} beta />

      <AppBlock className="pb-16">
        <BetaFeatureNotice id="brukergrupper-next" title="Brukergrupper er i beta" className="mb-4">
          Brukergrupper er under utvikling, og funksjonalitet kan endre seg.
          <BetaFeedbackLine />
        </BetaFeatureNotice>

        <VStack gap="space-24" style={{ maxWidth: '56rem' }}>
          <Button
            as={Link}
            to={listHref}
            variant="tertiary"
            size="small"
            icon={<ArrowLeftIcon aria-hidden />}
            style={{ alignSelf: 'flex-start' }}
          >
            Tilbake til brukergrupper
          </Button>

          {showErrors && (name.trim() === '' || !websiteId || issues.length > 0) && (
            <ErrorSummary ref={summaryRef} heading="Dette må rettes før du kan lagre:">
              {!websiteId && (
                <ErrorSummary.Item
                  href="#cohort-next-website"
                  onClick={(e) => {
                    e.preventDefault()
                    focusAnchor('cohort-next-website')
                  }}
                >
                  Velg hvilket nettsted brukergruppen gjelder
                </ErrorSummary.Item>
              )}
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
              label="Navn"
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
            {isNew && (
              <div id="cohort-next-website">
                <WebsiteSelect
                  websites={websites}
                  selectedId={websiteId}
                  onSelect={changeWebsite}
                  error={websiteError}
                  fullWidth
                />
              </div>
            )}
          </VStack>

          <VStack gap="space-12" as="section" aria-labelledby="cohort-next-criteria">
            <Heading level="2" size="small" id="cohort-next-criteria">
              Hvem skal være med i gruppen?
            </Heading>

            <CardListEditor
              combinator={draft.combinator}
              cards={draft.cards}
              onChange={(next) => setDraft(next)}
              websiteId={websiteId ?? undefined}
              others={others}
              showErrors={showErrors}
              depth={0}
              onFocusCard={setPendingFocus}
            />
          </VStack>

          {showSummary && <SummaryPanel draft={draft} names={names} />}
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
      </AppBlock>

      <Dialog open={leaveTarget !== null} onOpenChange={(o) => !o && setLeaveTarget(null)}>
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
                setLeaveTarget(null)
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
