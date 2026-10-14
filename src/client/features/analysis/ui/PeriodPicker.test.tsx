import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PeriodPicker from './PeriodPicker.tsx'

describe('PeriodPicker custom dates', () => {
  it.each(['last_7_days', 'custom'])('only commits on apply and discards canceled edits from %s', (period) => {
    const customOption = period === 'custom' ? 'custom-edit' : 'custom'
    const onPeriodChange = vi.fn()
    const onStartDateChange = vi.fn()
    const onEndDateChange = vi.fn()
    render(
      <PeriodPicker
        period={period}
        startDate={new Date(2026, 9, 1)}
        endDate={new Date(2026, 9, 9)}
        onPeriodChange={onPeriodChange}
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('Periode'), { target: { value: customOption } })
    fireEvent.change(screen.getByLabelText('Fra dato'), { target: { value: '02.10.2026' } })
    fireEvent.blur(screen.getByLabelText('Fra dato'))
    expect(onPeriodChange).not.toHaveBeenCalled()
    expect(onStartDateChange).not.toHaveBeenCalled()
    expect(onEndDateChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(onPeriodChange).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Periode'), { target: { value: customOption } })
    expect(screen.getByLabelText('Fra dato')).toHaveValue('01.10.2026')

    fireEvent.change(screen.getByLabelText('Fra dato'), { target: { value: '03.10.2026' } })
    fireEvent.blur(screen.getByLabelText('Fra dato'))
    fireEvent.click(screen.getByRole('button', { name: 'Bruk datoer' }))
    expect(onStartDateChange).toHaveBeenCalledExactlyOnceWith(new Date(2026, 9, 3))
    expect(onEndDateChange).toHaveBeenCalledExactlyOnceWith(new Date(2026, 9, 9))
    expect(onPeriodChange).toHaveBeenCalledExactlyOnceWith('custom')
  })
})
