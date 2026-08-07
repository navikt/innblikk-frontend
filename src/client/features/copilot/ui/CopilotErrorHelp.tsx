import { Alert, BodyLong, Button, Heading, Link, ReadMore } from '@navikt/ds-react'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { RESEARCHOPS_SLACK_URL } from '../model/constants'

interface CopilotErrorHelpProps {
  error: string
  sql: string
}

export default function CopilotErrorHelp({ error, sql }: CopilotErrorHelpProps) {
  const [copied, setCopied] = useState(false)

  const copyError = () => {
    const message = `Denne SQL-spørringen feilet:\n\n${sql}\n\nFeilmeldingen jeg fikk:\n${error}\n\nKan du rette spørringen så den kjører?`
    void navigator.clipboard.writeText(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <Alert variant="warning" className="mb-4">
      <Heading level="3" size="small" spacing>
        Huffamei, her gikk noe skeis
      </Heading>
      <BodyLong spacing>
        Ingen fare. Kopier feilmeldingen og gå tilbake til Copilot-chatten. Be om et nytt svar, og lim det inn i steg 2.
      </BodyLong>

      <Button
        size="small"
        variant="primary"
        icon={copied ? <Check size={18} /> : <Copy size={18} />}
        onClick={copyError}
      >
        {copied ? 'Feilmeldingen er kopiert' : 'Kopier feilmeldingen'}
      </Button>

      <ReadMore header="Vis feilmeldingen" size="small" className="mt-3">
        <pre
          className="bg-[var(--ax-bg-neutral-soft)] border border-[var(--ax-border-neutral-subtle)] rounded p-3 text-xs font-mono whitespace-pre-wrap"
          style={{ margin: 0 }}
        >
          {error}
        </pre>
      </ReadMore>

      <div style={{ marginTop: '1.5rem' }}>
        <BodyLong size="small">
          Står du fast? Spør{' '}
          <Link href={RESEARCHOPS_SLACK_URL} target="_blank" rel="noopener noreferrer">
            Team ResearchOps på Slack (#researchops)
          </Link>
          .
        </BodyLong>
      </div>
    </Alert>
  )
}
