export interface SleeperPlayer {
  player_id: string
  full_name: string
  first_name?: string
  last_name?: string
  position: string
  fantasy_positions: string[]
  team?: string | null
}

let inMemoryPlayersCache: Record<string, SleeperPlayer> | null = null
const CACHE_KEY = 'sleeper_players_nfl_cache_v2'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export async function fetchSleeperPlayers(): Promise<Record<string, SleeperPlayer>> {
  if (inMemoryPlayersCache) {
    return inMemoryPlayersCache
  }

  // Check sessionStorage / localStorage
  try {
    const cachedStr = typeof window !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null
    if (cachedStr) {
      const parsed = JSON.parse(cachedStr) as { timestamp: number; data: Record<string, SleeperPlayer> }
      if (Date.now() - parsed.timestamp < CACHE_TTL_MS && parsed.data) {
        inMemoryPlayersCache = parsed.data
        return inMemoryPlayersCache
      }
    }
  } catch (e) {
    console.warn('Could not read players cache from localStorage', e)
  }

  // Fetch from Sleeper
  const response = await fetch('https://api.sleeper.app/v1/players/nfl')
  if (!response.ok) {
    throw new Error(`Failed to fetch NFL players database (${response.status})`)
  }

  const raw = (await response.json()) as Record<string, any>
  const streamlined: Record<string, SleeperPlayer> = {}

  for (const [id, item] of Object.entries(raw)) {
    if (!item) continue
    // Only keep players with a valid position or fantasy positions
    const pos = item.position || ''
    const fpos = item.fantasy_positions || (pos ? [pos] : [])
    if (!pos && fpos.length === 0) continue

    const fullName =
      item.full_name ||
      [item.first_name, item.last_name].filter(Boolean).join(' ') ||
      item.search_full_name ||
      `Player ${id}`

    streamlined[id] = {
      player_id: id,
      full_name: fullName,
      first_name: item.first_name,
      last_name: item.last_name,
      position: pos,
      fantasy_positions: fpos,
      team: item.team || null,
    }
  }

  inMemoryPlayersCache = streamlined

  // Try to cache in localStorage
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          data: streamlined,
        }),
      )
    }
  } catch (e) {
    // If quota exceeded, that's okay, in-memory cache is present
    console.warn('Could not persist players to localStorage (likely quota limit)', e)
  }

  return inMemoryPlayersCache
}

export function getPlayerImageUrl(playerId: string, team?: string | null): string {
  // If team defense
  if (team && playerId.toUpperCase() === team.toUpperCase()) {
    return `https://sleepercdn.com/images/v2/teams/${team.toLowerCase()}_logo.png`
  }
  return `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`
}
