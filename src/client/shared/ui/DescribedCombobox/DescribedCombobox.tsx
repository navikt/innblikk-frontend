/**
 * Single-select adaptation of NAV Aksel's combobox Input and FilteredOptionsItem.
 * Source: navikt/aksel, @navikt/core/react/src/form/combobox.
 * Keeps focus on the input while navigating options; adds rich descriptions.
 * Deliberately excludes multi-select, free-text values and private Aksel imports.
 * Aksel's MIT notice is included in LICENSE.
 */
import { forwardRef, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BodyShort, Button, Label, Popover } from '@navikt/ds-react'
import { ChevronDownIcon, ChevronUpIcon } from '@navikt/aksel-icons'
import OptionExplanation from './OptionExplanation.tsx'
import type { DescribedComboboxOption } from './types.ts'
import './DescribedCombobox.css'

export type { DescribedComboboxOption } from './types.ts'

interface DescribedComboboxProps {
  label: string
  description?: ReactNode
  options: DescribedComboboxOption[]
  onSelect: (value: string) => void
  autoFocus?: boolean
  hideLabel?: boolean
  /** Keep search and options together when hosted inside a parent popover. */
  inlineList?: boolean
  onDismiss?: () => void
  onTab?: (backwards: boolean) => boolean
}

/** Searchable option picker: selection calls onSelect, rather than creating chips. */
const DescribedCombobox = forwardRef<HTMLInputElement, DescribedComboboxProps>(
  (
    {
      label,
      description,
      options,
      onSelect,
      autoFocus = false,
      hideLabel = false,
      inlineList = false,
      onDismiss,
      onTab,
    },
    ref,
  ) => {
    const id = useId()
    const listId = `${id}-options`
    const inputRef = useRef<HTMLInputElement>(null)
    const [anchor, setAnchor] = useState<HTMLDivElement | null>(null)
    const [width, setWidth] = useState(0)
    const [dropdownOpen, setOpen] = useState(false)
    const open = inlineList || dropdownOpen
    const [search, setSearch] = useState('')
    const [activeValue, setActiveValue] = useState<string | null>(null)
    const query = search.trim().toLocaleLowerCase('nb')
    const filtered = options.filter((option) =>
      `${option.label} ${option.description ?? ''}`.toLocaleLowerCase('nb').includes(query),
    )
    const activeIndex = filtered.findIndex((option) => option.value === activeValue)
    const activeOption = filtered[activeIndex]
    const optionId = (value: string) => `${id}-option-${encodeURIComponent(value)}`

    const setInputRef = useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      },
      [ref],
    )
    const setAnchorRef = useCallback((node: HTMLDivElement | null) => {
      setAnchor(node)
      setWidth(node?.getBoundingClientRect().width ?? 0)
    }, [])

    useEffect(() => {
      if (!anchor) return
      const observer = new ResizeObserver(([entry]) =>
        setWidth(entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width),
      )
      observer.observe(anchor)
      return () => observer.disconnect()
    }, [anchor])

    useEffect(() => {
      if (open && activeValue) {
        document
          .getElementById(`${id}-option-${encodeURIComponent(activeValue)}`)
          ?.scrollIntoView?.({ block: 'nearest' })
      }
    }, [open, activeValue, id])

    const close = () => {
      setOpen(false)
      setActiveValue(null)
    }
    const select = (option: DescribedComboboxOption) => {
      close()
      setSearch('')
      onSelect(option.value)
    }
    const move = (delta: number) => {
      setOpen(true)
      if (!filtered.length) return
      const index =
        activeIndex === -1
          ? delta < 0
            ? filtered.length - 1
            : 0
          : Math.max(0, Math.min(filtered.length - 1, activeIndex + delta))
      setActiveValue(filtered[index].value)
    }

    const optionsList = (
      <div className="described-combobox__popup">
        {filtered.length === 0 && (
          <BodyShort size="small" role="status" className="described-combobox__empty">
            Ingen filtre funnet. Prøv et annet søkeord.
          </BodyShort>
        )}
        <ul id={listId} role="listbox" aria-label={label} className="described-combobox__options">
          {filtered.map((option) => (
            <li
              key={option.value}
              id={optionId(option.value)}
              role="option"
              tabIndex={-1}
              aria-selected={false}
              aria-label={`${option.label}${option.description ? ` – ${option.description}` : ''}`}
              className="described-combobox__option"
              data-active={activeOption?.value === option.value || undefined}
              onMouseMove={() => setActiveValue(option.value)}
              onPointerDown={(event) => event.preventDefault()}
              onPointerUp={() => select(option)}
            >
              <strong>{option.label}</strong>
              <OptionExplanation description={option.description} example={option.example} />
            </li>
          ))}
        </ul>
      </div>
    )

    return (
      <div className="described-combobox">
        <Label htmlFor={id} size="small" className={hideLabel ? 'sr-only' : undefined}>
          {label}
        </Label>
        {description && (
          <BodyShort size="small" id={`${id}-description`}>
            {description}
          </BodyShort>
        )}
        <div ref={setAnchorRef} className="described-combobox__control">
          <input
            ref={setInputRef}
            id={id}
            className="described-combobox__input"
            type="text"
            role="combobox"
            autoComplete="off"
            autoFocus={autoFocus}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={open && activeOption ? optionId(activeOption.value) : undefined}
            aria-describedby={description ? `${id}-description` : undefined}
            value={search}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={() => {
              if (!inlineList) close()
            }}
            onChange={(event) => {
              setSearch(event.target.value)
              setActiveValue(null)
              setOpen(true)
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              switch (event.key) {
                case 'ArrowDown':
                  event.preventDefault()
                  move(1)
                  break
                case 'ArrowUp':
                  event.preventDefault()
                  move(-1)
                  break
                case 'PageDown':
                case 'PageUp':
                  event.preventDefault()
                  move(event.key === 'PageDown' ? 6 : -6)
                  break
                case 'Home':
                case 'End':
                  if (open && activeOption) {
                    event.preventDefault()
                    setActiveValue(filtered[event.key === 'Home' ? 0 : filtered.length - 1].value)
                  }
                  break
                case 'Enter':
                  if (open) {
                    event.preventDefault()
                    event.stopPropagation()
                    if (activeOption) select(activeOption)
                  }
                  break
                case 'Escape':
                  if (open) {
                    event.preventDefault()
                    event.stopPropagation()
                    setSearch('')
                    close()
                    if (inlineList) onDismiss?.()
                  }
                  break
                case 'Tab':
                  if (inlineList && onTab) {
                    if (onTab(event.shiftKey)) event.preventDefault()
                  }
                  close()
                  break
              }
            }}
          />
          {!inlineList && (
            <Button
              type="button"
              variant="tertiary"
              data-color="neutral"
              size="xsmall"
              tabIndex={-1}
              aria-label={open ? 'Lukk filterlisten' : 'Åpne filterlisten'}
              aria-controls={open ? listId : undefined}
              aria-expanded={open}
              icon={open ? <ChevronUpIcon aria-hidden /> : <ChevronDownIcon aria-hidden />}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                inputRef.current?.focus()
                setOpen(!open)
                setActiveValue(null)
              }}
            />
          )}
        </div>
        {inlineList && optionsList}
        {!inlineList &&
          open &&
          anchor &&
          createPortal(
            <Popover
              open
              anchorEl={anchor}
              onClose={close}
              placement="bottom-start"
              strategy="fixed"
              offset={8}
              style={{ width }}
            >
              {optionsList}
            </Popover>,
            document.body,
          )}
      </div>
    )
  },
)

export default DescribedCombobox
