import { Button, Heading, Textarea, Alert, HelpText } from '@navikt/ds-react'
import { PlayIcon } from 'lucide-react'

type ValidationState = { status: 'idle' | 'valid' | 'invalid'; message: string }

interface SqlStepProps {
  sql: string
  validation: ValidationState
  estimating: boolean
  estimate: { totalBytesProcessedGB?: number | string } | null
  costUSD: number
  processedGB: number
  isExpensive: boolean
  loading: boolean
  hasRun: boolean
  needsRun: boolean
  onSqlChange: (value: string) => void
  onSqlPaste: (value: string) => void
  onRun: () => void
}

export default function SqlStep({
  sql,
  validation,
  estimating,
  estimate,
  costUSD,
  processedGB,
  isExpensive,
  loading,
  hasRun,
  needsRun,
  onSqlChange,
  onSqlPaste,
  onRun,
}: SqlStepProps) {
  return (
    <section className="rounded-lg border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ax-bg-accent-moderate)] text-[var(--ax-text-accent)] font-semibold">
          2
        </span>
        <Heading level="2" size="small">
          Lim inn svaret fra Copilot
        </Heading>
      </div>

      <Textarea
        label="Lim inn Copilot-svaret:"
        value={sql}
        onChange={(e) => onSqlChange(e.target.value)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData('text')
          if (!pasted) return
          e.preventDefault()
          onSqlPaste(pasted)
        }}
        minRows={4}
        maxRows={10}
        resize
        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}
      />

      {validation.status === 'invalid' && (
        <Alert variant="warning" size="small" className="mt-3" inline>
          {validation.message}
        </Alert>
      )}

      {estimating && <div className="mt-3 text-sm text-[var(--ax-text-subtle)]">Sjekker …</div>}

      {!estimating && estimate && validation.status === 'valid' && (
        <Alert variant={isExpensive ? 'warning' : 'success'} size="small" className="mt-3" inline>
          <span className="inline-flex items-center gap-2">
            {isExpensive ? 'Denne spørringen er tung å kjøre' : 'Ser bra ut'}
            <HelpText title="Om kostnad">
              {isExpensive
                ? `Spørringen leser ${processedGB.toFixed(1)} GB og koster omtrent $${costUSD.toFixed(2)}. Prøv en kortere tidsperiode eller færre sider for å gjøre den lettere.`
                : `Spørringen leser ${processedGB.toFixed(1)} GB og koster omtrent $${costUSD.toFixed(2)} – godt innenfor det som regnes som trygt å kjøre.`}
            </HelpText>
          </span>
        </Alert>
      )}

      <div className="mt-4">
        {needsRun && (
          <Button
            variant="primary"
            icon={<PlayIcon size={18} />}
            onClick={onRun}
            loading={loading}
            disabled={!sql.trim() || validation.status === 'invalid'}
          >
            {hasRun ? 'Oppdater graf' : 'Vis graf'}
          </Button>
        )}
      </div>
    </section>
  )
}
