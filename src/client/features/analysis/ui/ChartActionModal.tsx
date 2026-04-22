import React, { useState } from 'react'
import { Modal, Button } from '@navikt/ds-react'
import { ZoomPlusIcon, DownloadIcon, LinkIcon, CheckmarkIcon } from '@navikt/aksel-icons'
import { Code2, Copy, Pencil, Trash2 } from 'lucide-react'
import { Events, type KopierLenkeProperties } from '@navikt/analytics-types'
import type { ChartActionModalProps } from '../model/types.ts'
import { buildEditorUrl, generateShareUrl, downloadChartCsv } from '../utils/chartActions.ts'

const ChartActionModal: React.FC<ChartActionModalProps> = ({
  open,
  onClose,
  chart,
  websiteId,
  filters,
  domain,
  data,
  dashboardTitle,
  onEditChart,
  onDeleteChart,
  onCopyChart,
  copyActionLabel = 'Legg til i dashboard',
  addToDashboardHref = '/grafbygger',
  onMoveChart,
  hideUsageActions = false,
  replaceExploreActionWithSqlEditor = false,
}) => {
  const [copyFeedback, setCopyFeedback] = useState(false)

  if (!chart.sql && !hideUsageActions) return null

  const handleOpenInNewTab = () => {
    window.open(generateShareUrl(chart, websiteId, filters, domain, dashboardTitle), '_blank')
    onClose()
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(generateShareUrl(chart, websiteId, filters, domain, dashboardTitle))
      const properties: KopierLenkeProperties = { seksjon: 'graf-deling' }
      window.umami?.track(Events.KOPIER_LENKE, properties)
      setCopyFeedback(true)
      setTimeout(() => setCopyFeedback(false), 2000)
    } catch (err) {
      console.error('Failed to copy', err)
    }
  }

  const handleDownloadCsv = () => {
    if (!data || data.length === 0) return
    downloadChartCsv(data, chart.title)
    onClose()
  }

  const handleOpenInSqlEditor = () => {
    window.location.href = buildEditorUrl(chart, websiteId, filters, domain)
    onClose()
  }

  const handleEdit = () => {
    onClose()
    onEditChart?.()
  }

  const handleDelete = () => {
    onClose()
    onDeleteChart?.()
  }

  const handleCopy = () => {
    onClose()
    onCopyChart?.()
  }

  const handleMove = () => {
    onClose()
    onMoveChart?.()
  }

  const actionButtonClass = '!w-full !justify-start'
  const iconSlotClass = 'inline-flex w-5 justify-center'

  return (
    <Modal open={open} onClose={onClose} header={{ heading: 'Hva vil du gjøre med grafen?' }} width="medium">
      <Modal.Body>
        <div className="p-2 pb-4 flex flex-col gap-4 text-left">
          <div className="pb-2">
            <p className="text-sm text-[var(--ax-text-subtle)]">Valgt graf</p>
            <p className="text-base font-medium text-[var(--ax-text-default)]">{chart.title}</p>
          </div>
          <div className={`grid grid-cols-1 ${hideUsageActions ? '' : 'md:grid-cols-2'} gap-4`}>
            {!hideUsageActions && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ax-text-subtle)]">
                  Bruk og del
                </p>
                {!replaceExploreActionWithSqlEditor && (
                  <Button variant="secondary" onClick={handleOpenInNewTab} className={actionButtonClass}>
                    <span className="inline-flex items-center gap-2">
                      <span className={iconSlotClass}>
                        <ZoomPlusIcon aria-hidden />
                      </span>
                      <span>Utforsk grafen</span>
                    </span>
                  </Button>
                )}
                <Button variant="secondary" onClick={handleCopyLink} className={actionButtonClass}>
                  <span className="inline-flex items-center gap-2">
                    <span className={iconSlotClass}>
                      {copyFeedback ? <CheckmarkIcon aria-hidden /> : <LinkIcon aria-hidden />}
                    </span>
                    <span>{copyFeedback ? 'Lenke kopiert!' : 'Del grafen'}</span>
                  </span>
                </Button>
                {replaceExploreActionWithSqlEditor && (
                  <Button variant="secondary" onClick={handleOpenInSqlEditor} className={actionButtonClass}>
                    <span className="inline-flex items-center gap-2">
                      <span className={iconSlotClass}>
                        <Code2 aria-hidden size={16} />
                      </span>
                      <span>Åpne i SQL-editor</span>
                    </span>
                  </Button>
                )}
                {data && data.length > 0 && (
                  <Button variant="secondary" onClick={handleDownloadCsv} className={actionButtonClass}>
                    <span className="inline-flex items-center gap-2">
                      <span className={iconSlotClass}>
                        <DownloadIcon aria-hidden />
                      </span>
                      <span>Last ned CSV</span>
                    </span>
                  </Button>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ax-text-subtle)]">Administrer</p>
              {onCopyChart && (
                <Button variant="secondary" onClick={handleCopy} className={actionButtonClass}>
                  <span className="inline-flex items-center gap-2">
                    <span className={iconSlotClass}>
                      <Copy aria-hidden size={16} />
                    </span>
                    <span>{copyActionLabel}</span>
                  </span>
                </Button>
              )}
              {!onCopyChart && (
                <Button
                  as="a"
                  href={addToDashboardHref}
                  variant="secondary"
                  onClick={onClose}
                  className={actionButtonClass}
                >
                  <span className="inline-flex items-center gap-2">
                    <span className={iconSlotClass}>
                      <Copy aria-hidden size={16} />
                    </span>
                    <span>Legg til i dashboard</span>
                  </span>
                </Button>
              )}
              {onEditChart && (
                <Button variant="secondary" onClick={handleEdit} className={actionButtonClass}>
                  <span className="inline-flex items-center gap-2">
                    <span className={iconSlotClass}>
                      <Pencil aria-hidden size={16} />
                    </span>
                    <span>Rediger graf</span>
                  </span>
                </Button>
              )}
              {onMoveChart && (
                <Button variant="secondary" onClick={handleMove} className={actionButtonClass}>
                  <span className="inline-flex items-center gap-2">
                    <span className={iconSlotClass}>
                      <Copy aria-hidden size={16} />
                    </span>
                    <span>Flytt til annen fane</span>
                  </span>
                </Button>
              )}
              {onDeleteChart && (
                <Button variant="secondary" onClick={handleDelete} className={actionButtonClass}>
                  <span className="inline-flex items-center gap-2">
                    <span className={iconSlotClass}>
                      <Trash2 aria-hidden size={16} />
                    </span>
                    <span>Slett graf</span>
                  </span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </Modal.Body>
    </Modal>
  )
}

export default ChartActionModal
