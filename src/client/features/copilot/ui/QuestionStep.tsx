import { Button, Heading, Textarea, Alert } from '@navikt/ds-react'
import { Copy, Check } from 'lucide-react'

interface QuestionStepProps {
  question: string
  copiedPrompt: boolean
  onQuestionChange: (value: string) => void
  onCopyPrompt: () => void
  onOpenCopilot: () => void
}

export default function QuestionStep({
  question,
  copiedPrompt,
  onQuestionChange,
  onCopyPrompt,
  onOpenCopilot,
}: QuestionStepProps) {
  return (
    <section className="rounded-lg border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-default)] p-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ax-bg-accent-moderate)] text-[var(--ax-text-accent)] font-semibold">
          1
        </span>
        <Heading level="2" size="small">
          Skriv spørsmålet ditt
        </Heading>
      </div>

      <Textarea
        label="Hva vil du finne ut?"
        description="F.eks. «Hvor mange besøkte forsiden på nav.no forrige uke?»"
        value={question}
        onChange={(e) => onQuestionChange(e.target.value)}
        minRows={3}
        resize
      />

      <Alert variant="info" size="small" className="mt-4" inline>
        Bruk kopier-knappen under. I Copilot lim inn og kopierer svaret du får.
      </Alert>

      <div className="mt-4">
        <Button
          variant="primary"
          icon={copiedPrompt ? <Check size={18} /> : <Copy size={18} />}
          onClick={() => {
            onCopyPrompt()
            onOpenCopilot()
          }}
          disabled={!question.trim()}
        >
          {copiedPrompt ? 'Kopiert – åpner Copilot' : 'Kopier og åpne Copilot'}
        </Button>
      </div>
    </section>
  )
}
