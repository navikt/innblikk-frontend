import { Alert, Button, Modal, Select, TextField } from '@navikt/ds-react'

type CanvasDotVotingStickyRow = {
  id: string
  label: string
  totalVotes: number
  myVotes: number
  canVote: boolean
}

type CanvasDotVotingModalProps = {
  open: boolean
  onClose: () => void
  sectionOptions: Array<{ id: string; label: string }>
  selectedSectionId: string
  onSelectedSectionIdChange: (sectionId: string) => void
  minutesInput: string
  onMinutesInputChange: (value: string) => void
  votesPerParticipantInput: string
  onVotesPerParticipantInputChange: (value: string) => void
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onAdjustMinusOneMinute: () => void
  onAdjustPlusOneMinute: () => void
  onEnd: () => void
  onClear: () => void
  onSortSectionByVotes: () => void
  isRunning: boolean
  isPaused: boolean
  sessionExists: boolean
  votingLabel: string | null
  activeSectionLabel: string | null
  votesPerParticipant: number
  myUsedVotes: number
  myVotesRemaining: number
  stickyRows: CanvasDotVotingStickyRow[]
  onAddVote: (stickyId: string) => void
  onRemoveVote: (stickyId: string) => void
  isSaving: boolean
  pendingAction:
    | 'start'
    | 'pause'
    | 'resume'
    | 'adjust-minus'
    | 'adjust-plus'
    | 'end'
    | 'clear'
    | 'sort'
    | 'add-vote'
    | 'remove-vote'
    | null
  error: string | null
}

const CanvasDotVotingModal = ({
  open,
  onClose,
  sectionOptions,
  selectedSectionId,
  onSelectedSectionIdChange,
  minutesInput,
  onMinutesInputChange,
  votesPerParticipantInput,
  onVotesPerParticipantInputChange,
  onStart,
  onPause,
  onResume,
  onAdjustMinusOneMinute,
  onAdjustPlusOneMinute,
  onEnd,
  onClear,
  onSortSectionByVotes,
  isRunning,
  isPaused,
  sessionExists,
  votingLabel,
  activeSectionLabel,
  votesPerParticipant,
  myUsedVotes,
  myVotesRemaining,
  stickyRows,
  onAddVote,
  onRemoveVote,
  isSaving,
  pendingAction,
  error,
}: CanvasDotVotingModalProps) => (
  <Modal
    open={open}
    onClose={onClose}
    header={{ heading: 'Prikkvotering' }}
    width="small"
    aria-label="Sett opp og gjennomfør prikkvotering"
  >
    <Modal.Body className="space-y-4">
      {!sessionExists && (
        <>
          <Select
            label="Seksjon"
            value={selectedSectionId}
            onChange={(event) => onSelectedSectionIdChange(event.target.value)}
          >
            <option value="" disabled>
              Velg seksjon
            </option>
            {sectionOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
          <TextField
            label="Minutter"
            type="number"
            min={1}
            max={240}
            value={minutesInput}
            onChange={(event) => onMinutesInputChange(event.target.value)}
          />
          <TextField
            label="Stemmer per person"
            type="number"
            min={1}
            max={20}
            value={votesPerParticipantInput}
            onChange={(event) => onVotesPerParticipantInputChange(event.target.value)}
          />
        </>
      )}

      {sessionExists && (
        <div className="space-y-3">
          <div className="rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] px-3 py-3 text-sm text-[var(--ax-text-default)]">
            <div className="font-semibold">
              {isRunning
                ? `Aktiv prikkvotering: ${votingLabel}`
                : isPaused
                  ? `Pauset prikkvotering: ${votingLabel}`
                  : `Avsluttet prikkvotering: ${votingLabel}`}
            </div>
            <div className="mt-1 text-[var(--ax-text-subtle)]">
              Seksjon: <strong>{activeSectionLabel || 'Ukjent seksjon'}</strong>
            </div>
            <div className="text-[var(--ax-text-subtle)]">
              Dine stemmer: <strong>{myUsedVotes}</strong> av <strong>{votesPerParticipant}</strong> brukt. Gjenstår:{' '}
              <strong>{myVotesRemaining}</strong>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="xsmall"
              variant="secondary"
              onClick={onAdjustMinusOneMinute}
              loading={isSaving && pendingAction === 'adjust-minus'}
              disabled={isSaving && pendingAction !== 'adjust-minus'}
            >
              -1 min
            </Button>
            <Button
              size="xsmall"
              variant="secondary"
              onClick={onAdjustPlusOneMinute}
              loading={isSaving && pendingAction === 'adjust-plus'}
              disabled={isSaving && pendingAction !== 'adjust-plus'}
            >
              +1 min
            </Button>
            {isRunning && (
              <Button
                size="xsmall"
                variant="secondary"
                onClick={onPause}
                loading={isSaving && pendingAction === 'pause'}
                disabled={isSaving && pendingAction !== 'pause'}
              >
                Pause
              </Button>
            )}
            {isPaused && (
              <Button
                size="xsmall"
                variant="secondary"
                onClick={onResume}
                loading={isSaving && pendingAction === 'resume'}
                disabled={isSaving && pendingAction !== 'resume'}
              >
                Fortsett
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="m-0 text-sm font-semibold">Stem på Post-it-lapper</h3>
            {stickyRows.length === 0 && (
              <div className="rounded-md border border-dashed border-[var(--ax-border-neutral-subtle)] px-3 py-2 text-xs text-[var(--ax-text-subtle)]">
                Fant ingen Post-it-lapper i valgt seksjon.
              </div>
            )}
            {stickyRows.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-2 rounded-md border border-[var(--ax-border-neutral-subtle)] px-2 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" title={row.label}>
                    {row.label}
                  </div>
                  <div className="text-xs text-[var(--ax-text-subtle)]">
                    Totalt: {row.totalVotes} • Dine: {row.myVotes}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="xsmall"
                    variant="tertiary"
                    onClick={() => onRemoveVote(row.id)}
                    loading={isSaving && pendingAction === 'remove-vote'}
                    disabled={row.myVotes <= 0 || (isSaving && pendingAction !== 'remove-vote')}
                  >
                    -
                  </Button>
                  <Button
                    size="xsmall"
                    variant="secondary"
                    onClick={() => onAddVote(row.id)}
                    loading={isSaving && pendingAction === 'add-vote'}
                    disabled={!row.canVote || (isSaving && pendingAction !== 'add-vote')}
                  >
                    +
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <Alert variant="error" size="small">
          {error}
        </Alert>
      )}
    </Modal.Body>

    <Modal.Footer>
      {!sessionExists && (
        <Button
          size="small"
          onClick={onStart}
          loading={isSaving && pendingAction === 'start'}
          disabled={isSaving && pendingAction !== 'start'}
        >
          Start prikkvotering
        </Button>
      )}

      {sessionExists && (
        <>
          <Button
            size="small"
            variant="secondary"
            onClick={onSortSectionByVotes}
            loading={isSaving && pendingAction === 'sort'}
            disabled={isSaving && pendingAction !== 'sort'}
          >
            Sorter seksjon etter stemmer
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={onEnd}
            loading={isSaving && pendingAction === 'end'}
            disabled={isSaving && pendingAction !== 'end'}
          >
            Avslutt votering
          </Button>
          <Button
            size="small"
            variant="danger"
            onClick={onClear}
            loading={isSaving && pendingAction === 'clear'}
            disabled={isSaving && pendingAction !== 'clear'}
          >
            Nullstill
          </Button>
        </>
      )}

      <Button size="small" variant="tertiary" onClick={onClose}>
        Lukk
      </Button>
    </Modal.Footer>
  </Modal>
)

export default CanvasDotVotingModal
