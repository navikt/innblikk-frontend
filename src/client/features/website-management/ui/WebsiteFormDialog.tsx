import { useState } from 'react'
import { Button, LocalAlert, Modal, Select, TextField, VStack } from '@navikt/ds-react'
import type {
  WebsiteInput,
  WebsiteManagementTeam,
  WebsiteRegistration,
} from '../../../shared/api/websiteManagementApi.ts'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface WebsiteFormDialogProps {
  open: boolean
  /** null/undefined = create mode. */
  website?: WebsiteRegistration | null
  teams: WebsiteManagementTeam[]
  /** Admin mode: free-text UUID owner field instead of a team dropdown. */
  adminMode?: boolean
  onSubmit: (input: WebsiteInput) => Promise<void>
  onClose: () => void
}

function normalizeDomain(raw: string): string {
  let value = raw.trim().toLowerCase()
  value = value.replace(/^https?:\/\//, '')
  value = value.split('/')[0]
  return value
}

// Bounds matching the PG columns / BigQuery sink limits on the service side.
const MAX_NAME_LENGTH = 100
const MAX_DOMAIN_LENGTH = 255

function validateName(name: string): string | null {
  if (!name) return 'Navn må fylles ut'
  if (name.length > MAX_NAME_LENGTH) return `Navnet kan være maks ${MAX_NAME_LENGTH} tegn`
  return null
}

function validateDomain(domain: string): string | null {
  if (!domain) return 'Domene må fylles ut'
  if (domain.length > MAX_DOMAIN_LENGTH) return `Domenet kan være maks ${MAX_DOMAIN_LENGTH} tegn`
  const hostnamePattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/
  if (!hostnamePattern.test(domain)) return 'Ugyldig domene (for eksempel: minside.nav.no)'
  return null
}

interface FormFieldsProps {
  website?: WebsiteRegistration | null
  teams: WebsiteManagementTeam[]
  adminMode: boolean
  onSubmit: (input: WebsiteInput) => Promise<void>
  onClose: () => void
}

/**
 * The actual form, remounted (via `key`) whenever the dialog opens for a different
 * website, so useState initializers always reflect the website being edited.
 */
function WebsiteFormFields({ website, teams, adminMode, onSubmit, onClose }: FormFieldsProps) {
  const isEdit = Boolean(website)
  const [name, setName] = useState(website?.name ?? '')
  const [domain, setDomain] = useState(website?.domain ?? '')
  const [ownerTeamId, setOwnerTeamId] = useState<string>(website?.ownerTeamId ?? teams[0]?.id ?? '')
  const [adminOwnerInput, setAdminOwnerInput] = useState<string>(website?.ownerTeamId ?? '')
  const [nameError, setNameError] = useState<string | null>(null)
  const [domainError, setDomainError] = useState<string | null>(null)
  const [ownerError, setOwnerError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    const trimmedName = name.trim()
    const normalizedDomain = normalizeDomain(domain)
    const nextNameError = validateName(trimmedName)
    const nextDomainError = validateDomain(normalizedDomain)

    let resolvedOwnerTeamId: string | null = null
    let nextOwnerError: string | null = null
    if (adminMode) {
      // Only admins (ReOps) may assign or change ownership — explicitly, by UUID.
      const trimmedOwner = adminOwnerInput.trim()
      if (trimmedOwner && !UUID_PATTERN.test(trimmedOwner)) {
        nextOwnerError = 'Må være en gyldig team-ID (UUID), eller tom for «ingen eier»'
      } else {
        resolvedOwnerTeamId = trimmedOwner || null
      }
    } else if (isEdit) {
      // Non-admin edit: ownership is read-only, always resubmit the existing owner.
      resolvedOwnerTeamId = website?.ownerTeamId ?? null
    } else {
      if (!ownerTeamId) {
        nextOwnerError = 'Velg hvilket team som eier nettsiden'
      } else {
        resolvedOwnerTeamId = ownerTeamId
      }
    }

    setNameError(nextNameError)
    setDomainError(nextDomainError)
    setOwnerError(nextOwnerError)
    if (nextNameError || nextDomainError || nextOwnerError) return

    setIsSubmitting(true)
    setSubmitError(null)
    try {
      await onSubmit({ name: trimmedName, domain: normalizedDomain, ownerTeamId: resolvedOwnerTeamId })
      onClose()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Noe gikk galt')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Modal.Body>
        <VStack gap="space-16">
          <TextField
            label="Navn på nettsiden"
            description={`For eksempel «Minside – prod» eller «Aksel» (maks ${MAX_NAME_LENGTH} tegn)`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={nameError ?? undefined}
            autoComplete="off"
            maxLength={MAX_NAME_LENGTH}
          />
          <TextField
            label="Hoveddomene"
            description="Uten https:// og uten sti, for eksempel minside.nav.no"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            error={domainError ?? undefined}
            autoComplete="off"
            inputMode="url"
            maxLength={MAX_DOMAIN_LENGTH}
          />
          {adminMode ? (
            <TextField
              label="Eier (team-ID i Teamkatalogen)"
              description="UUID. La stå tom for «ingen eier» — eierskap kan tildeles senere."
              value={adminOwnerInput}
              onChange={(event) => setAdminOwnerInput(event.target.value)}
              error={ownerError ?? undefined}
              autoComplete="off"
            />
          ) : (
            <Select
              label="Team som eier nettsiden"
              description={
                isEdit
                  ? 'Eierskap kan bare endres av Team ResearchOps'
                  : 'Du kan bare registrere nettsider for team du selv er medlem av'
              }
              value={ownerTeamId}
              onChange={(event) => setOwnerTeamId(event.target.value)}
              error={ownerError ?? undefined}
              disabled={isEdit}
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
          )}
          {submitError && (
            <LocalAlert status="error" role="alert">
              <LocalAlert.Content>{submitError}</LocalAlert.Content>
            </LocalAlert>
          )}
        </VStack>
      </Modal.Body>
      <Modal.Footer>
        <Button type="submit" loading={isSubmitting}>
          {isEdit ? 'Lagre endringer' : 'Registrer nettside'}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
          Avbryt
        </Button>
      </Modal.Footer>
    </form>
  )
}

/**
 * Create/edit dialog for a website registration. Labels and errors are Norwegian and
 * tied to the inputs so screen readers announce them (Aksel TextField/Select).
 */
export function WebsiteFormDialog({
  open,
  website,
  teams,
  adminMode = false,
  onSubmit,
  onClose,
}: WebsiteFormDialogProps) {
  const isEdit = Boolean(website)
  return (
    <Modal
      open={open}
      onClose={onClose}
      header={{ heading: isEdit ? `Rediger «${website?.name}»` : 'Registrer ny nettside' }}
      width="small"
    >
      <WebsiteFormFields
        key={`${open ? 'open' : 'closed'}-${website?.websiteId ?? 'new'}`}
        website={website}
        teams={teams}
        adminMode={adminMode}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    </Modal>
  )
}
