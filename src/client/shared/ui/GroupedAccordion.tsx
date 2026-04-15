/**
 * GroupedAccordion
 *
 * Wraps Aksel Accordion with the project's standard sidebar styling
 * (bg-white-soft background, rounded corners, overflow clip) and adds
 * support for controlled open state + per-item extra content slots.
 *
 * ─── Flat usage (no groups) ─────────────────────────────────────────────────
 *   <GroupedAccordion
 *     label="Velg hendelse"
 *     options={flatOptions}
 *     selectedOptions={selected}
 *     onToggleSelected={handleToggle}
 *   />
 *
 * ─── Grouped usage ──────────────────────────────────────────────────────────
 *   <GroupedAccordion
 *     groups={[
 *       { key: 'dato', label: 'Dato', options: [...] },
 *       {
 *         key: 'hendelser',
 *         label: 'Hendelser',
 *         options: [],
 *         emptyPlaceholder: 'Hent hendelsesdetaljer',
 *       },
 *     ]}
 *     selectedOptions={groupByFields}
 *     onToggleSelected={handleToggle}
 *   />
 *
 * ─── Controlled open state ──────────────────────────────────────────────────
 *   <GroupedAccordion
 *     groups={groups}
 *     openItems={openAccordions}
 *     onOpenChange={(key, open) =>
 *       setOpenAccordions((prev) => ({ ...prev, [key]: open }))
 *     }
 *     selectedOptions={selected}
 *     onToggleSelected={handleToggle}
 *   />
 *
 * ─── Extra content inside an item (e.g. search field) ───────────────────────
 *   <GroupedAccordion
 *     groups={groups}
 *     selectedOptions={selected}
 *     onToggleSelected={handleToggle}
 *     renderItemContent={(key) =>
 *       key === 'hendelsesdetaljer' ? <SearchField /> : null
 *     }
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

  /**
   * Controlled open state keyed by group key.
   * When provided, the accordion items are fully controlled.
   */
  openItems?: Record<string, boolean>

  /**
   * Called when an item is opened or closed (controlled mode).
   */
  onOpenChange?: (key: string, open: boolean) => void

  /**
   * Render extra content at the top of an item's content area (before the option list).
   * Return null/undefined to render nothing for that item.
   */
  renderItemContent?: (key: string) => React.ReactNode

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
  openItems,
  onOpenChange,
  renderItemContent,
  size = 'small',
  indent = false,
}: GroupedAccordionProps) {
  // Build the list of groups to render
  const resolvedGroups: OptionGroup[] = groups
    ? groups
    : [{ key: '__flat__', label: label ?? '', options: options ?? [] }]

  return (
    <Accordion
      size={size}
      indent={indent}
      className={`${styles.accordion} bg-(--inn-bg-white-soft) rounded-(--ax-radius-8) overflow-hidden border border-(--ax-border-neutral-subtleA)`}
    >
      {resolvedGroups.map((group) => {
        // Count how many options in this group are selected
        const selectedCount = group.options.filter((o) => selectedOptions.includes(o.value)).length
        const headerLabel = selectedCount > 0 ? `${group.label} (${selectedCount})` : group.label

        // Controlled vs uncontrolled open state
        const itemProps =
          openItems !== undefined && onOpenChange
            ? {
                open: openItems[group.key] ?? false,
                onOpenChange: (open: boolean) => onOpenChange(group.key, open),
              }
            : { defaultOpen: false }

        return (
          <Accordion.Item key={group.key} {...itemProps}>
            <Accordion.Header>{headerLabel}</Accordion.Header>
            <Accordion.Content>
              {renderItemContent?.(group.key)}
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
