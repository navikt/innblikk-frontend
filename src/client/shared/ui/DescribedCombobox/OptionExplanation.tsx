import type { OptionExplanationProps } from './types.ts'
import './OptionExplanation.css'

/** Identical explanation in picker options and cards; URL anatomy is visual-only. */
export default function OptionExplanation({ description, example }: OptionExplanationProps) {
  if (!description && !example) return null
  const start = example?.url.indexOf(example.highlight) ?? -1
  return (
    <div className="option-explanation">
      {description && <p className="option-explanation__description">{description}</p>}
      {example && (
        <code className="option-explanation__example" aria-hidden="true">
          {start === -1 ? (
            example.url
          ) : (
            <>
              {example.url.slice(0, start)}
              <mark>{example.highlight}</mark>
              {example.url.slice(start + example.highlight.length)}
            </>
          )}
        </code>
      )}
    </div>
  )
}
