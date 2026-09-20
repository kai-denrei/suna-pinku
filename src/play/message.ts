export const MAX_MESSAGE_LENGTH = 120
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
export const messageCharacters = (text: string) => [...segmenter.segment(text)].map(part => part.segment)

export function fragmentMessage(hash: string): string | undefined {
  if (!hash || hash.length > 8192) return
  let text: string
  try { text = decodeURIComponent(hash.replace(/^#/, '')) } catch { return }
  text = text.replace(/\s+/gu, ' ').replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, '').trim()
  return messageCharacters(text).slice(0, MAX_MESSAGE_LENGTH).join('') || undefined
}

export function wrapMessage(text: string, measure: (text: string) => number, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word
    if (measure(candidate) <= width) { line = candidate; continue }
    if (line) { lines.push(line); line = '' }
    // Break long words and scripts without spaces at grapheme boundaries.
    for (const character of messageCharacters(word)) {
      if (line && measure(line + character) > width) { lines.push(line); line = '' }
      line += character
    }
  }
  if (line) lines.push(line)
  return lines
}
