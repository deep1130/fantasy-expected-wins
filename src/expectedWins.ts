import type { LeagueData, SleeperRoster, SleeperUser } from './sleeper'

export interface WeeklyTeamPerformance {
  week: number
  rosterId: number
  points: number
  rank: number // 1 = highest score in league that week
  totalTeams: number
  oppRosterId: number | null
  oppPoints: number | null
  // Head-to-Head
  h2hExpectedWins: number // e.g. 10/11 = 0.909
  h2hExpectedLosses: number
  h2hActualWins: number // 1.0, 0.5, 0.0
  h2hActualLosses: number
  h2hActualTies: number
  h2hLuck: number // h2hActualWins - h2hExpectedWins
  // Median (if active)
  hasMedian: boolean
  medianPoints: number | null
  medianActualWins: number
  medianExpectedWins: number
  // Combined
  totalExpectedWins: number
  totalExpectedLosses: number
  totalActualWins: number
  totalActualLosses: number
  totalLuck: number
  // All-play counts for this week
  allPlayWins: number
  allPlayLosses: number
  allPlayTies: number
}

export interface TeamSeasonSummary {
  roster: SleeperRoster
  user?: SleeperUser
  teamName: string
  avatarUrl: string | null
  rosterId: number

  // Actual record
  actualWins: number
  actualLosses: number
  actualTies: number
  actualWinPct: number

  // Expected record
  expectedWins: number
  expectedLosses: number
  expectedWinPct: number

  // Luck
  luckDelta: number // actualWins - expectedWins
  luckTier: 'very-lucky' | 'lucky' | 'neutral' | 'unlucky' | 'very-unlucky'

  // Head-to-Head & Median breakdown
  h2hActualWins: number
  h2hActualLosses: number
  h2hExpectedWins: number
  h2hExpectedLosses: number
  medianActualWins: number
  medianActualLosses: number
  medianExpectedWins: number

  // All-Play
  allPlayWins: number
  allPlayLosses: number
  allPlayTies: number
  allPlayWinPct: number

  // Scoring
  pointsFor: number
  pointsAgainst: number
  avgPointsFor: number
  avgPointsAgainst: number
  pfRank: number
  paRank: number
  avgWeeklyRank: number
  highestScore: { week: number; points: number }
  lowestScore: { week: number; points: number }
  scoreStdDev: number

  // Weekly logs
  weeklyPerformances: WeeklyTeamPerformance[]
}

export interface MatchupSuperlative {
  week: number
  rosterId: number
  teamName: string
  points: number
  oppRosterId: number
  oppTeamName: string
  oppPoints: number
  rank: number
  totalTeams: number
  xWin: number
  actualWin: number
  luck: number
  type: 'bad-beat' | 'lucky-escape'
}

export interface ScheduleMatrixEntry {
  teamRosterId: number
  scheduleOfRosterId: number
  hypotheticalWins: number
  hypotheticalLosses: number
  hypotheticalTies: number
  winPct: number
}

export interface ExpectedWinsAnalysis {
  teams: TeamSeasonSummary[]
  weeksAvailable: number[]
  hasMedian: boolean
  totalTeams: number
  regularSeasonWeeks: number
  completedWeeksCount: number
  leagueName: string
  leagueId: string
  season: string
  scoringPpr: number
  superlatives: {
    luckiestTeam: TeamSeasonSummary | null
    unluckiestTeam: TeamSeasonSummary | null
    highestScorer: TeamSeasonSummary | null
    brutalSchedule: TeamSeasonSummary | null // Highest Points Against
    bestWeek: { teamName: string; points: number; week: number } | null
    worstWeek: { teamName: string; points: number; week: number } | null
    biggestBadBeats: MatchupSuperlative[]
    luckiestEscapes: MatchupSuperlative[]
  }
  scheduleMatrix: ScheduleMatrixEntry[]
}

export function teamName(data: LeagueData, roster: SleeperRoster): string {
  const user = data.users.find((u) => u.user_id === roster.owner_id)
  return user?.metadata?.team_name?.trim() || user?.display_name?.trim() || `Team ${roster.roster_id}`
}

export function avatarUrl(user?: SleeperUser): string | null {
  if (!user?.avatar) return null
  return `https://sleepercdn.com/avatars/thumbs/${user.avatar}`
}

export function computeExpectedWins(data: LeagueData): ExpectedWinsAnalysis {
  const { league, rosters, users, weeks, hasMedianMatch, totalTeams, regularSeasonWeeks } = data

  const userMap = new Map<string, SleeperUser>()
  for (const user of users) {
    userMap.set(user.user_id, user)
  }

  const rosterMap = new Map<number, SleeperRoster>()
  for (const roster of rosters) {
    rosterMap.set(roster.roster_id, roster)
  }

  // Determine all available scored weeks
  const availableWeeks = Object.keys(weeks)
    .map(Number)
    .filter((w) => w >= 1 && w <= regularSeasonWeeks)
    .sort((a, b) => a - b)

  // Filter only weeks where matchups actually have points or finished games
  const completedWeeks = availableWeeks.filter((w) => {
    const feed = weeks[w]
    if (!feed || !feed.matchups || feed.matchups.length === 0) return false
    // At least one team has > 0 points
    return feed.matchups.some((m) => (m.points ?? 0) > 0 || (m.custom_points ?? 0) > 0)
  })

  // Map to store weekly performances for each team
  const weeklyMap = new Map<number, WeeklyTeamPerformance[]>()
  for (const roster of rosters) {
    weeklyMap.set(roster.roster_id, [])
  }

  const allBadBeats: MatchupSuperlative[] = []
  const allLuckyEscapes: MatchupSuperlative[] = []

  let overallBestWeek: { teamName: string; points: number; week: number } | null = null
  let overallWorstWeek: { teamName: string; points: number; week: number } | null = null

  // Process each completed week
  for (const week of completedWeeks) {
    const feed = weeks[week]
    const matchups = feed.matchups || []

    // Map each roster's score
    const weekScores: { rosterId: number; points: number; matchupId: number | null }[] = []
    for (const m of matchups) {
      const pts = typeof m.custom_points === 'number' && Number.isFinite(m.custom_points)
        ? m.custom_points
        : Number(m.points) || 0
      weekScores.push({ rosterId: m.roster_id, points: pts, matchupId: m.matchup_id })
    }

    const n = weekScores.length || totalTeams

    // Sort by points descending to compute ranks
    const sorted = [...weekScores].sort((a, b) => b.points - a.points)

    // Compute ranks with standard tied-rank handling
    const ranks = new Map<number, number>()
    let currentRank = 1
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i].points < sorted[i - 1].points) {
        currentRank = i + 1
      }
      ranks.set(sorted[i].rosterId, currentRank)
    }

    // Determine median threshold if applicable
    let medianLineScore: number | null = null
    if (hasMedianMatch && sorted.length >= 2) {
      const mid = Math.floor(sorted.length / 2)
      // Standard median: average of mid-1 and mid in 0-indexed sorted descending
      medianLineScore = (sorted[mid - 1].points + sorted[mid].points) / 2
    }

    // Matchup map for H2H pairings
    const matchupIdToRosters = new Map<number, typeof weekScores>()
    for (const item of weekScores) {
      if (item.matchupId != null) {
        const list = matchupIdToRosters.get(item.matchupId) || []
        list.push(item)
        matchupIdToRosters.set(item.matchupId, list)
      }
    }

    // Calculate performance for each team this week
    for (const item of weekScores) {
      const rosterId = item.rosterId
      const pts = item.points
      const rank = ranks.get(rosterId) ?? sorted.findIndex((s) => s.rosterId === rosterId) + 1

      // High / Low week tracking
      const tName = teamName(data, rosterMap.get(rosterId)!)
      if (pts > 0) {
        if (!overallBestWeek || pts > overallBestWeek.points) {
          overallBestWeek = { teamName: tName, points: pts, week }
        }
        if (!overallWorstWeek || pts < overallWorstWeek.points) {
          overallWorstWeek = { teamName: tName, points: pts, week }
        }
      }

      // Count opponents beaten, tied, lost
      let beaten = 0
      let tied = 0
      let lost = 0
      for (const other of weekScores) {
        if (other.rosterId === rosterId) continue
        if (pts > other.points) beaten++
        else if (pts < other.points) lost++
        else tied++
      }

      const otherCount = Math.max(1, n - 1)
      const h2hExpectedWins = (beaten + 0.5 * tied) / otherCount
      const h2hExpectedLosses = 1.0 - h2hExpectedWins

      // Find Head-to-Head opponent
      let oppRosterId: number | null = null
      let oppPoints: number | null = null
      let h2hActualWins = 0
      let h2hActualLosses = 0
      let h2hActualTies = 0

      if (item.matchupId != null) {
        const pair = matchupIdToRosters.get(item.matchupId) || []
        const opp = pair.find((p) => p.rosterId !== rosterId)
        if (opp) {
          oppRosterId = opp.rosterId
          oppPoints = opp.points
          if (pts > opp.points) {
            h2hActualWins = 1.0
          } else if (pts < opp.points) {
            h2hActualLosses = 1.0
          } else {
            h2hActualTies = 1.0
            h2hActualWins = 0.5
            h2hActualLosses = 0.5
          }
        } else {
          // Bye or unpaired
          if (pts > 0) h2hActualWins = 1.0
          else h2hActualLosses = 1.0
        }
      }

      const h2hLuck = h2hActualWins - h2hExpectedWins

      // Median scoring calculation
      let medianActualWins = 0
      let medianExpectedWins = 0
      if (hasMedianMatch && sorted.length >= 2) {
        const topCutoffIndex = Math.floor(sorted.length / 2) // e.g. 6 in 12-team
        // In sorted descending: indices 0 .. topCutoffIndex - 1 are top half
        const topCutoffScore = sorted[topCutoffIndex - 1].points
        const bottomCutoffScore = sorted[topCutoffIndex].points

        if (pts > bottomCutoffScore) {
          medianActualWins = 1.0
          medianExpectedWins = 1.0
        } else if (pts < topCutoffScore) {
          medianActualWins = 0.0
          medianExpectedWins = 0.0
        } else {
          // Exactly on the boundary (tie across the median line)
          medianActualWins = 0.5
          medianExpectedWins = 0.5
        }
      }

      const totalExpectedWins = h2hExpectedWins + (hasMedianMatch ? medianExpectedWins : 0)
      const totalExpectedLosses = h2hExpectedLosses + (hasMedianMatch ? (1.0 - medianExpectedWins) : 0)
      const totalActualWins = h2hActualWins + (hasMedianMatch ? medianActualWins : 0)
      const totalActualLosses = h2hActualLosses + (hasMedianMatch ? (1.0 - medianActualWins) : 0)
      const totalLuck = totalActualWins - totalExpectedWins

      const perf: WeeklyTeamPerformance = {
        week,
        rosterId,
        points: pts,
        rank,
        totalTeams: n,
        oppRosterId,
        oppPoints,
        h2hExpectedWins,
        h2hExpectedLosses,
        h2hActualWins,
        h2hActualLosses,
        h2hActualTies,
        h2hLuck,
        hasMedian: hasMedianMatch,
        medianPoints: medianLineScore,
        medianActualWins,
        medianExpectedWins,
        totalExpectedWins,
        totalExpectedLosses,
        totalActualWins,
        totalActualLosses,
        totalLuck,
        allPlayWins: beaten,
        allPlayLosses: lost,
        allPlayTies: tied,
      }

      weeklyMap.get(rosterId)?.push(perf)

      // Check for notable bad beats and lucky escapes (in H2H)
      if (oppRosterId != null && oppPoints != null) {
        const oppTeam = teamName(data, rosterMap.get(oppRosterId)!)
        // Bad Beat: finished in top 35% of league scoring that week but lost H2H
        if (h2hActualWins === 0 && h2hExpectedWins >= 0.65) {
          allBadBeats.push({
            week,
            rosterId,
            teamName: tName,
            points: pts,
            oppRosterId,
            oppTeamName: oppTeam,
            oppPoints,
            rank,
            totalTeams: n,
            xWin: h2hExpectedWins,
            actualWin: h2hActualWins,
            luck: h2hLuck,
            type: 'bad-beat',
          })
        }
        // Lucky Escape: finished in bottom 35% of scoring that week but won H2H
        if (h2hActualWins === 1 && h2hExpectedWins <= 0.35) {
          allLuckyEscapes.push({
            week,
            rosterId,
            teamName: tName,
            points: pts,
            oppRosterId,
            oppTeamName: oppTeam,
            oppPoints,
            rank,
            totalTeams: n,
            xWin: h2hExpectedWins,
            actualWin: h2hActualWins,
            luck: h2hLuck,
            type: 'lucky-escape',
          })
        }
      }
    }
  }

  // Build season summary for each team
  const teams: TeamSeasonSummary[] = rosters.map((roster) => {
    const rosterId = roster.roster_id
    const user = userMap.get(roster.owner_id ?? '')
    const tName = teamName(data, roster)
    const perfs = weeklyMap.get(rosterId) || []

    let actualWins = 0
    let actualLosses = 0
    let actualTies = 0
    let expectedWins = 0
    let expectedLosses = 0
    let h2hActualWins = 0
    let h2hActualLosses = 0
    let h2hExpectedWins = 0
    let h2hExpectedLosses = 0
    let medianActualWins = 0
    let medianActualLosses = 0
    let medianExpectedWins = 0
    let allPlayWins = 0
    let allPlayLosses = 0
    let allPlayTies = 0
    let pointsFor = 0
    let pointsAgainst = 0
    let highestScore = { week: 0, points: -Infinity }
    let lowestScore = { week: 0, points: Infinity }
    const weeklyPoints: number[] = []

    for (const p of perfs) {
      actualWins += p.totalActualWins
      actualLosses += p.totalActualLosses
      actualTies += p.h2hActualTies
      expectedWins += p.totalExpectedWins
      expectedLosses += p.totalExpectedLosses

      h2hActualWins += p.h2hActualWins
      h2hActualLosses += p.h2hActualLosses
      h2hExpectedWins += p.h2hExpectedWins
      h2hExpectedLosses += p.h2hExpectedLosses

      medianActualWins += p.medianActualWins
      medianActualLosses += (1.0 - p.medianActualWins)
      medianExpectedWins += p.medianExpectedWins

      allPlayWins += p.allPlayWins
      allPlayLosses += p.allPlayLosses
      allPlayTies += p.allPlayTies

      pointsFor += p.points
      if (p.oppPoints != null) pointsAgainst += p.oppPoints

      weeklyPoints.push(p.points)
      if (p.points > highestScore.points) highestScore = { week: p.week, points: p.points }
      if (p.points < lowestScore.points) lowestScore = { week: p.week, points: p.points }
    }

    const gamesPlayed = actualWins + actualLosses
    const actualWinPct = gamesPlayed > 0 ? (actualWins / gamesPlayed) : 0
    const expGames = expectedWins + expectedLosses
    const expectedWinPct = expGames > 0 ? (expectedWins / expGames) : 0
    const allPlayTotal = allPlayWins + allPlayLosses + allPlayTies
    const allPlayWinPct = allPlayTotal > 0 ? ((allPlayWins + 0.5 * allPlayTies) / allPlayTotal) : 0

    const luckDelta = actualWins - expectedWins
    let luckTier: TeamSeasonSummary['luckTier'] = 'neutral'
    if (luckDelta >= 1.75) luckTier = 'very-lucky'
    else if (luckDelta >= 0.5) luckTier = 'lucky'
    else if (luckDelta <= -1.75) luckTier = 'very-unlucky'
    else if (luckDelta <= -0.5) luckTier = 'unlucky'

    const weeksCount = perfs.length || 1
    const avgPointsFor = pointsFor / weeksCount
    const avgPointsAgainst = pointsAgainst / weeksCount
    const avgWeeklyRank = perfs.reduce((sum, p) => sum + p.rank, 0) / weeksCount

    // Standard deviation of points
    const mean = avgPointsFor
    const variance = weeklyPoints.length > 1
      ? weeklyPoints.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (weeklyPoints.length - 1)
      : 0
    const scoreStdDev = Math.sqrt(variance)

    return {
      roster,
      user,
      teamName: tName,
      avatarUrl: avatarUrl(user),
      rosterId,
      actualWins,
      actualLosses,
      actualTies,
      actualWinPct,
      expectedWins,
      expectedLosses,
      expectedWinPct,
      luckDelta,
      luckTier,
      h2hActualWins,
      h2hActualLosses,
      h2hExpectedWins,
      h2hExpectedLosses,
      medianActualWins,
      medianActualLosses,
      medianExpectedWins,
      allPlayWins,
      allPlayLosses,
      allPlayTies,
      allPlayWinPct,
      pointsFor,
      pointsAgainst,
      avgPointsFor,
      avgPointsAgainst,
      pfRank: 0, // Assigned below
      paRank: 0, // Assigned below
      avgWeeklyRank,
      highestScore: highestScore.points === -Infinity ? { week: 0, points: 0 } : highestScore,
      lowestScore: lowestScore.points === Infinity ? { week: 0, points: 0 } : lowestScore,
      scoreStdDev,
      weeklyPerformances: perfs,
    }
  })

  // Assign PF and PA ranks
  const sortedByPf = [...teams].sort((a, b) => b.pointsFor - a.pointsFor)
  sortedByPf.forEach((t, idx) => {
    t.pfRank = idx + 1
  })
  const sortedByPa = [...teams].sort((a, b) => b.pointsAgainst - a.pointsAgainst)
  sortedByPa.forEach((t, idx) => {
    t.paRank = idx + 1
  })

  // Default sorting: Expected Wins descending (or Actual Wins)
  teams.sort((a, b) => b.expectedWins - a.expectedWins || b.pointsFor - a.pointsFor)

  // Superlatives
  const luckiestTeam = [...teams].sort((a, b) => b.luckDelta - a.luckDelta)[0] || null
  const unluckiestTeam = [...teams].sort((a, b) => a.luckDelta - b.luckDelta)[0] || null
  const highestScorer = sortedByPf[0] || null
  const brutalSchedule = sortedByPa[0] || null

  // Sort bad beats by luck severity (most negative first)
  allBadBeats.sort((a, b) => a.luck - b.luck)
  // Sort lucky escapes by luck severity (most positive first)
  allLuckyEscapes.sort((a, b) => b.luck - a.luck)

  // Schedule matrix calculation:
  // For each team A and team B, what would team A's record be if they played team B's opponents?
  const scheduleMatrix: ScheduleMatrixEntry[] = []
  for (const teamA of teams) {
    for (const teamB of teams) {
      let hypWins = 0
      let hypLosses = 0
      let hypTies = 0

      for (const perfB of teamB.weeklyPerformances) {
        const perfA = teamA.weeklyPerformances.find((p) => p.week === perfB.week)
        if (!perfA) continue

        // Determine who Team B played that week
        let oppScore: number | null = null
        if (perfB.oppRosterId === teamA.rosterId) {
          // If Team B played Team A that week, in the simulation Team A plays Team B!
          oppScore = perfB.points
        } else if (perfB.oppPoints != null) {
          oppScore = perfB.oppPoints
        }

        if (oppScore != null) {
          if (perfA.points > oppScore) hypWins += 1.0
          else if (perfA.points < oppScore) hypLosses += 1.0
          else {
            hypWins += 0.5
            hypLosses += 0.5
            hypTies += 1
          }
        }

        // If median is active, include median game for Team A
        if (hasMedianMatch) {
          hypWins += perfA.medianActualWins
          hypLosses += (1.0 - perfA.medianActualWins)
        }
      }

      const totalHypGames = hypWins + hypLosses
      const winPct = totalHypGames > 0 ? hypWins / totalHypGames : 0

      scheduleMatrix.push({
        teamRosterId: teamA.rosterId,
        scheduleOfRosterId: teamB.rosterId,
        hypotheticalWins: hypWins,
        hypotheticalLosses: hypLosses,
        hypotheticalTies: hypTies,
        winPct,
      })
    }
  }

  return {
    teams,
    weeksAvailable: completedWeeks,
    hasMedian: hasMedianMatch,
    totalTeams,
    regularSeasonWeeks,
    completedWeeksCount: completedWeeks.length,
    leagueName: league.name || 'Sleeper League',
    leagueId: league.league_id,
    season: league.season,
    scoringPpr: league.scoring_settings?.rec ?? 0,
    superlatives: {
      luckiestTeam,
      unluckiestTeam,
      highestScorer,
      brutalSchedule,
      bestWeek: overallBestWeek,
      worstWeek: overallWorstWeek,
      biggestBadBeats: allBadBeats.slice(0, 10),
      luckiestEscapes: allLuckyEscapes.slice(0, 10),
    },
    scheduleMatrix,
  }
}
