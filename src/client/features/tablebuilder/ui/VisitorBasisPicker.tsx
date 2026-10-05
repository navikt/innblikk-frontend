import { BodyShort, ReadMore, Select } from '@navikt/ds-react'
import {
  getVisitorBasisOptions,
  resolveVisitorBasis,
  type VisitorBasis,
  type VisitorIdCoverage,
} from '../utils/visitorIdCoverage.ts'

export const VisitorBasisPicker = ({
  value,
  onChange,
  coverage,
}: {
  value: VisitorBasis
  onChange: (value: VisitorBasis) => void
  coverage: VisitorIdCoverage | null
}) => {
  if (!coverage) return null
  const options = getVisitorBasisOptions(coverage)
  if (!options) {
    return (
      <ReadMore header="Hvordan telles besøkende?" size="small">
        <BodyShort size="small">
          Besøkende telles med fingeravtrykk. Samme person er unik innen en måned, og telles på nytt neste måned.
        </BodyShort>
      </ReadMore>
    )
  }
  const selected = resolveVisitorBasis(value, coverage)
  return (
    <div>
      <Select
        label="Tell besøkende med"
        size="small"
        value={selected}
        onChange={(event) => onChange(event.target.value as VisitorBasis)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <ReadMore header="Hva betyr dette?" size="small" className="mt-2">
        <BodyShort size="small">{options.find((option) => option.value === selected)?.description}</BodyShort>
      </ReadMore>
    </div>
  )
}
