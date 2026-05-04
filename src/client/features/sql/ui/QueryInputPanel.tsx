import { Button, Alert, Heading, BodyLong } from '@navikt/ds-react'
import Editor from '@monaco-editor/react'
import { X } from 'lucide-react'

interface QueryInputPanelProps {
  query: string
  editorHeight: number
  oldTableWarning: boolean
  showUpgradeSuccess: boolean
  validateError: string | null
  showValidation: boolean
  formatSuccess: boolean
  shareSuccess: boolean
  estimating: boolean
  onQueryChange: (value: string) => void
  onEditorHeightChange: (height: number) => void
  onUpgradeTables: () => void
  onDismissUpgradeSuccess: () => void
  onFormat: () => void
  onValidate: () => void
  onEstimateCost: () => void
  onShare: () => void
  onDismissValidation: () => void
}

export default function QueryInputPanel({
  query,
  editorHeight,
  oldTableWarning,
  showUpgradeSuccess,
  validateError,
  showValidation,
  formatSuccess,
  shareSuccess,
  estimating,
  onQueryChange,
  onEditorHeightChange,
  onUpgradeTables,
  onDismissUpgradeSuccess,
  onFormat,
  onValidate,
  onEstimateCost,
  onShare,
  onDismissValidation,
}: QueryInputPanelProps) {
  return (
    <div>
      {/* Old Table Warning & Fix */}
      {oldTableWarning && (
        <Alert variant="warning" className="mb-4">
          <Heading level="3" size="small" spacing>
            Utdaterte tabeller oppdaget
          </Heading>
          <BodyLong>
            Spørringen din bruker gamle tabellnavn. Vi anbefaler å bytte til de nye <code>umami_views</code> tabellene:
            <ul className="list-disc list-inside mt-2 text-sm">
              <li>
                <code>public_website_event</code> &rarr; <code>umami_views.event</code>
              </li>
              <li>
                <code>public_session</code> &rarr; <code>umami_views.session</code>
              </li>
            </ul>
          </BodyLong>
          <div className="mt-3">
            <Button size="small" variant="primary" onClick={onUpgradeTables}>
              Oppdater SQL-spørringen til nye tabeller
            </Button>
          </div>
        </Alert>
      )}

      {/* Success Message */}
      {showUpgradeSuccess && (
        <Alert variant="success" className="mb-4 relative">
          <Heading level="3" size="small" spacing>
            Tabeller oppgradert!
          </Heading>
          <BodyLong>
            SQL-spørringen er nå oppdatert til å bruke nye tabeller (<code>umami_views</code>).
          </BodyLong>
          <button
            onClick={onDismissUpgradeSuccess}
            className="absolute right-3 top-3 p-1 hover:bg-[var(--ax-bg-neutral-soft)] rounded text-[var(--ax-text-default)]"
            aria-label="Lukk melding"
            type="button"
          >
            <X size={20} />
          </button>
        </Alert>
      )}

      <label className="block font-medium mb-2" htmlFor="sql-editor">
        SQL-spørring
      </label>
      <div
        className="border rounded resize-y overflow-auto"
        style={{ position: 'relative', isolation: 'isolate', minHeight: 100, maxHeight: 600, height: editorHeight }}
        onMouseUp={(e) => {
          const target = e.currentTarget as HTMLDivElement
          onEditorHeightChange(target.offsetHeight)
        }}
      >
        <Editor
          height={editorHeight}
          defaultLanguage="sql"
          value={query}
          onChange={(value) => onQueryChange(value || '')}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            fixedOverflowWidgets: true,
            stickyScroll: { enabled: false },
            lineNumbersMinChars: 4,
            glyphMargin: false,
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        <Button size="small" variant="secondary" type="button" onClick={onFormat}>
          {formatSuccess ? '✓ Formatert' : 'Formater'}
        </Button>
        <Button size="small" variant="secondary" type="button" onClick={onValidate}>
          Valider
        </Button>
        <Button size="small" variant="secondary" type="button" onClick={onEstimateCost} loading={estimating}>
          Estimer kostnad
        </Button>
        <Button size="small" variant="secondary" type="button" onClick={onShare}>
          {shareSuccess ? '✓ Kopiert' : 'Del'}
        </Button>
      </div>
      {showValidation && validateError && (
        <div
          className={`relative rounded px-3 py-2 mt-2 text-sm ${validateError === 'SQL er gyldig!' ? 'bg-[var(--ax-bg-success-soft)] border border-[var(--ax-border-success-subtle)] text-[var(--ax-text-success)]' : 'bg-[var(--ax-bg-danger-soft)] border border-[var(--ax-border-danger-subtle)] text-[var(--ax-text-danger)]'}`}
        >
          <span>{validateError}</span>
          <button
            type="button"
            aria-label="Lukk"
            onClick={onDismissValidation}
            className="absolute right-2 top-2 font-bold cursor-pointer"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
