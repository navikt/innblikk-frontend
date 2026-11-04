export interface UrlExample {
  url: string
  highlight: string
}

export interface OptionExplanationProps {
  description?: string
  example?: UrlExample
}

export interface DescribedComboboxOption extends OptionExplanationProps {
  value: string
  label: string
}
