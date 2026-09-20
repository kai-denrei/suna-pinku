import { expect, test } from 'vitest'
import { fragmentMessage, messageCharacters, wrapMessage } from '../src/play/message'

test('fragments decode Unicode and spaces exactly once without treating plus as a query separator', () => {
  expect(fragmentMessage('#Thinking%20of%20you')).toBe('Thinking of you')
  expect(fragmentMessage('#%E6%84%9B%20%E7%8C%AB%20%F0%9F%92%97')).toBe('愛 猫 💗')
  expect(fragmentMessage('#A+B%2520C')).toBe('A+B%20C')
  expect(fragmentMessage('#%3Cscript%3Ealert(1)%3C%2Fscript%3E')).toBe('<script>alert(1)</script>')
})

test('empty, malformed and excessive input is harmless; greetings have a grapheme-safe limit', () => {
  expect(fragmentMessage('')).toBeUndefined()
  expect(fragmentMessage('#%20%0A')).toBeUndefined()
  expect(fragmentMessage('#%E0%A4')).toBeUndefined()
  expect(fragmentMessage('#' + 'x'.repeat(8192))).toBeUndefined()
  expect(fragmentMessage('#one%0Atwo%00%20three')).toBe('one two three')
  const emoji = '👩🏽‍🚀'
  expect(fragmentMessage('#' + encodeURIComponent(emoji.repeat(121)))).toBe(emoji.repeat(120))
})

test('wrapping preserves words when possible and splits unspaced scripts without splitting emoji', () => {
  const measure = (text: string) => messageCharacters(text).length
  expect(wrapMessage('Thinking of you', measure, 11)).toEqual(['Thinking of', 'you'])
  expect(wrapMessage('愛猫犬柔術姫亀海鯨', measure, 4)).toEqual(['愛猫犬柔', '術姫亀海', '鯨'])
  expect(wrapMessage('👩🏽‍🚀👩🏽‍🚀👩🏽‍🚀', measure, 2)).toEqual(['👩🏽‍🚀👩🏽‍🚀', '👩🏽‍🚀'])
})
