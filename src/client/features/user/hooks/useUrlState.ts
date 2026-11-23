import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { parseISO } from 'date-fns'
import { getStoredPeriod, savePeriodPreference } from '../../../shared/lib/utils'

export function useUrlState() {
  const [searchParams] = useSearchParams()

  // Initialize state from URL params
  const [startUrl, setStartUrl] = useState<string>(
    () => searchParams.get('urlPath') || searchParams.get('startUrl') || '',
  )

  const [period, setPeriodState] = useState<string>(() => getStoredPeriod(searchParams.get('period')))

  const setPeriod = (newPeriod: string) => {
    setPeriodState(newPeriod)
    savePeriodPreference(newPeriod)
  }

  const fromDateFromUrl = searchParams.get('from')
  const toDateFromUrl = searchParams.get('to')
  const initialCustomStartDate = fromDateFromUrl ? parseISO(fromDateFromUrl) : undefined
  const initialCustomEndDate = toDateFromUrl ? parseISO(toDateFromUrl) : undefined

  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(initialCustomStartDate)
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(initialCustomEndDate)

  const [steps, setSteps] = useState<number>(() => {
    const stepsParam = searchParams.get('steps')
    return stepsParam ? parseInt(stepsParam) : 7
  })

  const [limit, setLimit] = useState<number>(() => {
    const limitParam = searchParams.get('limit')
    return limitParam ? parseInt(limitParam) : 15
  })

  const [limitInput, setLimitInput] = useState<string>(() => {
    const limitParam = searchParams.get('limit')
    return limitParam || '15'
  })

  const [journeyDirection, setJourneyDirection] = useState<string>(() => searchParams.get('direction') || 'forward')

  return {
    startUrl,
    setStartUrl,
    period,
    setPeriod,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    steps,
    setSteps,
    limit,
    setLimit,
    limitInput,
    setLimitInput,
    journeyDirection,
    setJourneyDirection,
    searchParams,
  }
}
