import { useEffect, useId, useState, type ReactNode } from 'react'
import { Label, UNSAFE_Combobox } from '@navikt/ds-react'
import { columnValuesSuggestions } from '../../cohortmanager/hooks/useColumnValueSuggestions.ts'

interface UrlPathInputProps {
  websiteId?: string
  value: string
  onChange: (value: string) => void
  onCommit?: (value: string) => void
  label?: string
  description?: ReactNode
  helpText?: ReactNode
  className?: string
}

export default function UrlPathInput({
  websiteId,
  value,
  onChange,
  onCommit,
  label = 'URL',
  description,
  helpText,
  className,
}: UrlPathInputProps) {
  const [search, setSearch] = useState('')
  const inputId = useId()
  const { values, loading, load } = columnValuesSuggestions.useColumnValueSuggestions(websiteId, 'url_path')

  useEffect(() => {
    if (websiteId) load()
  }, [websiteId, load])

  return (
    <div
      className={className}
      onKeyDownCapture={(event) => {
        if (event.key === 'Backspace' && !search && value && event.target instanceof HTMLInputElement) {
          onChange('')
          onCommit?.('')
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.defaultPrevented) event.stopPropagation()
      }}
      onInput={(event) => {
        if (event.target instanceof HTMLInputElement) onChange(event.target.value)
      }}
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).closest('[role="listbox"]')) event.preventDefault()
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onCommit?.(value)
      }}
    >
      {helpText && (
        <div className="flex items-center gap-2 mb-2">
          <Label id={`${inputId}-label`} htmlFor={inputId} size="small">
            {label}
          </Label>
          {helpText}
        </div>
      )}
      <UNSAFE_Combobox
        id={inputId}
        aria-labelledby={helpText ? `${inputId}-label` : undefined}
        label={label}
        hideLabel={Boolean(helpText)}
        description={description}
        size="small"
        options={values}
        value={search}
        onChange={setSearch}
        selectedOptions={search ? [] : value ? [value] : []}
        onToggleSelected={(selected, isSelected) => {
          if (isSelected) {
            onChange(selected)
            onCommit?.(selected)
          } else {
            onChange('')
            onCommit?.('')
          }
        }}
        allowNewValues
        clearButton
        isMultiSelect={false}
        isLoading={loading}
      />
    </div>
  )
}
