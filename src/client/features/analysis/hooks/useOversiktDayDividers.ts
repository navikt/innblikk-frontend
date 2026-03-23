import { useEffect, useRef, useState, useCallback } from 'react'
import { differenceInCalendarDays, format } from 'date-fns'
import { nb } from 'date-fns/locale'
import type { ILineChartProps } from '@fluentui/react-charting'
import type { Granularity } from '../model/types.ts'

export const useOversiktDayDividers = (
  submittedGranularity: Granularity,
  submittedDateRange: { startDate: Date; endDate: Date } | null,
  chartData: ILineChartProps['data'] | null,
  chartKey: string,
  processedSeriesDataLength: number,
) => {
  const chartWrapperRef = useRef<HTMLDivElement | null>(null)
  const [dayDividerXs, setDayDividerXs] = useState<number[]>([])

  const isMultiDayHourly =
    submittedGranularity === 'hour' &&
    !!submittedDateRange &&
    differenceInCalendarDays(submittedDateRange.endDate, submittedDateRange.startDate) >= 1

  useEffect(() => {
    if (!isMultiDayHourly) {
      const t = window.setTimeout(() => setDayDividerXs([]), 0)
      return () => window.clearTimeout(t)
    }

    let rafId: number | null = null
    let observer: MutationObserver | null = null

    const readDayDividerPositions = () => {
      const wrapper = chartWrapperRef.current
      if (!wrapper) return

      const ticks = Array.from(wrapper.querySelectorAll<SVGGElement>('[class*="xAxis"] .tick'))
      if (!ticks.length) return

      const positions = ticks
        .map((tick) => {
          const transform = tick.getAttribute('transform') || ''
          const match = transform.match(/translate\(([-\d.]+),?\s*([-\d.]*)\)/)
          if (!match) return NaN
          const x = Number(match[1])
          return Number.isFinite(x) ? x : NaN
        })
        .filter((value) => !Number.isNaN(value))
        .sort((a, b) => a - b)

      setDayDividerXs((prev) => {
        if (
          prev.length === positions.length &&
          prev.every((value, index) => Math.abs(value - positions[index]) < 0.5)
        ) {
          return prev
        }
        return positions
      })
    }

    const scheduleRead = () => {
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        readDayDividerPositions()
      })
    }

    const wrapper = chartWrapperRef.current
    if (wrapper && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => {
        scheduleRead()
      })
      observer.observe(wrapper, {
        childList: true,
        subtree: true,
        attributes: true,
      })
    }

    const immediate = window.setTimeout(scheduleRead, 0)
    const delayed = window.setTimeout(scheduleRead, 150)
    window.addEventListener('resize', scheduleRead)

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
      if (observer) {
        observer.disconnect()
      }
      window.clearTimeout(immediate)
      window.clearTimeout(delayed)
      window.removeEventListener('resize', scheduleRead)
    }
  }, [isMultiDayHourly, chartData, chartKey, processedSeriesDataLength])

  const formatXAxisDateLabel = useCallback(
    (date: Date) => {
      if (submittedGranularity === 'hour') {
        if (isMultiDayHourly) {
          const hourMinute = format(date, 'HH:mm')
          if (hourMinute === '00:00') {
            return format(date, 'd. MMM', { locale: nb })
          }
          return format(date, 'd. MMM HH:mm', { locale: nb })
        }
        return format(date, 'HH:mm')
      }

      if (submittedGranularity === 'week') {
        return `Uke ${format(date, 'w', { locale: nb })}`
      }

      if (submittedGranularity === 'month') {
        return format(date, 'MMM yyyy', { locale: nb })
      }

      return format(date, 'd. MMM', { locale: nb })
    },
    [submittedGranularity, isMultiDayHourly],
  )

  return {
    chartWrapperRef,
    dayDividerXs,
    isMultiDayHourly,
    formatXAxisDateLabel,
  }
}
