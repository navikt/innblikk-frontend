import { Button } from '@navikt/ds-react'
import { Download, Share2, Check } from 'lucide-react'

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
        <Download size={16} />
        Last ned CSV
      </Button>
      <Button size="small" variant="secondary" onClick={onDownloadExcel}>
        <Download size={16} />
        Last ned Excel
      </Button>
      <Button size="small" variant="secondary" onClick={onShare}>
        {copySuccess ? <Check size={16} /> : <Share2 size={16} />}
        {copySuccess ? 'Lenke kopiert!' : 'Del rapport'}
      </Button>
    </div>
  )
}
