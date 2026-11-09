import type { LeagueData, SleeperMatchup } from './sleeper'
import type { SleeperPlayer } from './sleeperPlayers'

export interface WrongChoice {
  week: number
  starterId: string
  starterName: string
  starterPosition: string
  starterPoints: number
  starterTeam?: string | null
  benchId: string
  benchName: string
  benchPosition: string
  benchPoints: number
  benchTeam?: string | null
  pointsGained: number
  newTotalPoints: number
  originalPoints: number
  h2hFlipped: boolean
  medianFlipped: boolean
  winsGained: number
  oppRosterId: number
  oppTeamName: string
  oppPoints: number
  whoLosesH2H: string | null
  whoLosesMedian: string | null
}

export interface TeamBlunderSummary {
  rosterId: number
  teamName: string
  ownerName: string
  avatarUrl: string | null
  actualWins: number
  actualLosses: number
  actualTies: number
  potentialWins: number
  potentialLosses: number
  totalWinsGained: number
  wrongChoices: WrongChoice[]
}

function isSlotEligible(slotType: string, playerPositions: string[]): boolean {
  if (!slotType) return false
  const upperSlot = slotType.toUpperCase()
  const upperPos = playerPositions.map((p) => p.toUpperCase())

  if (upperSlot === 'FLEX') {
    return upperPos.some((p) => ['RB', 'WR', 'TE'].includes(p))
  }
  if (upperSlot === 'SUPER_FLEX' || upperSlot === 'SF') {
    return upperPos.some((p) => ['QB', 'RB', 'WR', 'TE'].includes(p))
  }
  if (upperSlot === 'WRRB_FLEX' || upperSlot === 'W_R') {
    return upperPos.some((p) => ['RB', 'WR'].includes(p))
  }
  if (upperSlot === 'REC_FLEX' || upperSlot === 'WRTE') {
    return upperPos.some((p) => ['WR', 'TE'].includes(p))
  }
  if (upperSlot === 'IDP_FLEX') {
    return upperPos.some((p) => ['DL', 'LB', 'DB'].includes(p))
  }

  return upperPos.includes(upperSlot)
}

export function computeLineupBlunders(
  leagueData: LeagueData,
  playersMap: Record<string, SleeperPlayer>,
): TeamBlunderSummary[] {
  const { league, rosters, users, weeks, hasMedianMatch, totalTeams } = leagueData

  // User Map
  const userMap = new Map(users.map((u) => [u.user_id, u]))
  const rosterMap = new Map(rosters.map((r) => [r.roster_id, r]))

  const getTeamName = (rosterId: number): string => {
    const r = rosterMap.get(rosterId)
    if (!r) return `Team ${rosterId}`
    const u = r.owner_id ? userMap.get(r.owner_id) : null
    return u?.metadata?.team_name?.trim() || u?.display_name?.trim() || `Team ${rosterId}`
  }

  const getOwnerName = (rosterId: number): string => {
    const r = rosterMap.get(rosterId)
    if (!r) return `Owner ${rosterId}`
    const u = r.owner_id ? userMap.get(r.owner_id) : null
    return u?.display_name || `Owner ${rosterId}`
  }

  const getAvatarUrl = (rosterId: number): string | null => {
    const r = rosterMap.get(rosterId)
    if (!r || !r.owner_id) return null
    const u = userMap.get(r.owner_id)
    if (u?.metadata?.avatar) return u.metadata.avatar
    if (u?.avatar) return `https://sleepercdn.com/avatars/thumbs/${u.avatar}`
    return null
  }

  // Determine starting slot positions from league settings
  const rawPositions = league.roster_positions || [
    'QB',
    'RB',
    'RB',
    'WR',
    'WR',
    'TE',
    'FLEX',
    'K',
    'DEF',
  ]
  const starterSlots = rawPositions.filter(
    (pos) => !['BN', 'IR', 'TAXI', 'RESERVE'].includes(pos.toUpperCase()),
  )

  const medianCutoff = Math.floor(totalTeams / 2)
  const summaries: TeamBlunderSummary[] = []

  // Iterate over each roster
  for (const roster of rosters) {
    const rId = roster.roster_id
    const teamName = getTeamName(rId)
    const ownerName = getOwnerName(rId)
    const avatarUrl = getAvatarUrl(rId)

    const actualWins = Number(roster.settings?.wins ?? 0)
    const actualLosses = Number(roster.settings?.losses ?? 0)
    const actualTies = Number(roster.settings?.ties ?? 0)

    const weeklyBestBlunders: WrongChoice[] = []

    // Check each week's matchup
    for (const [weekNumStr, feed] of Object.entries(weeks)) {
      const week = Number(weekNumStr)
      const matchups = feed.matchups || []
      const teamMatchup = matchups.find((m) => m.roster_id === rId)
      if (!teamMatchup || typeof teamMatchup.points !== 'number') continue

      // Find opponent
      let oppMatchup: SleeperMatchup | undefined
      if (teamMatchup.matchup_id !== null && teamMatchup.matchup_id !== undefined) {
        oppMatchup = matchups.find(
          (m) => m.matchup_id === teamMatchup.matchup_id && m.roster_id !== rId,
        )
      }
      if (!oppMatchup) continue

      const oppPoints = oppMatchup.points ?? 0
      const oppTeamName = getTeamName(oppMatchup.roster_id)

      // Median ranking for current week
      const sortedByPoints = [...matchups]
        .filter((m) => typeof m.points === 'number')
        .sort((a, b) => b.points - a.points)

      // Who originally won median?
      // In 12-team, indices 0..5 are top 6. The 6th place team is sortedByPoints[medianCutoff - 1]
      const team6Original =
        hasMedianMatch && sortedByPoints.length >= medianCutoff
          ? sortedByPoints[medianCutoff - 1]
          : null

      const originalTeamRank =
        sortedByPoints.filter((m) => m.points > teamMatchup.points).length + 1
      const originallyWonMedian = hasMedianMatch && originalTeamRank <= medianCutoff
      const originallyWonH2H = teamMatchup.points > oppPoints

      const starters = teamMatchup.starters || []
      const allPlayers = teamMatchup.players || []
      const bench = allPlayers.filter((pid) => !starters.includes(pid))
      const pointsMap = teamMatchup.players_points || {}

      const candidateSwaps: WrongChoice[] = []

      // Test each starter vs each bench player
      for (let sIdx = 0; sIdx < starters.length; sIdx++) {
        const starterId = starters[sIdx]
        const slotType = starterSlots[sIdx] || 'FLEX'
        const starterPts = pointsMap[starterId] ?? 0
        const starterPlayer = playersMap[starterId]

        for (const benchId of bench) {
          const benchPts = pointsMap[benchId] ?? 0
          if (benchPts <= starterPts) continue

          const benchPlayer = playersMap[benchId]
          const benchPositions =
            benchPlayer?.fantasy_positions || (benchPlayer?.position ? [benchPlayer.position] : [])

          if (!isSlotEligible(slotType, benchPositions)) continue

          const pointsGained = Number((benchPts - starterPts).toFixed(2))
          const newTotalPoints = Number((teamMatchup.points + pointsGained).toFixed(2))

          // Evaluate H2H flip
          const newWonH2H = newTotalPoints > oppPoints
          const h2hFlipped = !originallyWonH2H && newWonH2H

          // Evaluate Median flip
          let medianFlipped = false
          let whoLosesMedian: string | null = null

          if (hasMedianMatch && !originallyWonMedian) {
            // New rank among other teams
            const otherTeamsAbove = sortedByPoints.filter(
              (m) => m.roster_id !== rId && m.points > newTotalPoints,
            ).length
            const newRank = otherTeamsAbove + 1
            if (newRank <= medianCutoff) {
              medianFlipped = true
              if (team6Original) {
                whoLosesMedian = getTeamName(team6Original.roster_id)
              }
            }
          }

          if (h2hFlipped || medianFlipped) {
            const winsGained = (h2hFlipped ? 1 : 0) + (medianFlipped ? 1 : 0)
            candidateSwaps.push({
              week,
              starterId,
              starterName: starterPlayer?.full_name || `Starter (${starterId})`,
              starterPosition: starterPlayer?.position || slotType,
              starterPoints: starterPts,
              starterTeam: starterPlayer?.team || null,
              benchId,
              benchName: benchPlayer?.full_name || `Bench (${benchId})`,
              benchPosition: benchPlayer?.position || slotType,
              benchPoints: benchPts,
              benchTeam: benchPlayer?.team || null,
              pointsGained,
              newTotalPoints,
              originalPoints: teamMatchup.points,
              h2hFlipped,
              medianFlipped,
              winsGained,
              oppRosterId: oppMatchup.roster_id,
              oppTeamName,
              oppPoints,
              whoLosesH2H: h2hFlipped ? oppTeamName : null,
              whoLosesMedian,
            })
          }
        }
      }

      // Pick the single most impactful blunder for this week
      if (candidateSwaps.length > 0) {
        candidateSwaps.sort((a, b) => b.winsGained - a.winsGained || b.pointsGained - a.pointsGained)
        weeklyBestBlunders.push(candidateSwaps[0])
      }
    }

    // Rank blunders across weeks: biggest wins gained first, then largest point differential
    weeklyBestBlunders.sort(
      (a, b) => b.winsGained - a.winsGained || b.pointsGained - a.pointsGained,
    )

    // Top 3 choices per team
    const topChoices = weeklyBestBlunders.slice(0, 3)
    const totalWinsGained = topChoices.reduce((sum, c) => sum + c.winsGained, 0)

    summaries.push({
      rosterId: rId,
      teamName,
      ownerName,
      avatarUrl,
      actualWins,
      actualLosses,
      actualTies,
      potentialWins: actualWins + totalWinsGained,
      potentialLosses: Math.max(0, actualLosses - totalWinsGained),
      totalWinsGained,
      wrongChoices: topChoices,
    })
  }

  // Sort summaries: teams with the most wins lost to blunders first
  summaries.sort(
    (a, b) =>
      b.totalWinsGained - a.totalWinsGained ||
      (b.wrongChoices[0]?.pointsGained ?? 0) - (a.wrongChoices[0]?.pointsGained ?? 0),
  )

  return summaries
}
