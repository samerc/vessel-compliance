import { highlightParts } from '../../../../shared/wikiSearch'

/** Searched words highlighted in a title or snippet */
export default function Highlighted({
  text,
  words
}: {
  text: string
  words: string[]
}): React.JSX.Element {
  return (
    <>
      {highlightParts(text, words).map((p, i) =>
        p.hit ? (
          <mark key={i} className="wiki-hit">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  )
}
