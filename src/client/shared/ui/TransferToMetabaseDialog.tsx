import { useEffect, useState } from 'react'
import { Alert, Button, Link, Modal, Select, Switch } from '@navikt/ds-react'
import { ExternalLink } from 'lucide-react'
import type { Website } from '../types/website.ts'
import { fetchWebsites } from '../api/websiteApi.ts'

type TransferToMetabaseDialogProps = {
  open: boolean
  onClose: () => void
  sqlText: string
  sourceWebsiteId?: string
}

const getMetabaseQuestionUrl = (): string => {
  const isDevEnvironment = typeof window !== 'undefined' && window.location.hostname.includes('.dev.nav.no')
  return isDevEnvironment
    ? 'https://metabase.ansatt.dev.nav.no/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7ImxpYi90eXBlIjoibWJxbC9xdWVyeSIsImRhdGFiYXNlIjo1Njg2LCJzdGFnZXMiOlt7ImxpYi90eXBlIjoibWJxbC5zdGFnZS9uYXRpdmUiLCJuYXRpdmUiOiIiLCJ0ZW1wbGF0ZS10YWdzIjp7fX1dfSwiZGlzcGxheSI6InRhYmxlIiwidmlzdWFsaXphdGlvbl9zZXR0aW5ncyI6e30sInR5cGUiOiJxdWVzdGlvbiJ9'
    : 'https://metabase.ansatt.nav.no/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7ImxpYi90eXBlIjoibWJxbC9xdWVyeSIsImRhdGFiYXNlIjoxNTQ4LCJzdGFnZXMiOlt7ImxpYi90eXBlIjoibWJxbC5zdGFnZS9uYXRpdmUiLCJuYXRpdmUiOiIiLCJ0ZW1wbGF0ZS10YWdzIjp7fX1dfSwiZGlzcGxheSI6InRhYmxlIiwidmlzdWFsaXphdGlvbl9zZXR0aW5ncyI6e30sInR5cGUiOiJxdWVzdGlvbiJ9'
}

const TransferToMetabaseDialog = ({ open, onClose, sqlText, sourceWebsiteId }: TransferToMetabaseDialogProps) => {
  const [websites, setWebsites] = useState<Website[]>([])
  const [websiteId, setWebsiteId] = useState('')
  const [loadingWebsites, setLoadingWebsites] = useState(false)
  const [showSqlCode, setShowSqlCode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCopied(false)
    setError(null)
    setShowSqlCode(false)
    setWebsiteId(sourceWebsiteId ?? '')
  }, [open, sourceWebsiteId])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    const run = async () => {
      setLoadingWebsites(true)
      try {
        const items = await fetchWebsites()
        if (cancelled) return
        setWebsites(items)
        if (sourceWebsiteId && items.some((item) => item.id === sourceWebsiteId)) {
          setWebsiteId(sourceWebsiteId)
        }
      } catch {
        if (!cancelled) setWebsites([])
      } finally {
        if (!cancelled) setLoadingWebsites(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [open, sourceWebsiteId])

  const sqlForCopy = websiteId ? sqlText.replace(/\{\{\s*website_id\s*\}\}/g, websiteId) : sqlText

  const handleCopy = async () => {
    if (!sqlForCopy.trim()) {
      setError('Ingen SQL å kopiere')
      return
    }
    try {
      await navigator.clipboard.writeText(sqlForCopy)
      setCopied(true)
      setError(null)
    } catch {
      setError('Klarte ikke å kopiere SQL')
    }
  }

  return (
    <Modal open={open} onClose={onClose} header={{ heading: 'Overfør til Metabase' }} width="small">
      <Modal.Body>
        <div className="flex flex-col gap-4">
          <Select
            label="Vis resultatet for nettsiden"
            value={websiteId}
            onChange={(event) => setWebsiteId(event.target.value)}
            size="small"
            disabled={loadingWebsites}
          >
            <option value="">Bruk SQL-filter</option>
            {websites.map((website) => (
              <option key={website.id} value={website.id}>
                {website.name}
              </option>
            ))}
          </Select>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="small" variant="secondary" onClick={() => void handleCopy()}>
              {copied ? 'Kopiert!' : 'Kopier til Metabase'}
            </Button>
            <Link
              href={getMetabaseQuestionUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm"
            >
              Åpne Metabase <ExternalLink size={14} />
            </Link>
          </div>

          <Switch checked={showSqlCode} onChange={(event) => setShowSqlCode(event.target.checked)} size="small">
            Vis SQL-kode
          </Switch>

          {showSqlCode && (
            <pre className="max-h-64 overflow-auto rounded border border-[var(--ax-border-neutral-subtle)] bg-[var(--ax-bg-neutral-soft)] p-3 text-xs">
              {sqlForCopy}
            </pre>
          )}

          {error && (
            <Alert variant="error" size="small">
              {error}
            </Alert>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Lukk
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export default TransferToMetabaseDialog
