/**
 * GroupedCombobox
 *
 * A thin wrapper around Aksel's UNSAFE_Combobox that adds:
 *  - Grouped options via injected non-selectable `__group__<key>` header items
 *  - Optional non-selectable `__fetch__<key>` placeholder items for empty groups
 *  - Controlled search state (optional — pass `searchValue`/`onSearchChange` to
 *    manage externally, or omit to let the component manage it internally)
 *  - Automatic filtering by search term when `groups` is used
 *  - CSS scoping so group-header styles don't leak
 *
 * ─── Flat usage (no groups) ─────────────────────────────────────────────────
 *   <GroupedCombobox
 *     label="Velg hendelse"
 *     options={flatOptions}
 *     selectedOptions={selected}
 *     onToggleSelected={handleToggle}
 *     isMultiSelect
 *   />
 *
 * ─── Grouped usage ──────────────────────────────────────────────────────────
 *   <GroupedCombobox
 *     label="Velg grupperinger"
 *     groups={[
 *       { key: 'dato', label: 'Dato', options: [...] },
 *       { key: 'hendelser', label: 'Hendelser', options: [], emptyPlaceholder: 'Hent hendelsesdetaljer' },
 *     ]}
 *     selectedOptions={groupByFields}
 *     onToggleSelected={handleToggle}
 *     isMultiSelect
 *   />
 */

import { useMemo, useState } from 'react';
import { UNSAFE_Combobox } from '@navikt/ds-react';
import type { ComboboxProps } from '@navikt/ds-react';
import styles from './GroupedCombobox.module.css';

export type ComboboxOption = { label: string; value: string };

export type OptionGroup = {
  /** Unique key — used as the suffix for the `__group__<key>` sentinel value */
  key: string;
  /** Section heading shown in the list */
  label: string;
  /** The selectable options inside this group */
  options: ComboboxOption[];
  /**
   * When the group has no options yet, inject a `__fetch__<key>` placeholder
   * row with this text instead of hiding the group entirely.
   * The placeholder is non-selectable; clicking it is a no-op.
   */
  emptyPlaceholder?: string;
};

// Props we forward straight to UNSAFE_Combobox (minus the ones we manage ourselves)
type PassThroughProps = Omit<
  ComboboxProps,
  | 'options'
  | 'filteredOptions'
  | 'selectedOptions'
  | 'onToggleSelected'
  | 'value'
  | 'onChange'
  | 'onClear'
  | 'className'
>;

type GroupedComboboxProps = PassThroughProps & {
  /**
   * Flat option list — use this when you don't need grouping.
   * Mutually exclusive with `groups`.
   */
  options?: ComboboxOption[];

  /**
   * Grouped option list — the component will inject `__group__` header items
   * and handle filtering automatically.
   * Mutually exclusive with `options`.
   */
  groups?: OptionGroup[];

  /** Currently selected option values */
  selectedOptions: string[];

  /** Called when the user selects or deselects an option */
  onToggleSelected: (value: string, isSelected: boolean) => void;

  /**
   * Controlled search value. If provided alongside `onSearchChange`, search
   * state lives in the parent. If omitted, the component manages it internally.
   */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
};

const SENTINEL_PREFIXES = ['__group__', '__fetch__'] as const;

function isSentinel(value: string) {
  return SENTINEL_PREFIXES.some(p => value.startsWith(p));
}

export function GroupedCombobox({
  options,
  groups,
  selectedOptions,
  onToggleSelected,
  searchValue: externalSearch,
  onSearchChange,
  placeholder,
  ...rest
}: GroupedComboboxProps) {
  const [internalSearch, setInternalSearch] = useState('');

  const isControlledSearch = externalSearch !== undefined && onSearchChange !== undefined;
  const searchValue = isControlledSearch ? externalSearch : internalSearch;

  const handleSearchChange = (val: string | undefined) => {
    const next = val ?? '';
    if (isControlledSearch) {
      onSearchChange!(next);
    } else {
      setInternalSearch(next);
    }
  };

  // ── Flat mode ──────────────────────────────────────────────────────────────
  if (!groups) {
    return (
      <div className={styles.wrapper}>
        <UNSAFE_Combobox
          {...rest}
          options={options ?? []}
          selectedOptions={selectedOptions}
          onToggleSelected={(value, isSelected) => {
            if (!isSentinel(value)) onToggleSelected(value, isSelected);
          }}
          placeholder={placeholder}
        />
      </div>
    );
  }

  // ── Grouped mode ───────────────────────────────────────────────────────────

  /** All real (non-sentinel) options as a flat list — needed for UNSAFE_Combobox's `options` prop */
  const allOptions: ComboboxOption[] = useMemo(
    () => groups.flatMap(g => g.options),
    [groups]
  );

  /**
   * The filtered list Aksel will render, with group-header sentinels injected.
   * Rebuilt whenever the search term or groups change.
   */
  const filteredOptions: ComboboxOption[] = useMemo(() => {
    const searchLower = searchValue.toLowerCase();
    const result: ComboboxOption[] = [];

    for (const group of groups) {
      if (group.options.length === 0 && group.emptyPlaceholder) {
        // Show the group header + placeholder only when not searching
        if (!searchLower) {
          result.push({ label: group.label, value: `__group__${group.key}` });
          result.push({ label: group.emptyPlaceholder, value: `__fetch__${group.key}` });
        }
        continue;
      }

      const matches = group.options.filter(
        o => !searchLower || o.label.toLowerCase().includes(searchLower)
      );
      if (matches.length === 0) continue;

      result.push({ label: group.label, value: `__group__${group.key}` });
      for (const o of matches) result.push(o);
    }

    return result;
  }, [groups, searchValue]);

  return (
    <div className={styles.wrapper}>
      <UNSAFE_Combobox
        {...rest}
        options={allOptions}
        filteredOptions={filteredOptions}
        selectedOptions={selectedOptions}
        value={searchValue}
        onChange={handleSearchChange}
        onClear={() => handleSearchChange('')}
        onToggleSelected={(value, isSelected) => {
          if (!isSentinel(value)) onToggleSelected(value, isSelected);
        }}
        placeholder={placeholder}
      />
    </div>
  );
}

export default GroupedCombobox;
