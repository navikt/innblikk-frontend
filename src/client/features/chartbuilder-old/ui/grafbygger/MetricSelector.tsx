import { Accordion, Checkbox } from '@navikt/ds-react'
import { useState, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react'
import type { Metric, MetricOption, Filter } from '../../../../shared/types/chart.ts'
import accordionStyles from '../../../../shared/ui/GroupedAccordion.module.css'

interface SummarizeProps {
  metrics: Metric[]
  METRICS: MetricOption[]
  removeMetric: (index: number) => void
  addMetric: (metricFunction: string, initialUpdates?: Partial<Metric>) => void
  filters: Filter[]
  resetSignal?: number
}

const MetricSelector = forwardRef(({ metrics, METRICS, removeMetric, addMetric, resetSignal }: SummarizeProps, ref) => {
  type MetricDropdownOption = {
    id: string
    label: string
    metricFunction: string
    section: string
    column?: string
    alias?: string
    showInMinutes?: boolean
    defaultColumn?: string
    mode: 'preset' | 'function'
  }

  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({})

  const resetConfig = (_silent = false) => {
    const metricsCopy = [...metrics]
    metricsCopy.forEach(() => {
      removeMetric(0)
    })
  }

  useEffect(() => {
    const event = new CustomEvent('summarizeStepStatus', {
      detail: {
        hasUserSelectedMetrics: metrics.length > 0,
      },
    })
    document.dispatchEvent(event)
  }, [metrics])

  useImperativeHandle(ref, () => ({
    resetConfig,
  }))

  useEffect(() => {
    setOpenAccordions({})
  }, [resetSignal])

  const moreMetricGroups = useMemo(() => {
    const presetOptions: MetricDropdownOption[] = [
      {
        id: 'preset_distinct_session_id_unike',
        label: 'Antall unike besøkende',
        metricFunction: 'distinct',
        section: 'Antall',
        column: 'session_id',
        alias: 'Unike_besokende',
        mode: 'preset',
      },
      {
        id: 'preset_distinct_visit_id_okter',
        label: 'Økter / besøk',
        metricFunction: 'distinct',
        section: 'Antall',
        column: 'visit_id',
        alias: 'Okter_besok',
        mode: 'preset',
      },
      {
        id: 'preset_count_sidevisninger',
        label: 'Antall sidevisninger',
        metricFunction: 'count',
        section: 'Antall',
        alias: 'Antall_sidevisninger',
        mode: 'preset',
      },
      {
        id: 'preset_count_hendelser',
        label: 'Antall hendelser',
        metricFunction: 'count',
        section: 'Antall',
        alias: 'Antall_hendelser',
        mode: 'preset',
      },
      {
        id: 'preset_andel_totale_besokende',
        label: 'Andel av totale besøkende',
        metricFunction: 'andel',
        section: 'Andel',
        column: 'session_id',
        alias: 'Andel_av_totale_besokende',
        mode: 'preset',
      },
      {
        id: 'preset_percentage_besokende_pa_side',
        label: 'Andel av besøkende på side',
        metricFunction: 'percentage',
        section: 'Andel',
        column: 'session_id',
        alias: 'Andel_av_besokende_pa_side',
        mode: 'preset',
      },
      {
        id: 'preset_percentage_hendelser_pa_side',
        label: 'Andel av hendelser på side',
        metricFunction: 'percentage',
        section: 'Andel',
        column: 'event_id',
        alias: 'Andel_av_hendelser_pa_side',
        mode: 'preset',
      },
      {
        id: 'preset_bounce_rate',
        label: 'Fluktrate',
        metricFunction: 'bounce_rate',
        section: 'Andel',
        column: 'visit_id',
        alias: 'Fluktrate',
        mode: 'preset',
      },
      {
        id: 'preset_average_visit_duration_min',
        label: 'Besøksvarighet i minutter',
        metricFunction: 'average',
        section: 'Tid',
        column: 'visit_duration',
        alias: 'Gjennomsnittlig_besokstid_minutter',
        showInMinutes: true,
        mode: 'preset',
      },
      {
        id: 'preset_average_visit_duration_sec',
        label: 'Besøksvarighet i sekunder',
        metricFunction: 'average',
        section: 'Tid',
        column: 'visit_duration',
        alias: 'Gjennomsnittlig_besokstid_sekunder',
        showInMinutes: false,
        mode: 'preset',
      },
    ]

    const getFunctionSection = (metricValue: string): string => {
      if (['count', 'distinct', 'count_where', 'sum'].includes(metricValue)) return 'Antall'
      if (['percentage', 'andel', 'bounce_rate'].includes(metricValue)) return 'Andel'
      if (['average', 'median'].includes(metricValue)) return 'Tid'
      return 'Avansert'
    }

    const functionOptions: MetricDropdownOption[] = METRICS.map((metric) => ({
      id: `function_${metric.value}`,
      label: metric.label,
      metricFunction: metric.value,
      section: getFunctionSection(metric.value),
      defaultColumn: metric.value === 'percentage' || metric.value === 'andel' ? 'session_id' : undefined,
      mode: 'function',
    }))

    const allOptions = [...presetOptions, ...functionOptions]
    const sectionOrder = ['Antall', 'Andel', 'Tid', 'Avansert']

    return sectionOrder
      .map((section) => ({
        key: section.toLowerCase().replace(/\s+/g, '_'),
        label: section,
        options: allOptions.filter((option) => option.section === section),
      }))
      .filter((section) => section.options.length > 0)
  }, [METRICS])

  const findMetricIndex = (functionType: string, column?: string, alias?: string, checkMinutes?: boolean): number => {
    return metrics.findIndex(
      (metric) =>
        metric.function === functionType &&
        metric.column === column &&
        (alias === undefined || metric.alias === alias) &&
        (checkMinutes === undefined || metric.showInMinutes === checkMinutes),
    )
  }

  const isDropdownOptionSelected = (option: MetricDropdownOption): boolean => {
    if (option.mode === 'function') {
      return metrics.some((metric) => {
        if (metric.function !== option.metricFunction) return false
        // Function-options should only represent "generic" metrics,
        // not preset variants with aliases.
        if (metric.alias) return false
        if (option.defaultColumn) return metric.column === option.defaultColumn
        return true
      })
    }

    return findMetricIndex(option.metricFunction, option.column, option.alias, option.showInMinutes) >= 0
  }

  const selectedDropdownOptions = moreMetricGroups.flatMap((group) =>
    group.options.filter((option) => isDropdownOptionSelected(option)),
  )

  /** Groups shaped for GroupedCombobox */
  const comboboxGroups = useMemo(
    () =>
      moreMetricGroups.map((group) => ({
        key: group.key,
        label: group.label,
        options: group.options.map((o) => ({ label: o.label, value: o.id })),
      })),
    [moreMetricGroups],
  )

  const addConfiguredMetric = (metricType: string, column?: string, alias?: string, showInMinutes?: boolean) => {
    const updates: Partial<Metric> = {}
    if (column) updates.column = column
    if (alias) updates.alias = alias
    if (showInMinutes !== undefined) updates.showInMinutes = showInMinutes
    addMetric(metricType, updates)
  }

  const toggleDropdownMetricOption = (option: MetricDropdownOption) => {
    if (option.mode === 'function') {
      const matchingIndices = metrics
        .map((metric, index) => ({ metric, index }))
        .filter(({ metric }) => {
          if (metric.function !== option.metricFunction) return false
          if (metric.alias) return false
          if (option.defaultColumn) return metric.column === option.defaultColumn
          return true
        })
        .map(({ index }) => index)

      if (matchingIndices.length > 0) {
        ;[...matchingIndices].reverse().forEach((index) => removeMetric(index))
        return
      }

      addMetric(option.metricFunction, option.defaultColumn ? { column: option.defaultColumn } : undefined)
      return
    }

    const existingMetricIndex = findMetricIndex(
      option.metricFunction,
      option.column,
      option.alias,
      option.showInMinutes,
    )

    if (existingMetricIndex >= 0) {
      removeMetric(existingMetricIndex)
      return
    }

    addConfiguredMetric(option.metricFunction, option.column, option.alias, option.showInMinutes)
  }

  return (
    <>
      <div>
        <div>
          <div className="space-y-4 mb-3">
            <div>
              <Accordion
                size="small"
                indent={false}
                className={`${accordionStyles.accordion} bg-(--inn-bg-white-soft) rounded-(--ax-radius-8) overflow-hidden border border-(--ax-border-neutral-subtleA)`}
              >
                {comboboxGroups.map((group) => {
                  const selectedInGroup = group.options.filter((o) =>
                    selectedDropdownOptions.some((s) => s.id === o.value),
                  ).length
                  return (
                    <Accordion.Item
                      key={group.key}
                      open={openAccordions[group.key] ?? false}
                      onOpenChange={(open) => {
                        setOpenAccordions((prev) => ({ ...prev, [group.key]: open }))
                      }}
                    >
                      <Accordion.Header>
                        {selectedInGroup > 0 ? `${group.label} (${selectedInGroup})` : group.label}
                      </Accordion.Header>
                      <Accordion.Content>
                        <ul className="list-none m-0 p-0 flex flex-col gap-1">
                          {group.options.map((option) => (
                            <li key={option.value}>
                              <Checkbox
                                size="small"
                                checked={selectedDropdownOptions.some((o) => o.id === option.value)}
                                onChange={() => {
                                  const found = moreMetricGroups
                                    .flatMap((g) => g.options)
                                    .find((o) => o.id === option.value)
                                  if (found) toggleDropdownMetricOption(found)
                                }}
                              >
                                {option.label}
                              </Checkbox>
                            </li>
                          ))}
                        </ul>
                      </Accordion.Content>
                    </Accordion.Item>
                  )
                })}
              </Accordion>
            </div>
          </div>
        </div>
      </div>
    </>
  )
})

export default MetricSelector
