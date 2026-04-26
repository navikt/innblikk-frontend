import type { SlotType, TokenOption } from '../model/types'

export const groupTokensBySlot = (tokens: TokenOption[]) => {
  return tokens.reduce<Record<SlotType, TokenOption[]>>(
    (acc, token) => {
      acc[token.slot].push(token)
      return acc
    },
    {
      metric: [],
      timeBucket: [],
      groupBy: [],
      period: [],
      limit: [],
    },
  )
}

export const findTokenByValue = (tokens: TokenOption[], slot: SlotType, value: string): TokenOption | null => {
  return tokens.find((token) => token.slot === slot && token.value === value) ?? null
}

export const findTokenById = (tokens: TokenOption[], tokenId: string): TokenOption | null => {
  return tokens.find((token) => token.id === tokenId) ?? null
}
