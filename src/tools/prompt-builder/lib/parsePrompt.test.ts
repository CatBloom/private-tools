import { describe, expect, it } from 'vitest'
import { parsePrompt } from './parsePrompt'
import { applyNotation } from './notation'

describe('parsePrompt', () => {
  it('splits on comma and assigns weight 0 to plain tokens', () => {
    expect(parsePrompt('AAAA,BBBB,{{CCCC}}')).toEqual([
      { text: 'AAAA', weight: 0 },
      { text: 'BBBB', weight: 0 },
      { text: 'CCCC', weight: 2 },
    ])
  })

  it('trims surrounding whitespace around tokens and separators', () => {
    expect(parsePrompt('[[dark]] , {light}')).toEqual([
      { text: 'dark', weight: -2 },
      { text: 'light', weight: 1 },
    ])
  })

  it('treats mixed leading brackets as weight 0', () => {
    expect(parsePrompt('{[mixed]}')).toEqual([{ text: 'mixed', weight: 0 }])
  })

  it('clamps deeply nested weight to the notation limit', () => {
    expect(parsePrompt('{{{{{{seven}}}}}}')).toEqual([{ text: 'seven', weight: 5 }])
    expect(parsePrompt('[[[[[[seven]]]]]]')).toEqual([{ text: 'seven', weight: -5 }])
  })

  it('discards blank tokens produced by empty comma segments', () => {
    expect(parsePrompt(',,  ,')).toEqual([])
  })

  it('discards tokens that become empty after stripping brackets', () => {
    expect(parsePrompt('{}')).toEqual([])
    expect(parsePrompt('[[]]')).toEqual([])
  })

  it('does not allow commas inside brackets to split a token', () => {
    expect(parsePrompt('{{aaa,bbb}}')).toEqual([
      { text: 'aaa', weight: 2 },
      { text: 'bbb', weight: 0 },
    ])
  })

  it('ignores trailing brackets when determining weight', () => {
    expect(parsePrompt('{cat]')).toEqual([{ text: 'cat', weight: 1 }])
    expect(parsePrompt('cat}')).toEqual([{ text: 'cat', weight: 0 }])
  })

  it('leaves unsupported notations as raw text', () => {
    expect(parsePrompt('1.5::text::')).toEqual([{ text: '1.5::text::', weight: 0 }])
    expect(parsePrompt('(text:1.3)')).toEqual([{ text: '(text:1.3)', weight: 0 }])
  })

  it('preserves internal newlines while trimming outer whitespace', () => {
    expect(parsePrompt(' \na\nb\n ')).toEqual([{ text: 'a\nb', weight: 0 }])
  })

  it('does not split on newlines', () => {
    expect(parsePrompt('a\nb,c')).toEqual([
      { text: 'a\nb', weight: 0 },
      { text: 'c', weight: 0 },
    ])
  })

  it('round-trips with applyNotation for positive and negative weight', () => {
    expect(parsePrompt(applyNotation('cat', 3))[0]).toEqual({ text: 'cat', weight: 3 })
    expect(parsePrompt(applyNotation('dog', -2))[0]).toEqual({ text: 'dog', weight: -2 })
  })
})
