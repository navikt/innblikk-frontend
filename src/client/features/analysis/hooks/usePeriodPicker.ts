import { useState, useCallback } from 'react'

export const usePeriodPicker = (onPeriodChange: (period: string) => void) => {
  const [isDateModalOpen, setIsDateModalOpen] = useState(false)

  const handlePeriodChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value
      if (value === 'custom' || value === 'custom-edit') {
        onPeriodChange('custom')
        setIsDateModalOpen(true)
      } else {
        onPeriodChange(value)
      }
    },
    [onPeriodChange],
  )

  const closeDateModal = useCallback(() => {
    setIsDateModalOpen(false)
  }, [])

  return {
    isDateModalOpen,
    handlePeriodChange,
    closeDateModal,
  }
}
