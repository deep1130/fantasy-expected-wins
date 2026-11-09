export interface SleeperTransaction {
  transaction_id: string
  type: string
  status: string
  leg: number
  roster_ids: number[]
  adds: Record<string, number> | null
  drops: Record<string, number> | null
  created: number
}

let inMemoryTxCache: Record<string, SleeperTransaction[][]> = {}
let inMemoryStatsCache: Record<string, Record<string, any>[]> = {}
let inMemoryProjCache: Record<string, Record<string, any>[]> = {}

export async function fetchLeagueTransactions(
  leagueId: string,
  totalWeeks: number,
): Promise<SleeperTransaction[][]> {
  const cacheKey = `${leagueId}_${totalWeeks}`
  if (inMemoryTxCache[cacheKey]) {
    return inMemoryTxCache[cacheKey]
  }

  const weekNumbers = Array.from({ length: Math.max(1, totalWeeks) }, (_, i) => i + 1)
  const results = await Promise.all(
    weekNumbers.map(async (week) => {
      try {
        const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/transactions/${week}`)
        if (!res.ok) return []
        return (await res.json()) as SleeperTransaction[]
      } catch {
        return []
      }
    }),
  )

  inMemoryTxCache[cacheKey] = results
  return results
}

export async function fetchAllWeeklyStats(
  season: string,
  totalWeeks: number,
): Promise<Record<string, any>[]> {
  const cacheKey = `${season}_${totalWeeks}`
  if (inMemoryStatsCache[cacheKey]) {
    return inMemoryStatsCache[cacheKey]
  }

  const weekNumbers = Array.from({ length: Math.max(1, totalWeeks) }, (_, i) => i + 1)
  const results = await Promise.all(
    weekNumbers.map(async (week) => {
      try {
        const res = await fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`)
        if (!res.ok) return {}
        return (await res.json()) as Record<string, any>
      } catch {
        return {}
      }
    }),
  )

  inMemoryStatsCache[cacheKey] = results
  return results
}

export async function fetchWeeklyProjections(
  season: string,
  totalWeeks: number,
): Promise<Record<string, any>[]> {
  const cacheKey = `${season}_${totalWeeks}`
  if (inMemoryProjCache[cacheKey]) {
    return inMemoryProjCache[cacheKey]
  }

  const weekNumbers = Array.from({ length: Math.max(1, totalWeeks) }, (_, i) => i + 1)
  const results = await Promise.all(
    weekNumbers.map(async (week) => {
      try {
        const res = await fetch(`https://api.sleeper.app/v1/projections/nfl/regular/${season}/${week}`)
        if (!res.ok) return {}
        return (await res.json()) as Record<string, any>
      } catch {
        return {}
      }
    }),
  )

  inMemoryProjCache[cacheKey] = results
  return results
}
