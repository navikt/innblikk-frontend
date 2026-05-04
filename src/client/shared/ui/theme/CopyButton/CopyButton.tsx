import { useEffect, useRef, useState } from 'react'
import './CopyButton.css'
import { Button } from '@navikt/ds-react'
import { Copy, Check } from 'lucide-react'

interface CopyButtonProps {
  textToCopy: string
  visible: boolean
}

function CopyButton({ textToCopy, visible }: CopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false)
  const resetTimerRef = useRef<number | null>(null)

  const clearResetTimer = () => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
  }

  const copyToClipboard = async () => {
    clearResetTimer()
    setIsCopied(false)

    try {
      await navigator.clipboard.writeText(textToCopy)
      setIsCopied(true)

      resetTimerRef.current = window.setTimeout(() => {
        setIsCopied(false)
        resetTimerRef.current = null
      }, 2000)
    } catch {
      setIsCopied(false)
    }
  }

  useEffect(() => {
    return () => {
      clearResetTimer()
    }
  }, [])

  if (!visible) return null

  return (
    <Button
      onClick={copyToClipboard}
      id="sql-copy-button"
      icon={isCopied ? <Check size="1.2rem" /> : <Copy size="1.2rem" />}
    >
      {isCopied ? 'Kopiert!' : 'Kopier spørsmålet'}
    </Button>
  )
}

export default CopyButton
