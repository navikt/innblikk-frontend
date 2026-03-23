/**
 * GroupedAccordion
 *
 * Replaces GroupedCombobox. Renders an Aksel Accordion where each OptionGroup
 * becomes one Accordion.Item, and the options inside are rendered as Checkboxes.
 *
 * ─── Flat usage (no groups) ─────────────────────────────────────────────────
 *   <GroupedAccordion
 *     label="Velg hendelse"
 *     options={flatOptions}
 *     selectedOptions={selected}
 *     onToggleSelected={handleToggle}
 *   />
 *
 *   This wraps all options in a single Accordion.Item labelled by `label`.
 *
 * ─── Grouped usage ──────────────────────────────────────────────────────────
 *   <GroupedAccordion
 *     groups={[
 *       { key: 'dato', label: 'Dato', options: [...] },
 *       { key: 'hendelser', label: 'Hendelser', options: [], emptyPlaceholder: 'Hent hendelsesdetaljer' },
 *     ]}
 *     selectedOptions={groupByFields}
 *     onToggleSelected={handleToggle}
 *   />
 */

import { Accordion, Checkbox } from '@navikt/ds-react'
import styles from './GroupedAccordion.module.css'

export type AccordionOption = { label: string; value: string }

export type OptionGroup = {
  /** Unique key — used to generate a stable React key */
  key: string
  /** Section heading shown in the accordion header */
  label: string
  /** The selectable options inside this group */
  options: AccordionOption[]
  /**
   * When the group has no options yet, show this text instead of an empty list.
   * Non-interactive — purely informational.
   */
  emptyPlaceholder?: string
}

interface GroupedAccordionProps {
  /**
   * Flat option list — use this when you don't need grouping.
   * All options are placed under a single accordion item labelled by `label`.
   * Mutually exclusive with `groups`.
   */
  options?: AccordionOption[]

  /**
   * Human-readable label for the single accordion item when using `options` (flat mode).
   * Required in flat mode; ignored in grouped mode.
   */
  label?: string

  /**
   * Grouped option list.
   * Mutually exclusive with `options`.
   */
  groups?: OptionGroup[]

  /** Currently selected option values */
  selectedOptions: string[]

  /** Called when the user toggles a checkbox */
  onToggleSelected: (value: string, isSelected: boolean) => void

  /** Aksel Accordion size */
  size?: 'large' | 'medium' | 'small'

  /** Whether to indent accordion content */
  indent?: boolean
}

export function GroupedAccordion({
  options,
  label,
  groups,
  selectedOptions,
  onToggleSelected,
  size = 'small',
  indent = false,
}: GroupedAccordionProps) {
  // Build the list of groups to render
  const resolvedGroups: OptionGroup[] = groups
    ? groups
    : [{ key: '__flat__', label: label ?? '', options: options ?? [] }]

  return (
    <Accordion size={size} indent={indent} className={styles.accordion}>
      {resolvedGroups.map((group) => {
        // Count how many options in this group are selected
        const selectedCount = group.options.filter((o) => selectedOptions.includes(o.value)).length

        const headerLabel = selectedCount > 0 ? `${group.label} (${selectedCount})` : group.label

        return (
          <Accordion.Item key={group.key} defaultOpen>
            <Accordion.Header>{headerLabel}</Accordion.Header>
            <Accordion.Content>
              {group.options.length === 0 && group.emptyPlaceholder ? (
                <p className={styles.emptyPlaceholder}>{group.emptyPlaceholder}</p>
              ) : (
                <ul className={styles.optionList}>
                  {group.options.map((option) => (
                    <li key={option.value} className={styles.optionItem}>
                      <Checkbox
                        size="small"
                        checked={selectedOptions.includes(option.value)}
                        onChange={(e) => onToggleSelected(option.value, e.target.checked)}
                      >
                        {option.label}
                      </Checkbox>
                    </li>
                  ))}
                </ul>
              )}
            </Accordion.Content>
          </Accordion.Item>
        )
      })}
    </Accordion>
  )
}

export default GroupedAccordion
