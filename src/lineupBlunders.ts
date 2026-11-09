import type { LeagueData, SleeperMatchup } from './sleeper'
import type { SleeperPlayer } from './sleeperPlayers'
import type { SleeperTransaction } from './sleeperTransactions'

export type BlunderType = 'bench' | 'drop'

export interface ClaimerImpact {
  teamName: string
  startedPlayer: boolean
  backupName: string | null
  backupPoints: number
  originalPoints: number
  newPoints: number
  pointsLost: number
  lostH2H: boolean
  lostMedian: boolean
  winsLost: number
  oppTeamName: string | null
}

export interface WrongChoice {
  blunderType: BlunderType
  week: number
  slotType: string
  starterId: string
  starterName: string
  starterPosition: string
  starterPoints: number
  starterProjected: number | null
  starterTeam: string | null
  subId: string
  subName: string
  subPosition: string
  subPoints: number
  subProjected: number | null
  subTeam: string | null
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
  claimedByTeamName?: string | null
  dropWeek?: number
  claimerImpact?: ClaimerImpact | null
}

export interface TeamBlunderSummary {
  rosterId: number
  teamName: string
  ownerName: string
  avatarUrl: string | null
  actualWins: number
  actualLosses: number
  actualTies: number
  h2hWins: number
  h2hLosses: number
  medianWins: number
  medianLosses: number
  potentialWins: number
  potentialLosses: number
  totalWinsGained: number
  claimerWinsCostTotal: number
  wrongChoices: WrongChoice[]
}

function isSlotEligible(
  slotType: string,
  playerPositions: string[],
  playerProj?: number | null,
  hasDedicatedTeSlot = true,
  isTePremium = false,
): boolean {
  if (!slotType) return false
  const upperSlot = slotType.toUpperCase()
  const upperPos = playerPositions.map((p) => p.toUpperCase())

  if (upperSlot === 'FLEX') {
    // In standard 1-TE non-TEP leagues, Tight Ends are evaluated against the starting TE slot unless projected as an elite FLEX play
    if (hasDedicatedTeSlot && !isTePremium && upperPos.length === 1 && upperPos[0] === 'TE') {
      return (playerProj ?? 0) >= 14.0
    }
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

function getLeagueScoredValue(
  feedWeek: Record<string, any> | null | undefined,
  playerId: string,
  scoringSettings?: Record<string, number>,
  isTe = false,
): number | null {
  if (!feedWeek || !feedWeek[playerId]) return null
  const p = feedWeek[playerId]
  if (p.pts_ppr == null && p.pts_half_ppr == null && p.pts_std == null) return null

  const recWeight = Number(scoringSettings?.rec ?? 1)
  let base = 0
  if (recWeight === 0) {
    base = Number(p.pts_std ?? p.pts_half_ppr ?? p.pts_ppr ?? 0)
  } else if (recWeight > 0 && recWeight < 0.75) {
    base = Number(p.pts_half_ppr ?? p.pts_ppr ?? p.pts_std ?? 0)
  } else {
    base = Number(p.pts_ppr ?? p.pts_half_ppr ?? p.pts_std ?? 0)
  }

  const teBonus = isTe ? Number(scoringSettings?.bonus_rec_te ?? 0) * Number(p.rec ?? 0) : 0
  const val = base + teBonus
  return Number.isFinite(val) ? val : null
}

function getPlayerPositions(playersMap: Record<string, SleeperPlayer>, playerId: string): string[] {
  const p = playersMap[playerId]
  if (!p) return []
  return p.fantasy_positions?.length ? p.fantasy_positions : p.position ? [p.position] : []
}

export function computeLineupBlunders(
  leagueData: LeagueData,
  playersMap: Record<string, SleeperPlayer>,
  transactions?: SleeperTransaction[][],
  weeklyStats?: Record<string, any>[],
  projections?: Record<string, any>[],
  mode: BlunderType = 'bench',
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
    'QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF',
  ]
  const starterSlots = rawPositions.filter(
    (pos) => !['BN', 'IR', 'TAXI', 'RESERVE'].includes(pos.toUpperCase()),
  )
  const hasDedicatedTeSlot = starterSlots.some((s) => s.toUpperCase() === 'TE')
  const isTePremium = Number(league.scoring_settings?.bonus_rec_te ?? 0) > 0
  const medianCutoff = Math.floor(totalTeams / 2)

  const getPlayerProj = (projWeek: Record<string, any> | null, playerId: string): number | null => {
    const pos = getPlayerPositions(playersMap, playerId)
    const isTe = pos.includes('TE')
    return getLeagueScoredValue(projWeek, playerId, league.scoring_settings, isTe)
  }

  interface DropEvent {
    playerId: string
    rosterId: number
    dropWeek: number
    created: number
  }
  const allDropEvents: DropEvent[] = []
  const claimedByMap = new Map<string, { rosterId: number; claimWeek: number; created: number }[]>()

  if (transactions && mode === 'drop') {
    for (let wIdx = 0; wIdx < transactions.length; wIdx++) {
      const week = wIdx + 1
      const weekTxs = [...(transactions[wIdx] || [])].sort(
        (a, b) => (a.created || 0) - (b.created || 0),
      )
      for (const t of weekTxs) {
        if (t.status !== 'complete') continue
        if (t.type === 'trade') continue
        if (t.drops) {
          for (const [pId, rId] of Object.entries(t.drops)) {
            allDropEvents.push({
              playerId: pId,
              rosterId: Number(rId),
              dropWeek: week,
              created: t.created || 0,
            })
          }
        }
        if (t.adds) {
          for (const [pId, rId] of Object.entries(t.adds)) {
            if (!claimedByMap.has(pId)) claimedByMap.set(pId, [])
            claimedByMap.get(pId)!.push({
              rosterId: Number(rId),
              claimWeek: week,
              created: t.created || 0,
            })
          }
        }
      }
    }
  }

  const sortedWeekNums = Object.keys(weeks)
    .map(Number)
    .filter((w) => {
      const m = weeks[w]?.matchups || []
      return m.some((item) => (item.points ?? 0) > 0)
    })
    .sort((a, b) => a - b)

  const recordByRoster = new Map<
    number,
    { h2hW: number; h2hL: number; medW: number; medL: number; ties: number }
  >()
  for (const r of rosters) {
    recordByRoster.set(r.roster_id, { h2hW: 0, h2hL: 0, medW: 0, medL: 0, ties: 0 })
  }

  for (const week of sortedWeekNums) {
    const matchups = weeks[week]?.matchups || []
    const valid = matchups.filter((m) => typeof m.points === 'number')
    const sorted = [...valid].sort((a, b) => b.points - a.points)

    for (const m of valid) {
      const rec = recordByRoster.get(m.roster_id)
      if (!rec || m.matchup_id == null) continue
      const opp = valid.find((o) => o.matchup_id === m.matchup_id && o.roster_id !== m.roster_id)
      if (!opp) continue
      if (m.points > opp.points) rec.h2hW++
      else if (m.points < opp.points) rec.h2hL++
      else rec.ties++

      if (hasMedianMatch && sorted.length >= medianCutoff) {
        const rank = sorted.filter((x) => x.points > m.points).length + 1
        if (rank <= medianCutoff) rec.medW++
        else rec.medL++
      }
    }
  }

  const summaries: TeamBlunderSummary[] = []

  for (const roster of rosters) {
    const rId = roster.roster_id
    const teamName = getTeamName(rId)
    const ownerName = getOwnerName(rId)
    const avatarUrl = getAvatarUrl(rId)
    const rec = recordByRoster.get(rId) || { h2hW: 0, h2hL: 0, medW: 0, medL: 0, ties: 0 }

    const actualWins = rec.h2hW + rec.medW
    const actualLosses = rec.h2hL + rec.medL
    const actualTies = rec.ties

    const candidateBlunders: WrongChoice[] = []

    for (const week of sortedWeekNums) {
      const matchups = weeks[week]?.matchups || []
      const teamMatchup = matchups.find((m) => m.roster_id === rId)
      if (!teamMatchup || typeof teamMatchup.points !== 'number') continue

      const oppMatchup: SleeperMatchup | undefined =
        teamMatchup.matchup_id != null
          ? matchups.find((m) => m.matchup_id === teamMatchup.matchup_id && m.roster_id !== rId)
          : undefined
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

      if (originallyWonH2H && (!hasMedianMatch || originallyWonMedian)) continue

      const starters = teamMatchup.starters || []
      const allPlayers = teamMatchup.players || []
      const bench = allPlayers.filter((pid) => !starters.includes(pid))
      const pointsMap = teamMatchup.players_points || {}
      const projWeek = projections?.[week - 1] || null

      const weekChoices: WrongChoice[] = []

      const evaluateCandidate = (
        sIdx: number,
        subId: string,
        subPts: number,
        subProj: number | null,
        blunderType: BlunderType,
        dropWeek?: number,
      ): WrongChoice | null => {
        const starterId = starters[sIdx]
        const slotType = starterSlots[sIdx] || 'FLEX'
        const starterPts = pointsMap[starterId] ?? 0
        if (subPts <= starterPts) return null

        const starterPlayer = playersMap[starterId]
        const subPlayer = playersMap[subId]
        const starterProj = getPlayerProj(projWeek, starterId)

        const pointsGained = Number((subPts - starterPts).toFixed(2))
        const newTotalPoints = Number((teamMatchup.points + pointsGained).toFixed(2))

        const newWonH2H = newTotalPoints > oppPoints
        const h2hFlipped = !originallyWonH2H && newWonH2H

        let medianFlipped = false
        let whoLosesMedian: string | null = null

        if (hasMedianMatch && !originallyWonMedian) {
          const otherTeamsAbove = sortedByPoints.filter(
            (m) => m.roster_id !== rId && m.points > newTotalPoints,
          ).length
          if (otherTeamsAbove + 1 <= medianCutoff) {
            medianFlipped = true
            if (team6Original) {
              whoLosesMedian = getTeamName(team6Original.roster_id)
            }
          }
        }

        if (!h2hFlipped && !medianFlipped) return null

        const winsGained = (h2hFlipped ? 1 : 0) + (medianFlipped ? 1 : 0)
        let claimedByTeamName: string | null = null
        let claimerImpact: ClaimerImpact | null = null

        if (blunderType === 'drop') {
          const holdingMatchup = matchups.find(
            (m) => m.roster_id !== rId && m.players?.includes(subId),
          )
          if (holdingMatchup) {
            claimedByTeamName = getTeamName(holdingMatchup.roster_id)
            const cStarterIdx = (holdingMatchup.starters || []).indexOf(subId)
            if (cStarterIdx !== -1) {
              const cSlotType = starterSlots[cStarterIdx] || 'FLEX'
              const cBench = (holdingMatchup.players || []).filter(
                (pid) => !(holdingMatchup.starters || []).includes(pid),
              )
              let bestBackupId: string | null = null
              let bestBackupProj = -1
              for (const bId of cBench) {
                const bPos = getPlayerPositions(playersMap, bId)
                if (!isSlotEligible(cSlotType, bPos)) continue
                const bProj = getPlayerProj(projWeek, bId) ?? 0
                if (bProj > bestBackupProj) {
                  bestBackupProj = bProj
                  bestBackupId = bId
                }
              }
              const backupPts = bestBackupId
                ? (holdingMatchup.players_points?.[bestBackupId] ?? 0)
                : 0
              const backupName = bestBackupId
                ? playersMap[bestBackupId]?.full_name || 'Bench Backup'
                : null
              const cOrigPts = holdingMatchup.points ?? 0
              const cNewPts = Number(Math.max(0, cOrigPts - subPts + backupPts).toFixed(2))
              const cPtsLost = Number(Math.max(0, cOrigPts - cNewPts).toFixed(2))

              const cOpp = matchups.find(
                (m) =>
                  m.matchup_id === holdingMatchup.matchup_id &&
                  m.roster_id !== holdingMatchup.roster_id,
              )
              const cOppPts = cOpp?.points ?? 0
              const cOrigWonH2H = cOrigPts > cOppPts
              const cLostH2H = cOrigWonH2H && cNewPts < cOppPts

              let cLostMedian = false
              if (hasMedianMatch) {
                const cOrigRank = sortedByPoints.filter((m) => m.points > cOrigPts).length + 1
                const cOrigWonMed = cOrigRank <= medianCutoff
                if (cOrigWonMed) {
                  const aboveNew = sortedByPoints.filter(
                    (m) => m.roster_id !== holdingMatchup.roster_id && m.points > cNewPts,
                  ).length
                  if (aboveNew + 1 > medianCutoff) {
                    cLostMedian = true
                  }
                }
              }

              claimerImpact = {
                teamName: claimedByTeamName,
                startedPlayer: true,
                backupName,
                backupPoints: backupPts,
                originalPoints: cOrigPts,
                newPoints: cNewPts,
                pointsLost: cPtsLost,
                lostH2H: cLostH2H,
                lostMedian: cLostMedian,
                winsLost: (cLostH2H ? 1 : 0) + (cLostMedian ? 1 : 0),
                oppTeamName: cOpp ? getTeamName(cOpp.roster_id) : null,
              }
            } else {
              claimerImpact = {
                teamName: claimedByTeamName,
                startedPlayer: false,
                backupName: null,
                backupPoints: 0,
                originalPoints: holdingMatchup.points ?? 0,
                newPoints: holdingMatchup.points ?? 0,
                pointsLost: 0,
                lostH2H: false,
                lostMedian: false,
                winsLost: 0,
                oppTeamName: null,
              }
            }
          } else {
            const claimsAfter = (claimedByMap.get(subId) || []).filter(
              (c) => c.claimWeek >= (dropWeek ?? 1) && c.claimWeek <= week && c.rosterId !== rId,
            )
            if (claimsAfter.length > 0) {
              claimedByTeamName = getTeamName(claimsAfter[claimsAfter.length - 1].rosterId)
            }
          }
        }

        return {
          blunderType,
          week,
          slotType,
          starterId,
          starterName: starterPlayer?.full_name || `Starter (${starterId})`,
          starterPosition: starterPlayer?.position || slotType,
          starterPoints: starterPts,
          starterProjected: starterProj,
          starterTeam: starterPlayer?.team || null,
          subId,
          subName: subPlayer?.full_name || `Player (${subId})`,
          subPosition: subPlayer?.position || slotType,
          subPoints: subPts,
          subProjected: subProj,
          subTeam: subPlayer?.team || null,
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
          dropWeek,
          claimerImpact,
        }
      }

      if (mode === 'bench') {
        for (const benchId of bench) {
          const benchPts = pointsMap[benchId] ?? 0
          const benchProj = getPlayerProj(projWeek, benchId)
          if (benchProj !== null && benchProj < 6.5) continue

          const benchPositions = getPlayerPositions(playersMap, benchId)
          const eligibleStarterIndices: number[] = []
          let minEligibleStarterProj = Infinity

          for (let sIdx = 0; sIdx < starters.length; sIdx++) {
            const slotType = starterSlots[sIdx] || 'FLEX'
            if (
              !isSlotEligible(
                slotType,
                benchPositions,
                benchProj,
                hasDedicatedTeSlot,
                isTePremium,
              )
            ) {
              continue
            }
            eligibleStarterIndices.push(sIdx)
            const sProj = getPlayerProj(projWeek, starters[sIdx])
            if (sProj !== null && sProj < minEligibleStarterProj) {
              minEligibleStarterProj = sProj
            }
          }

          let bestBenchChoice: WrongChoice | null = null
          for (const sIdx of eligibleStarterIndices) {
            const sProj = getPlayerProj(projWeek, starters[sIdx])
            if (benchProj !== null && sProj !== null) {
              if (sProj - benchProj > 2.8) continue
              if (
                benchProj < sProj &&
                Number.isFinite(minEligibleStarterProj) &&
                sProj > minEligibleStarterProj + 2.0
              ) {
                continue
              }
            }
            const choice = evaluateCandidate(sIdx, benchId, benchPts, benchProj, 'bench')
            if (
              choice &&
              (!bestBenchChoice ||
                choice.winsGained > bestBenchChoice.winsGained ||
                (choice.winsGained === bestBenchChoice.winsGained &&
                  choice.pointsGained > bestBenchChoice.pointsGained))
            ) {
              bestBenchChoice = choice
            }
          }
          if (bestBenchChoice) {
            weekChoices.push(bestBenchChoice)
          }
        }
      } else {
        const dropsUpToWeek = allDropEvents.filter((d) => d.dropWeek <= week)
        const latestDropByPlayer = new Map<string, DropEvent>()
        for (const d of dropsUpToWeek) {
          latestDropByPlayer.set(d.playerId, d)
        }

        for (const [droppedPlayerId, dropEvent] of latestDropByPlayer.entries()) {
          if (dropEvent.rosterId !== rId) continue
          if (week - dropEvent.dropWeek > 4) continue
          if (allPlayers.includes(droppedPlayerId)) continue

          let dropPlayerPts: number | null = null
          const withDropped = matchups.find(
            (m) => m.players_points && m.players_points[droppedPlayerId] !== undefined,
          )
          if (withDropped) {
            dropPlayerPts = withDropped.players_points![droppedPlayerId]
          } else if (weeklyStats?.[week - 1]?.[droppedPlayerId]) {
            const isTe = getPlayerPositions(playersMap, droppedPlayerId).includes('TE')
            dropPlayerPts = getLeagueScoredValue(
              weeklyStats[week - 1],
              droppedPlayerId,
              league.scoring_settings,
              isTe,
            )
          }
          if (dropPlayerPts === null || dropPlayerPts <= 0) continue

          const dropProj = getPlayerProj(projWeek, droppedPlayerId)
          if (dropProj !== null && dropProj < 7.5) continue

          const dropPositions = getPlayerPositions(playersMap, droppedPlayerId)
          const eligibleStarterIndices: number[] = []
          let minEligibleStarterProj = Infinity

          for (let sIdx = 0; sIdx < starters.length; sIdx++) {
            const slotType = starterSlots[sIdx] || 'FLEX'
            if (
              !isSlotEligible(
                slotType,
                dropPositions,
                dropProj,
                hasDedicatedTeSlot,
                isTePremium,
              )
            ) {
              continue
            }
            eligibleStarterIndices.push(sIdx)
            const sProj = getPlayerProj(projWeek, starters[sIdx])
            if (sProj !== null && sProj < minEligibleStarterProj) {
              minEligibleStarterProj = sProj
            }
          }

          let bestDropChoice: WrongChoice | null = null
          for (const sIdx of eligibleStarterIndices) {
            const sProj = getPlayerProj(projWeek, starters[sIdx])
            if (dropProj !== null && sProj !== null) {
              if (sProj - dropProj > 2.5) continue
              if (
                dropProj < sProj &&
                Number.isFinite(minEligibleStarterProj) &&
                sProj > minEligibleStarterProj + 2.0
              ) {
                continue
              }
            }
            const choice = evaluateCandidate(
              sIdx,
              droppedPlayerId,
              dropPlayerPts,
              dropProj,
              'drop',
              dropEvent.dropWeek,
            )
            if (
              choice &&
              (!bestDropChoice ||
                choice.winsGained > bestDropChoice.winsGained ||
                (choice.winsGained === bestDropChoice.winsGained &&
                  choice.pointsGained > bestDropChoice.pointsGained))
            ) {
              bestDropChoice = choice
            }
          }
          if (bestDropChoice) {
            weekChoices.push(bestDropChoice)
          }
        }
      }

      if (weekChoices.length > 0) {
        weekChoices.sort(
          (a, b) => b.winsGained - a.winsGained || b.pointsGained - a.pointsGained,
        )
        candidateBlunders.push(weekChoices[0])
      }
    }

    candidateBlunders.sort(
      (a, b) => b.winsGained - a.winsGained || b.pointsGained - a.pointsGained,
    )

    const topChoices = candidateBlunders.slice(0, 5)
    const totalWinsGained = topChoices.reduce((sum, c) => sum + c.winsGained, 0)
    const claimerWinsCostTotal = topChoices.reduce(
      (sum, c) => sum + (c.claimerImpact?.winsLost ?? 0),
      0,
    )

    summaries.push({
      rosterId: rId,
      teamName,
      ownerName,
      avatarUrl,
      actualWins,
      actualLosses,
      actualTies,
      h2hWins: rec.h2hW,
      h2hLosses: rec.h2hL,
      medianWins: rec.medW,
      medianLosses: rec.medL,
      potentialWins: actualWins + totalWinsGained,
      potentialLosses: Math.max(0, actualLosses - totalWinsGained),
      totalWinsGained,
      claimerWinsCostTotal,
      wrongChoices: topChoices,
    })
  }

  summaries.sort(
    (a, b) =>
      b.totalWinsGained - a.totalWinsGained ||
      b.claimerWinsCostTotal - a.claimerWinsCostTotal ||
      (b.wrongChoices[0]?.pointsGained ?? 0) - (a.wrongChoices[0]?.pointsGained ?? 0),
  )

  return summaries
}
