import type { LeagueData, SleeperMatchup } from './sleeper'
import type { SleeperPlayer } from './sleeperPlayers'
import type { SleeperTransaction } from './sleeperTransactions'

export type BlunderType = 'bench' | 'drop'

export interface WrongChoice {
  blunderType: BlunderType
  week: number
  starterId: string
  starterName: string
  starterPosition: string
  starterPoints: number
  starterProjected?: number | null
  starterTeam?: string | null
  subId: string
  subName: string
  subPosition: string
  subPoints: number
  subProjected?: number | null
  subTeam?: string | null
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
  // For drop regret: details about who claimed the dropped player
  claimedByTeamName?: string | null
  dropWeek?: number
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

function isRealisticBlunder(
  subProj?: number | null,
  starterProj?: number | null,
): boolean {
  if (subProj == null || starterProj == null) return true
  // Bench player must have at least 5.0 projected points (no zero-projected or deep backup dart throws)
  if (subProj < 5.0) return false
  // Bench player should be reasonably projected relative to starter
  const ratio = subProj / Math.max(starterProj, 1)
  const diff = starterProj - subProj
  return subProj >= starterProj || diff <= 3.5 || ratio >= 0.70 || subProj >= 9.0
}

export function computeLineupBlunders(
  leagueData: LeagueData,
  playersMap: Record<string, SleeperPlayer>,
  transactions?: SleeperTransaction[][],
  weeklyStats?: Record<string, any>[],
  projections?: Record<string, any>[],
): TeamBlunderSummary[] {
  const { league, rosters, users, weeks, hasMedianMatch, totalTeams } = leagueData

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

  // Track drops and adds by week
  // droppedByRoster: rosterId -> list of { playerId, dropWeek }
  const droppedByRoster = new Map<number, { playerId: string; dropWeek: number }[]>()
  // claimedByMap: playerId -> { rosterId, claimWeek }[]
  const claimedByMap = new Map<string, { rosterId: number; claimWeek: number }[]>()

  if (transactions) {
    for (let wIdx = 0; wIdx < transactions.length; wIdx++) {
      const week = wIdx + 1
      for (const t of transactions[wIdx] || []) {
        if (t.status !== 'complete') continue
        if (t.drops) {
          for (const [pId, rId] of Object.entries(t.drops)) {
            const numRId = Number(rId)
            if (!droppedByRoster.has(numRId)) droppedByRoster.set(numRId, [])
            droppedByRoster.get(numRId)!.push({ playerId: pId, dropWeek: week })
          }
        }
        if (t.adds) {
          for (const [pId, rId] of Object.entries(t.adds)) {
            const numRId = Number(rId)
            if (!claimedByMap.has(pId)) claimedByMap.set(pId, [])
            claimedByMap.get(pId)!.push({ rosterId: numRId, claimWeek: week })
          }
        }
      }
    }
  }

  const summaries: TeamBlunderSummary[] = []

  for (const roster of rosters) {
    const rId = roster.roster_id
    const teamName = getTeamName(rId)
    const ownerName = getOwnerName(rId)
    const avatarUrl = getAvatarUrl(rId)

    const actualWins = Number(roster.settings?.wins ?? 0)
    const actualLosses = Number(roster.settings?.losses ?? 0)
    const actualTies = Number(roster.settings?.ties ?? 0)

    const candidateBlunders: WrongChoice[] = []
    const dropsForThisTeam = droppedByRoster.get(rId) || []

    for (const [weekNumStr, feed] of Object.entries(weeks)) {
      const week = Number(weekNumStr)
      const matchups = feed.matchups || []
      const teamMatchup = matchups.find((m) => m.roster_id === rId)
      if (!teamMatchup || typeof teamMatchup.points !== 'number') continue

      let oppMatchup: SleeperMatchup | undefined
      if (teamMatchup.matchup_id !== null && teamMatchup.matchup_id !== undefined) {
        oppMatchup = matchups.find(
          (m) => m.matchup_id === teamMatchup.matchup_id && m.roster_id !== rId,
        )
      }
      if (!oppMatchup) continue

      const oppPoints = oppMatchup.points ?? 0
      const oppTeamName = getTeamName(oppMatchup.roster_id)

      const sortedByPoints = [...matchups]
        .filter((m) => typeof m.points === 'number')
        .sort((a, b) => b.points - a.points)

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

      const weekCandidateSwaps: WrongChoice[] = []
      const projWeek = projections && projections[week - 1] ? projections[week - 1] : null

      // --- 1. EVALUATE BENCH SWAPS ---
      for (let sIdx = 0; sIdx < starters.length; sIdx++) {
        const starterId = starters[sIdx]
        const slotType = starterSlots[sIdx] || 'FLEX'
        const starterPts = pointsMap[starterId] ?? 0
        const starterPlayer = playersMap[starterId]
        const starterProj = projWeek && projWeek[starterId]
          ? Number(projWeek[starterId].pts_ppr ?? projWeek[starterId].pts_half_ppr ?? projWeek[starterId].pts_std ?? 0)
          : null

        for (const benchId of bench) {
          const benchPts = pointsMap[benchId] ?? 0
          if (benchPts <= starterPts) continue

          const benchPlayer = playersMap[benchId]
          const benchPositions =
            benchPlayer?.fantasy_positions || (benchPlayer?.position ? [benchPlayer.position] : [])

          if (!isSlotEligible(slotType, benchPositions)) continue

          const benchProj = projWeek && projWeek[benchId]
            ? Number(projWeek[benchId].pts_ppr ?? projWeek[benchId].pts_half_ppr ?? projWeek[benchId].pts_std ?? 0)
            : null

          // Realism check: do not count deep backup flukes with no viable expectation
          if (!isRealisticBlunder(benchProj, starterProj)) continue

          const pointsGained = Number((benchPts - starterPts).toFixed(2))
          const newTotalPoints = Number((teamMatchup.points + pointsGained).toFixed(2))

          const newWonH2H = newTotalPoints > oppPoints
          const h2hFlipped = !originallyWonH2H && newWonH2H

          let medianFlipped = false
          let whoLosesMedian: string | null = null

          if (hasMedianMatch && !originallyWonMedian) {
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
            weekCandidateSwaps.push({
              blunderType: 'bench',
              week,
              starterId,
              starterName: starterPlayer?.full_name || `Starter (${starterId})`,
              starterPosition: starterPlayer?.position || slotType,
              starterPoints: starterPts,
              starterProjected: starterProj,
              starterTeam: starterPlayer?.team || null,
              subId: benchId,
              subName: benchPlayer?.full_name || `Bench (${benchId})`,
              subPosition: benchPlayer?.position || slotType,
              subPoints: benchPts,
              subProjected: benchProj,
              subTeam: benchPlayer?.team || null,
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

      // --- 2. EVALUATE DROP REGRETS ---
      // Did this team drop a player in a week <= current week?
      for (const drop of dropsForThisTeam) {
        if (drop.dropWeek > week) continue // dropped after this week
        // Don't evaluate if player is currently back on their roster
        if (allPlayers.includes(drop.playerId)) continue

        // Determine dropped player score in this week
        let dropPlayerPts: number | null = null
        const withDropped = matchups.find(
          (m) => m.players_points && m.players_points[drop.playerId] !== undefined,
        )
        if (withDropped) {
          dropPlayerPts = withDropped.players_points![drop.playerId]
        } else if (weeklyStats && weeklyStats[week - 1]) {
          const stats = weeklyStats[week - 1][drop.playerId]
          if (stats) {
            dropPlayerPts = Number(stats.pts_ppr ?? stats.pts_half_ppr ?? stats.pts_std ?? 0)
          }
        }

        if (dropPlayerPts === null || dropPlayerPts <= 0) continue

        const dropPlayer = playersMap[drop.playerId]
        const dropPositions =
          dropPlayer?.fantasy_positions || (dropPlayer?.position ? [dropPlayer.position] : [])

        // Find the lowest-scoring starter in an eligible slot
        let worstStarterIdx = -1
        let lowestStarterPts = Infinity

        for (let sIdx = 0; sIdx < starters.length; sIdx++) {
          const slotType = starterSlots[sIdx] || 'FLEX'
          if (!isSlotEligible(slotType, dropPositions)) continue
          const sPts = pointsMap[starters[sIdx]] ?? 0
          if (sPts < lowestStarterPts) {
            lowestStarterPts = sPts
            worstStarterIdx = sIdx
          }
        }

        if (worstStarterIdx === -1 || dropPlayerPts <= lowestStarterPts) continue

        const starterId = starters[worstStarterIdx]
        const slotType = starterSlots[worstStarterIdx] || 'FLEX'
        const starterPts = lowestStarterPts
        const starterPlayer = playersMap[starterId]
        const starterProj = projWeek && projWeek[starterId]
          ? Number(projWeek[starterId].pts_ppr ?? projWeek[starterId].pts_half_ppr ?? projWeek[starterId].pts_std ?? 0)
          : null
        const dropProj = projWeek && projWeek[drop.playerId]
          ? Number(projWeek[drop.playerId].pts_ppr ?? projWeek[drop.playerId].pts_half_ppr ?? projWeek[drop.playerId].pts_std ?? 0)
          : null

        // Realism check
        if (!isRealisticBlunder(dropProj, starterProj)) continue

        const pointsGained = Number((dropPlayerPts - starterPts).toFixed(2))
        const newTotalPoints = Number((teamMatchup.points + pointsGained).toFixed(2))

        const newWonH2H = newTotalPoints > oppPoints
        const h2hFlipped = !originallyWonH2H && newWonH2H

        let medianFlipped = false
        let whoLosesMedian: string | null = null

        if (hasMedianMatch && !originallyWonMedian) {
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

          // Check who rostered or claimed this dropped player in this week
          const holdingMatchup = matchups.find(
            (m) => m.roster_id !== rId && m.players && m.players.includes(drop.playerId),
          )
          let claimedByTeamName: string | null = null
          if (holdingMatchup) {
            claimedByTeamName = getTeamName(holdingMatchup.roster_id)
          } else {
            // Check the latest claim on or after the drop week
            const claimsAfterDrop = (claimedByMap.get(drop.playerId) || []).filter(
              (c) => c.claimWeek >= drop.dropWeek && c.claimWeek <= week && c.rosterId !== rId,
            )
            if (claimsAfterDrop.length > 0) {
              const latestClaim = claimsAfterDrop[claimsAfterDrop.length - 1]
              claimedByTeamName = getTeamName(latestClaim.rosterId)
            }
          }

          weekCandidateSwaps.push({
            blunderType: 'drop',
            week,
            starterId,
            starterName: starterPlayer?.full_name || `Starter (${starterId})`,
            starterPosition: starterPlayer?.position || slotType,
            starterPoints: starterPts,
            starterProjected: starterProj,
            starterTeam: starterPlayer?.team || null,
            subId: drop.playerId,
            subName: dropPlayer?.full_name || `Dropped (${drop.playerId})`,
            subPosition: dropPlayer?.position || slotType,
            subPoints: dropPlayerPts,
            subProjected: dropProj,
            subTeam: dropPlayer?.team || null,
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
            claimedByTeamName,
            dropWeek: drop.dropWeek,
          })
        }
      }

      if (weekCandidateSwaps.length > 0) {
        weekCandidateSwaps.sort(
          (a, b) => b.winsGained - a.winsGained || b.pointsGained - a.pointsGained,
        )
        // Keep top blunder for this week
        candidateBlunders.push(weekCandidateSwaps[0])
      }
    }

    // Rank across all weeks
    candidateBlunders.sort(
      (a, b) => b.winsGained - a.winsGained || b.pointsGained - a.pointsGained,
    )

    // Top 5 blunders per team
    const topChoices = candidateBlunders.slice(0, 5)
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

  summaries.sort(
    (a, b) =>
      b.totalWinsGained - a.totalWinsGained ||
      (b.wrongChoices[0]?.pointsGained ?? 0) - (a.wrongChoices[0]?.pointsGained ?? 0),
  )

  return summaries
}
