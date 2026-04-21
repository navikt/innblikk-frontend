const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const renderInlineMarkdown = (value: string): string => {
  let escaped = escapeHtml(value)
  escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label: string, href: string) => {
    const safeHref = escapeHtml(href)
    const safeLabel = escapeHtml(label)
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`
  })
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  return escaped
}

export const markdownToHtml = (markdown: string): string => {
  const lines = markdown.split(/\r?\n/)
  const html: string[] = []
  let listType: 'ul' | 'ol' | null = null
  const paragraphBuffer: string[] = []

  const closeList = () => {
    if (!listType) return
    html.push(`</${listType}>`)
    listType = null
  }

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return
    const content = paragraphBuffer.map((line) => renderInlineMarkdown(line)).join('<br />')
    html.push(`<p>${content}</p>`)
    paragraphBuffer.length = 0
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      closeList()
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      closeList()
      const level = headingMatch[1].length
      html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`)
      continue
    }

    const unorderedMatch = line.match(/^[-*]\s+(.+)$/)
    if (unorderedMatch) {
      flushParagraph()
      if (listType !== 'ul') {
        closeList()
        html.push('<ul>')
        listType = 'ul'
      }
      html.push(`<li>${renderInlineMarkdown(unorderedMatch[1])}</li>`)
      continue
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/)
    if (orderedMatch) {
      flushParagraph()
      if (listType !== 'ol') {
        closeList()
        html.push('<ol>')
        listType = 'ol'
      }
      html.push(`<li>${renderInlineMarkdown(orderedMatch[1])}</li>`)
      continue
    }

    closeList()
    paragraphBuffer.push(rawLine.trimEnd())
  }

  flushParagraph()
  closeList()
  return html.join('')
}
