import { Button, Modal, TextField } from '@navikt/ds-react'

type CanvasTimerModalProps = {
  open: boolean
  onClose: () => void
  minutesInput: string
  onMinutesInputChange: (value: string) => void
  onStart: () => void
  onStop: () => void
  onPause: () => void
  onResume: () => void
  onAdjustMinusOneMinute: () => void
  onAdjustPlusOneMinute: () => void
  isRunning: boolean
  isPaused: boolean
  timerLabel: string | null
  isSaving: boolean
  pendingAction: 'start' | 'stop' | 'pause' | 'resume' | 'adjust-minus' | 'adjust-plus' | null
  error: string | null
}

const CanvasTimerModal = ({
  open,
  onClose,
  minutesInput,
  onMinutesInputChange,
  onStart,
  onStop,
  onPause,
  onResume,
  onAdjustMinusOneMinute,
  onAdjustPlusOneMinute,
  isRunning,
  isPaused,
  timerLabel,
  isSaving,
  pendingAction,
  error,
}: CanvasTimerModalProps) => (
  <Modal
    open={open}
    onClose={onClose}
    header={{ heading: 'Fasilitator-nedteller' }}
    width="small"
    aria-label="Sett fasilitator-nedteller"
  >
    <Modal.Body className="space-y-4">
      {!timerLabel && (
        <TextField
          label="Minutter"
          type="number"
          min={1}
          max={240}
          value={minutesInput}
          onChange={(event) => onMinutesInputChange(event.target.value)}
        />
      )}
      {timerLabel && (
        <div className="space-y-2">
          <div className="rounded-md border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] px-3 py-3 text-base font-semibold text-[var(--ax-text-default)]">
            {isRunning
              ? `Aktiv nedtelling: ${timerLabel}`
              : isPaused
                ? `Pauset nedtelling: ${timerLabel}`
                : `Siste nedtelling: ${timerLabel}`}
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
        </div>
      )}
      {error && <p className="text-sm text-[var(--ax-text-danger)]">{error}</p>}
    </Modal.Body>
    <Modal.Footer>
      {!timerLabel && (
        <Button
          size="small"
          onClick={onStart}
          loading={isSaving && pendingAction === 'start'}
          disabled={isSaving && pendingAction !== 'start'}
        >
          Start nedtelling
        </Button>
      )}
      {(isRunning || isPaused) && (
        <Button
          size="small"
          variant="secondary"
          onClick={onStop}
          loading={isSaving && pendingAction === 'stop'}
          disabled={isSaving && pendingAction !== 'stop'}
        >
          Stopp nedtelling
        </Button>
      )}
      {!isRunning && timerLabel && !isPaused && (
        <Button
          size="small"
          variant="secondary"
          onClick={onStop}
          loading={isSaving && pendingAction === 'stop'}
          disabled={isSaving && pendingAction !== 'stop'}
        >
          Fjern nedtelling
        </Button>
      )}
      <Button size="small" variant="tertiary" onClick={onClose}>
        Lukk
      </Button>
    </Modal.Footer>
  </Modal>
)

export default CanvasTimerModal
