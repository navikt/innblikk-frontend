import { isFullWidthPath } from './routes.tsx'

describe('isFullWidthPath', () => {
  it('treats every brukergrupper-next page as full width, including the edit route', () => {
    expect(isFullWidthPath('/brukergrupper-next')).toBe(true)
    expect(isFullWidthPath('/brukergrupper-next/ny')).toBe(true)
    expect(isFullWidthPath('/brukergrupper-next/9')).toBe(true)
  })

  it('treats the sidegrupper list and its editor routes as full width', () => {
    expect(isFullWidthPath('/sidegrupper')).toBe(true)
    expect(isFullWidthPath('/sidegrupper/ny')).toBe(true)
    expect(isFullWidthPath('/sidegrupper/abc-123')).toBe(true)
  })
})
