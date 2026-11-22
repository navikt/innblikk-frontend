import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import { Alert, Button, Heading, Link, Modal, Tag } from '@navikt/ds-react'
import { TestFlaskIcon } from '@navikt/aksel-icons'
import type { SavedChart } from '../../../shared/types/savedChart'
import { fetchWebsites } from '../../../shared/api/websiteApi'
import { getChartWebsiteIds } from '../utils/chartTransferWebsites'
import {
  buildTransferChart,
  CHART_IMPORT_PATH,
  transferEnvironments,
  TRANSFER_CHANNEL,
  type TransferEnvironment,
} from '../utils/chartTransfer'

export default function ExportChartDialog({
  chart,
  websiteId,
  target,
  onClose,
  onSaved,
}: {
  chart: SavedChart
  websiteId?: string
  target: TransferEnvironment
  onClose: () => void
  onSaved: (dashboardId: number) => void
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const headingId = useId()
  const [requestId] = useState(() => crypto.randomUUID())
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const readyRef = useRef(false)
  const targetOrigin = transferEnvironments[target].origin
  const closeAfterSave = useEffectEvent((dashboardId: number) => {
    onSaved(dashboardId)
    onClose()
  })
  const params = new URLSearchParams({ origin: window.location.origin, requestId })

  useEffect(() => {
    readyRef.current = false
    let active = true
    const sendChart = async () => {
      try {
        const payload = buildTransferChart(chart, websiteId)
        const sourceIds = getChartWebsiteIds(payload)
        if (sourceIds.length > 0) {
          payload.sourceWebsites = (await fetchWebsites())
            .filter((website) => sourceIds.includes(website.id))
            .map(({ id, name, domain }) => ({ id, name, domain }))
        }
        if (active) {
          iframeRef.current?.contentWindow?.postMessage(
            { channel: TRANSFER_CHANNEL, type: 'chart', requestId, chart: payload },
            targetOrigin,
          )
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Kunne ikke legge til grafen.')
      }
    }
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== targetOrigin || event.source !== iframeRef.current?.contentWindow) return
      const message = event.data
      if (
        !message ||
        typeof message !== 'object' ||
        !('channel' in message) ||
        message.channel !== TRANSFER_CHANNEL ||
        !('requestId' in message) ||
        message.requestId !== requestId ||
        !('type' in message)
      )
        return
      if (message.type === 'ready' && !readyRef.current) {
        readyRef.current = true
        setError(null)
        void sendChart()
      } else if (message.type === 'saving' && 'saving' in message && typeof message.saving === 'boolean') {
        setSaving(message.saving)
      } else if (message.type === 'saved' && readyRef.current) {
        if (
          !('dashboardId' in message) ||
          typeof message.dashboardId !== 'number' ||
          !Number.isSafeInteger(message.dashboardId) ||
          message.dashboardId <= 0
        ) {
          setSaving(false)
          setError(
            `Grafen er lagret i ${target}, men lenken til dashboardet mangler. Åpne ${target} for å finne grafen.`,
          )
          return
        }
        closeAfterSave(message.dashboardId)
      }
    }
    window.addEventListener('message', handleMessage)
    const timer = window.setTimeout(() => {
      if (!readyRef.current) setError(`Kunne ikke åpne importen i ${target}. Logg inn i ${target} og prøv igjen.`)
    }, 20000)
    return () => {
      active = false
      window.removeEventListener('message', handleMessage)
      window.clearTimeout(timer)
    }
  }, [chart, websiteId, target, targetOrigin, requestId, attempt])

  return (
    <Modal open onClose={() => !saving && onClose()} aria-labelledby={headingId} width={900}>
      <Modal.Header>
        <div className="flex items-center gap-3 flex-wrap">
          <Heading level="1" size="medium" id={headingId}>
            Legg til i Innblikk {target}
          </Heading>
          <Tag variant="moderate" size="small" data-color="meta-purple" icon={<TestFlaskIcon aria-hidden />}>
            Beta
          </Tag>
        </div>
      </Modal.Header>
      <Modal.Body>
        {error && (
          <Alert variant="error" role="alert" className="mb-4">
            {error}{' '}
            <Link href={targetOrigin} target="_blank" rel="noopener noreferrer">
              Åpne {target} for å logge inn
            </Link>
            <Button
              variant="secondary"
              size="small"
              className="ml-4"
              disabled={saving}
              onClick={() => {
                setError(null)
                setAttempt((value) => value + 1)
              }}
            >
              Prøv igjen
            </Button>
          </Alert>
        )}
        <iframe
          key={attempt}
          ref={iframeRef}
          title={`Velg team og dashboard i ${target}`}
          src={`${targetOrigin}${CHART_IMPORT_PATH}?${params}`}
          className="w-full border-0 min-h-[550px]"
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Avbryt
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
