import { useMemo, useState } from 'react'
import { TOKENS } from '../model/constants'
import type { SentenceState } from '../model/types'
import { findTokenById } from '../utils/tokenUtils'

const DEFAULT_METRIC_TOKEN_ID = TOKENS.find((token) => token.slot === 'metric' && token.value === 'users')?.id ?? null
const EMPTY_ZONE_IDS: Array<string | null> = [DEFAULT_METRIC_TOKEN_ID, null, null, null, null]

export const useSentenceBuilder = () => {
  const [zoneTokenIds, setZoneTokenIds] = useState<Array<string | null>>(EMPTY_ZONE_IDS)

  const sentence = useMemo<SentenceState>(() => {
    const bySlot: SentenceState = {
      metric: '',
      timeBucket: '',
      groupBy: '',
      period: '',
      limit: '',
    }
    const groupByValues: string[] = []

    zoneTokenIds.forEach((tokenId) => {
      if (!tokenId) return
      const token = findTokenById(TOKENS, tokenId)
      if (!token) return
      if (token.slot === 'groupBy') {
        if (token.value === 'none') return
        groupByValues.push(token.value)
        return
      }
      bySlot[token.slot] = token.value
    })
    bySlot.groupBy = groupByValues.join(',')

    return bySlot
  }, [zoneTokenIds])

  const assignTokenToZone = (tokenId: string, zoneIndex?: number) => {
    const token = findTokenById(TOKENS, tokenId)
    if (!token) return

    setZoneTokenIds((prev) => {
      const next = [...prev]
      const existingSameSlotIndexes = prev
        .map((existingTokenId, index) => {
          if (!existingTokenId) return null
          const existingToken = findTokenById(TOKENS, existingTokenId)
          if (!existingToken || existingToken.slot !== token.slot) return null
          return index
        })
        .filter((index): index is number => index !== null)
      const existingSameTokenIndex = prev.findIndex((existingTokenId) => existingTokenId === token.id)

      if (typeof zoneIndex === 'number' && zoneIndex >= 0 && zoneIndex < next.length) {
        if (token.slot !== 'groupBy') {
          existingSameSlotIndexes.forEach((index) => {
            if (index !== zoneIndex) next[index] = null
          })
        } else {
          if (token.value === 'none') {
            existingSameSlotIndexes.forEach((index) => {
              if (index !== zoneIndex) next[index] = null
            })
          } else {
            existingSameSlotIndexes.forEach((index) => {
              const existingTokenId = prev[index]
              if (!existingTokenId) return
              const existingToken = findTokenById(TOKENS, existingTokenId)
              if (existingToken?.slot === 'groupBy' && existingToken.value === 'none' && index !== zoneIndex) {
                next[index] = null
              }
            })
          }
          if (existingSameTokenIndex !== -1 && existingSameTokenIndex !== zoneIndex) {
            next[existingSameTokenIndex] = null
          }
        }
        next[zoneIndex] = token.id
      } else {
        if (token.slot !== 'groupBy') {
          existingSameSlotIndexes.forEach((index) => {
            next[index] = null
          })
        } else {
          if (token.value === 'none') {
            existingSameSlotIndexes.forEach((index) => {
              next[index] = null
            })
          } else {
            existingSameSlotIndexes.forEach((index) => {
              const existingTokenId = prev[index]
              if (!existingTokenId) return
              const existingToken = findTokenById(TOKENS, existingTokenId)
              if (existingToken?.slot === 'groupBy' && existingToken.value === 'none') {
                next[index] = null
              }
            })
          }
          if (existingSameTokenIndex !== -1) {
            next[existingSameTokenIndex] = null
          }
        }
        const firstEmptyIndex = next.findIndex((value) => value === null)
        if (firstEmptyIndex !== -1) {
          next[firstEmptyIndex] = token.id
        } else {
          next[next.length - 1] = token.id
        }
      }

      return next
    })
  }

  const handleDropOnZone = (zoneIndex: number, tokenId?: string | null) => {
    assignTokenToZone(tokenId ?? '', zoneIndex)
  }

  const placeTokenInZone = (zoneIndex: number, tokenId: string) => {
    assignTokenToZone(tokenId, zoneIndex)
  }

  const clearZone = (zoneIndex: number) => {
    setZoneTokenIds((prev) => {
      if (zoneIndex < 0 || zoneIndex >= prev.length) return prev
      const next = [...prev]
      next[zoneIndex] = null
      return next
    })
  }

  const resetSentence = () => {
    setZoneTokenIds(EMPTY_ZONE_IDS)
  }

  return {
    tokens: TOKENS,
    zoneTokenIds,
    sentence,
    handleDropOnZone,
    placeTokenInZone,
    clearZone,
    resetSentence,
  }
}
