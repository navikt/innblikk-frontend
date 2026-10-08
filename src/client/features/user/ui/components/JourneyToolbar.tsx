import { Button } from '@navikt/ds-react'
import { CheckmarkIcon, DownloadIcon, PaperplaneIcon } from '@navikt/aksel-icons'

interface JourneyToolbarProps {
  onDownloadCSV: () => void
  onDownloadExcel: () => void
  onShare: () => void
  copySuccess: boolean
}

export default function JourneyToolbar({ onDownloadCSV, onDownloadExcel, onShare, copySuccess }: JourneyToolbarProps) {
  return (
    <div className="flex gap-2 p-3 bg-[var(--ax-bg-neutral-soft)] border-b">
      <Button size="small" variant="secondary" onClick={onDownloadCSV}>
        <DownloadIcon fontSize="1rem" />
        Last ned CSV
      </Button>
      <Button size="small" variant="secondary" onClick={onDownloadExcel}>
        <DownloadIcon fontSize="1rem" />
        Last ned Excel
      </Button>
      <Button size="small" variant="secondary" onClick={onShare}>
        {copySuccess ? <CheckmarkIcon fontSize="1rem" /> : <PaperplaneIcon fontSize="1rem" />}
        {copySuccess ? 'Lenke kopiert!' : 'Del rapport'}
      </Button>
    </div>
  )
}
