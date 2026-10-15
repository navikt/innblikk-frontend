import { useEffect, useState, type ReactNode } from 'react'
import { UNSAFE_Combobox } from '@navikt/ds-react'
import { columnValuesSuggestions } from '../../cohortmanager/hooks/useColumnValueSuggestions.ts'

interface UrlPathInputProps {
  websiteId?: string
  value: string
  onChange: (value: string) => void
  onCommit?: (value: string) => void
  label?: string
  description?: ReactNode
  className?: string
}

export default function UrlPathInput({
  websiteId,
  value,
  onChange,
  onCommit,
  label = 'URL',
  description,
  className,
}: UrlPathInputProps) {
  const [search, setSearch] = useState('')
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
      <UNSAFE_Combobox
        label={label}
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
