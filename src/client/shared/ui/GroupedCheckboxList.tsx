/**
 * GroupedCheckboxList
 *
 * A flat, always-visible grouped checkbox list — no accordion collapsing.
 * Each group gets a small section heading and a list of checkboxes.
 *
 * Usage:
 *   <GroupedCheckboxList
 *     groups={[
 *       { key: 'antall', label: 'Antall', options: [{ label: 'Unike besøkende', value: 'distinct_session_id' }] },
 *     ]}
 *     selectedOptions={selected}
 *     onToggleSelected={handleToggle}
 *   />
 */

import { Checkbox } from '@navikt/ds-react';

export type CheckboxListOption = { label: string; value: string };

export type CheckboxListGroup = {
  key: string;
  label: string;
  options: CheckboxListOption[];
  emptyPlaceholder?: string;
};

interface GroupedCheckboxListProps {
  groups: CheckboxListGroup[];
  selectedOptions: string[];
  onToggleSelected: (value: string, isSelected: boolean) => void;
}

export function GroupedCheckboxList({
  groups,
  selectedOptions,
  onToggleSelected,
}: GroupedCheckboxListProps) {
  return (
    <div className="space-y-4">
      {groups.map(group => (
        <div key={group.key}>
          <p className="text-xs font-semibold text-(--ax-text-subtle) uppercase tracking-wide mb-1">
            {group.label}
          </p>
          {group.options.length === 0 && group.emptyPlaceholder ? (
            <p className="text-xs text-(--ax-text-subtle) italic">{group.emptyPlaceholder}</p>
          ) : (
            <ul className="list-none m-0 p-0 flex flex-col gap-1">
              {group.options.map(option => (
                <li key={option.value}>
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
        </div>
      ))}
    </div>
  );
}

export default GroupedCheckboxList;
