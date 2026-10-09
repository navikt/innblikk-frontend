import { isFullWidthPath } from './routes.tsx'

describe('isFullWidthPath', () => {
  it('treats every brukergrupper-next page as full width, including the edit route', () => {
    expect(isFullWidthPath('/brukergrupper-next')).toBe(true)
    expect(isFullWidthPath('/brukergrupper-next/ny')).toBe(true)
    expect(isFullWidthPath('/brukergrupper-next/9')).toBe(true)
  })
})
