import { describe, expect, it } from 'vitest'
import { formatMinutes } from './lastNightCopy'

describe('formatMinutes', () => {
  it('renders null distinctly from any real duration', () => {
    expect(formatMinutes(null)).toBe('—')
  })

  it('renders whole hours and minutes', () => {
    expect(formatMinutes(420)).toBe('7h 0m')
    expect(formatMinutes(395)).toBe('6h 35m')
  })
})
