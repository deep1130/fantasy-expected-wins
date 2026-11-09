import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUpDown,
  Award,
  Calendar,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Flame,
  Grid3x3,
  RefreshCw,
  Scale,
  Search,
  Share2,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import {
  computeExpectedWins,
  type ExpectedWinsAnalysis,
  type TeamSeasonSummary,
} from './expectedWins'
import { loadLeagueData, type LeagueData } from './sleeper'
import './App.css'

type View = 'standings' | 'weekly' | 'matrix' | 'superlatives'
type SortField =
  | 'expectedWins'
  | 'actualWins'
  | 'luck'
  | 'allPlay'
  | 'pointsFor'
  | 'pointsAgainst'
  | 'avgRank'

const formatDec = (val: number, decimals = 2) =>
  val.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

const formatPct = (val: number) => `${(val * 100).toFixed(1)}%`

function getInitialLeagueId(): string {
  if (typeof window !== 'undefined') {
    const fromQuery = new URLSearchParams(window.location.search).get('league')
    if (fromQuery && fromQuery.trim()) return fromQuery.trim()
    const fromHash = window.location.hash.replace(/^#\/?/, '').trim()
    if (fromHash && /^\d+$/.test(fromHash)) return fromHash
    const saved = localStorage.getItem('last_expected_wins_league_id')
    if (saved && saved.trim()) return saved.trim()
  }
  return ''
}

export default function App() {
  const initialId = useMemo(getInitialLeagueId, [])
  const [leagueId, setLeagueId] = useState(initialId)
  const [data, setData] = useState<LeagueData | null>(null)
  const [busy, setBusy] = useState(Boolean(initialId))
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>('standings')
  const [selectedWeek, setSelectedWeek] = useState<number>(1)
  const [sortBy, setSortBy] = useState<SortField>('expectedWins')
  const [sortAsc, setSortAsc] = useState<boolean>(false)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [matrixTeamId, setMatrixTeamId] = useState<number | null>(null)
  const [showRawMatrix, setShowRawMatrix] = useState<boolean>(false)
  const [includeLiveWeek, setIncludeLiveWeek] = useState<boolean>(false)

  async function refresh(targetId?: string) {
    const activeId = (targetId ?? leagueId).trim()
    if (!activeId) {
      setError('Please enter a Sleeper League ID.')
      setBusy(false)
      return
    }

    setBusy(true)
    setError('')
    try {
      const nextData = await loadLeagueData(activeId)
      setData(nextData)
      setLastUpdated(Date.now())
      if (typeof window !== 'undefined') {
        localStorage.setItem('last_expected_wins_league_id', activeId)
        const url = new URL(window.location.href)
        url.searchParams.set('league', activeId)
        window.history.replaceState({}, '', url.toString())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load league data from Sleeper.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const id = getInitialLeagueId()
    if (id) {
      refresh(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const analysis: ExpectedWinsAnalysis | null = useMemo(() => {
    if (!data) return null
    try {
      return computeExpectedWins(data, { includeInProgress: includeLiveWeek })
    } catch (err) {
      console.error('Error computing expected wins:', err)
      return null
    }
  }, [data, includeLiveWeek])

  // Update selected week when analysis loads
  useEffect(() => {
    if (analysis && analysis.weeksAvailable.length > 0) {
      setSelectedWeek(analysis.weeksAvailable[analysis.weeksAvailable.length - 1])
    }
  }, [analysis])

  async function handleShare() {
    const activeId = leagueId.trim()
    if (!activeId || typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('league', activeId)
    const shareUrl = url.toString()
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy shareable link:', shareUrl)
    }
  }

  function handleSort(field: SortField) {
    if (sortBy === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortBy(field)
      setSortAsc(field === 'avgRank' || field === 'pointsAgainst') // lower rank/PA usually asc
    }
  }

  // Filtered and sorted teams
  const displayTeams = useMemo(() => {
    if (!analysis) return []
    let list = [...analysis.teams]

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (t) =>
          t.teamName.toLowerCase().includes(q) ||
          (t.user?.display_name && t.user.display_name.toLowerCase().includes(q)) ||
          `team ${t.rosterId}`.includes(q),
      )
    }

    list.sort((a, b) => {
      let diff = 0
      switch (sortBy) {
        case 'expectedWins':
          diff = b.expectedWins - a.expectedWins || b.pointsFor - a.pointsFor
          break
        case 'actualWins':
          diff = b.actualWins - a.actualWins || b.pointsFor - a.pointsFor
          break
        case 'luck':
          diff = b.luckDelta - a.luckDelta
          break
        case 'allPlay':
          diff = b.allPlayWinPct - a.allPlayWinPct || b.allPlayWins - a.allPlayWins
          break
        case 'pointsFor':
          diff = b.pointsFor - a.pointsFor
          break
        case 'pointsAgainst':
          diff = b.pointsAgainst - a.pointsAgainst
          break
        case 'avgRank':
          diff = a.avgWeeklyRank - b.avgWeeklyRank
          break
      }
      return sortAsc ? -diff : diff
    })

    return list
  }, [analysis, search, sortBy, sortAsc])

  // Weekly matchup view items
  const selectedWeekPerformances = useMemo(() => {
    if (!analysis) return []
    const weekItems: {
      team: TeamSeasonSummary
      perf: TeamSeasonSummary['weeklyPerformances'][number]
    }[] = []

    for (const team of analysis.teams) {
      const p = team.weeklyPerformances.find((w) => w.week === selectedWeek)
      if (p) {
        weekItems.push({ team, perf: p })
      }
    }

    return weekItems.sort((a, b) => b.perf.points - a.perf.points)
  }, [analysis, selectedWeek])

  // Head-to-Head matchup pairs for the selected week
  const selectedWeekMatchupPairs = useMemo(() => {
    if (!analysis || !data) return []
    const feed = data.weeks[selectedWeek]
    if (!feed || !feed.matchups) return []

    const pairsMap = new Map<number, typeof feed.matchups>()
    for (const m of feed.matchups) {
      if (m.matchup_id != null) {
        const list = pairsMap.get(m.matchup_id) || []
        list.push(m)
        pairsMap.set(m.matchup_id, list)
      }
    }

    const teamLookup = new Map<number, TeamSeasonSummary>()
    for (const t of analysis.teams) {
      teamLookup.set(t.rosterId, t)
    }

    const result: {
      matchupId: number
      teamA: { team: TeamSeasonSummary; points: number; rank: number; xWin: number; won: boolean; tied: boolean }
      teamB?: { team: TeamSeasonSummary; points: number; rank: number; xWin: number; won: boolean; tied: boolean }
    }[] = []

    for (const [mId, mList] of pairsMap.entries()) {
      if (mList.length === 0) continue
      const mA = mList[0]
      const teamA = teamLookup.get(mA.roster_id)
      if (!teamA) continue

      const perfA = teamA.weeklyPerformances.find((p) => p.week === selectedWeek)
      const ptsA = perfA ? perfA.points : Number(mA.points) || 0
      const rankA = perfA ? perfA.rank : 1
      const xWinA = perfA ? perfA.h2hExpectedWins : 0

      if (mList.length > 1) {
        const mB = mList[1]
        const teamB = teamLookup.get(mB.roster_id)
        if (teamB) {
          const perfB = teamB.weeklyPerformances.find((p) => p.week === selectedWeek)
          const ptsB = perfB ? perfB.points : Number(mB.points) || 0
          const rankB = perfB ? perfB.rank : 1
          const xWinB = perfB ? perfB.h2hExpectedWins : 0

          result.push({
            matchupId: mId,
            teamA: {
              team: teamA,
              points: ptsA,
              rank: rankA,
              xWin: xWinA,
              won: ptsA > ptsB,
              tied: ptsA === ptsB,
            },
            teamB: {
              team: teamB,
              points: ptsB,
              rank: rankB,
              xWin: xWinB,
              won: ptsB > ptsA,
              tied: ptsA === ptsB,
            },
          })
          continue
        }
      }

      result.push({
        matchupId: mId,
        teamA: {
          team: teamA,
          points: ptsA,
          rank: rankA,
          xWin: xWinA,
          won: ptsA > 0,
          tied: false,
        },
      })
    }

    return result
  }, [analysis, data, selectedWeek])

  // Active team for mobile schedule matrix inspector
  const activeMatrixTeam = useMemo(() => {
    if (!analysis || analysis.teams.length === 0) return null
    if (matrixTeamId != null) {
      const found = analysis.teams.find((t) => t.rosterId === matrixTeamId)
      if (found) return found
    }
    return analysis.teams[0]
  }, [analysis, matrixTeamId])

  // Simulated schedule comparisons for the active team
  const matrixComparisons = useMemo(() => {
    if (!analysis || !activeMatrixTeam) return []
    const results: {
      ownerTeam: TeamSeasonSummary
      hypotheticalWins: number
      hypotheticalLosses: number
      hypotheticalTies: number
      winPct: number
      isOwn: boolean
      deltaFromOwn: number
    }[] = []

    const ownEntry = analysis.scheduleMatrix.find(
      (m) =>
        m.teamRosterId === activeMatrixTeam.rosterId &&
        m.scheduleOfRosterId === activeMatrixTeam.rosterId,
    )
    const ownWins = ownEntry ? ownEntry.hypotheticalWins : activeMatrixTeam.actualWins

    for (const otherTeam of analysis.teams) {
      const entry = analysis.scheduleMatrix.find(
        (m) =>
          m.teamRosterId === activeMatrixTeam.rosterId &&
          m.scheduleOfRosterId === otherTeam.rosterId,
      )
      if (entry) {
        results.push({
          ownerTeam: otherTeam,
          hypotheticalWins: entry.hypotheticalWins,
          hypotheticalLosses: entry.hypotheticalLosses,
          hypotheticalTies: entry.hypotheticalTies,
          winPct: entry.winPct,
          isOwn: otherTeam.rosterId === activeMatrixTeam.rosterId,
          deltaFromOwn: entry.hypotheticalWins - ownWins,
        })
      }
    }

    return results.sort((a, b) => b.hypotheticalWins - a.hypotheticalWins)
  }, [analysis, activeMatrixTeam])

  const totalTeams = analysis?.totalTeams ?? data?.rosters.length ?? 12
  const hasMedian = analysis?.hasMedian ?? false

  return (
    <main className="app-shell">
      <header className="topbar">
        <a href="/" className="brand" title="Fantasy Expected Wins">
          <span className="brand-mark"><Scale size={16} /></span>
          <span>xWINS <span className="brand-light">· EXPECTED WINS</span></span>
        </a>
        <div className="topbar-right">
          <span className="season-label">
            {data ? `${data.league.season} · ${hasMedian ? 'H2H + MEDIAN' : 'H2H ONLY'}` : 'SLEEPER FANTASY'}
          </span>
          <span className="live-dot" />
          <span className="live-label">LIVE DATA</span>
        </div>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow">
            FANTASY SCHEDULE LUCK <span>·</span> {analysis ? analysis.leagueName.toUpperCase() : 'SLEEPER ANALYTICS'}
          </p>
          <h1>
            Expected Wins &amp; <em>Schedule Luck</em>
          </h1>
          <p className="intro-copy">
            Head-to-head records are heavily warped by who you happen to play each week.
            Expected wins calculates what your true win record should be based on your weekly scoring rank across the entire league.
          </p>
        </div>

        <div className="league-control">
          <label htmlFor="league-id">SLEEPER LEAGUE ID</label>
          <div className="league-input-row">
            <input
              id="league-id"
              type="text"
              value={leagueId}
              onChange={(e) => setLeagueId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && refresh()}
              placeholder="e.g. 1124455667788"
              aria-label="Sleeper League ID"
              disabled={busy}
            />
            <button
              type="button"
              className={`share-button ${copied ? 'copied' : ''}`}
              onClick={handleShare}
              title="Copy shareable link"
              disabled={busy || !leagueId.trim()}
            >
              {copied ? <Check size={13} /> : <Share2 size={13} />}
              <span>{copied ? 'Copied' : 'Share'}</span>
            </button>
            <button
              type="button"
              className="refresh-button"
              onClick={() => refresh()}
              disabled={busy || !leagueId.trim()}
            >
              <RefreshCw size={13} className={busy ? 'spin' : ''} />
              <span>{busy ? 'Loading…' : 'Refresh'}</span>
            </button>
          </div>
          <div className="refresh-meta">
            <Clock3 size={11} />
            <span>
              {lastUpdated
                ? `UPDATED ${new Date(lastUpdated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                : 'ENTER LEAGUE ID AND CLICK REFRESH'}
            </span>
          </div>
        </div>
      </section>

      {error && (
        <div className="error-banner" role="alert">
          <CircleAlert size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      {/* Summary Strip (4 KPI items) */}
      <section className="summary-strip" aria-label="League Overview">
        <div className="summary-item">
          <span className="summary-label">LEAGUE &amp; FORMAT</span>
          <strong>{analysis?.leagueName ?? (busy ? 'Connecting…' : 'No league loaded')}</strong>
          <span className="summary-note">
            {analysis
              ? `${analysis.totalTeams} teams · ${hasMedian ? '2 Wins/Wk (H2H + Median)' : '1 Win/Wk (H2H)'}`
              : 'Enter Sleeper League ID above'}
          </span>
        </div>

        <div className="summary-item">
          <span className="summary-label">SEASON PROGRESS</span>
          <strong>
            {analysis
              ? analysis.isUsingLiveWeek
                ? `WEEK ${analysis.completedWeeksCount} OF ${analysis.regularSeasonWeeks} (LIVE)`
                : `WEEK ${analysis.lastScoredWeek} OF ${analysis.regularSeasonWeeks}`
              : '--'}
          </strong>
          <span className="summary-note">
            {analysis
              ? analysis.isUsingLiveWeek
                ? `Includes live in-progress Week ${analysis.inProgressWeek}`
                : `Official record through Week ${analysis.lastScoredWeek} (Finalized)`
              : 'Awaiting league connection'}
          </span>
        </div>

        <div className="summary-item">
          <span className="summary-label">
            <Sparkles size={11} className="label-icon luck-icon" /> LUCKIEST FRANCHISE
          </span>
          <strong>
            {analysis?.superlatives.luckiestTeam ? (
              <span className="lucky-val">
                {analysis.superlatives.luckiestTeam.teamName}
                <span className="kpi-luck-badge positive">
                  +{formatDec(analysis.superlatives.luckiestTeam.luckDelta, 1)} W
                </span>
              </span>
            ) : '--'}
          </strong>
          <span className="summary-note">
            {analysis?.superlatives.luckiestTeam
              ? `${formatDec(analysis.superlatives.luckiestTeam.actualWins, 0)} actual wins vs ${formatDec(analysis.superlatives.luckiestTeam.expectedWins, 1)} expected`
              : 'Benefited most from favorable scheduling'}
          </span>
        </div>

        <div className="summary-item">
          <span className="summary-label">
            <ShieldAlert size={11} className="label-icon unluck-icon" /> BIGGEST SCHEDULE VICTIM
          </span>
          <strong>
            {analysis?.superlatives.unluckiestTeam ? (
              <span className="unlucky-val">
                {analysis.superlatives.unluckiestTeam.teamName}
                <span className="kpi-luck-badge negative">
                  {formatDec(analysis.superlatives.unluckiestTeam.luckDelta, 1)} W
                </span>
              </span>
            ) : '--'}
          </strong>
          <span className="summary-note">
            {analysis?.superlatives.unluckiestTeam
              ? `${formatDec(analysis.superlatives.unluckiestTeam.actualWins, 0)} actual wins vs ${formatDec(analysis.superlatives.unluckiestTeam.expectedWins, 1)} expected`
              : 'Cost the most wins by tough opponents'}
          </span>
        </div>
      </section>

      {/* Live in-progress week banner & toggle */}
      {analysis && analysis.inProgressWeek != null && (
        <div className="live-week-banner">
          <div className="live-week-info">
            <span className="live-dot" />
            <div className="live-week-text">
              <strong>Week {analysis.inProgressWeek} Games In Progress</strong>
              <span>
                {analysis.isUsingLiveWeek
                  ? `Standings currently include live projected scores from Week ${analysis.inProgressWeek} (games not final).`
                  : `Standings show official finalized results through Week ${analysis.lastScoredWeek} (games not final).`}
              </span>
            </div>
          </div>
          <button
            type="button"
            className={`live-toggle-button ${analysis.isUsingLiveWeek ? 'active' : ''}`}
            onClick={() => setIncludeLiveWeek(!includeLiveWeek)}
          >
            <Flame size={13} />
            <span>{analysis.isUsingLiveWeek ? 'Switch to Official Finalized' : `Include Live Week ${analysis.inProgressWeek} Scores`}</span>
          </button>
        </div>
      )}

      {/* Main Board Section */}
      <section className="main-board-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {view === 'standings' && 'OVERALL STANDINGS'}
              {view === 'weekly' && `WEEK ${selectedWeek} MATCHUPS & RANKS`}
              {view === 'matrix' && 'SCHEDULE MATRIX (WHAT IF?)'}
              {view === 'superlatives' && 'ROBBERIES & ESCAPES'}
              <span>·</span> {analysis ? `${analysis.totalTeams} TEAMS` : 'EXPECTED WINS'}
            </p>
            <h2>
              {view === 'standings' && 'True Expected Standings'}
              {view === 'weekly' && `Week ${selectedWeek} Scoring & Win Shares`}
              {view === 'matrix' && 'Opponent Schedule Comparison Matrix'}
              {view === 'superlatives' && 'Worst Bad Beats & Lucky Escapes'}
            </h2>
          </div>

          <div className="board-tools">
            {view === 'standings' && (
              <div className="search-box">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Filter teams…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            )}

            {view === 'weekly' && analysis && analysis.weeksAvailable.length > 0 && (
              <div className="week-selector">
                <Calendar size={13} />
                <select
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(Number(e.target.value))}
                  aria-label="Select week"
                >
                  {analysis.weeksAvailable.map((w) => (
                    <option key={w} value={w}>
                      Week {w}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="view-tabs" role="tablist">
              <button
                type="button"
                className={view === 'standings' ? 'selected' : ''}
                onClick={() => setView('standings')}
              >
                <Trophy size={12} />
                <span>Standings</span>
              </button>
              <button
                type="button"
                className={view === 'weekly' ? 'selected' : ''}
                onClick={() => setView('weekly')}
              >
                <Calendar size={12} />
                <span>Weekly</span>
              </button>
              <button
                type="button"
                className={view === 'matrix' ? 'selected' : ''}
                onClick={() => setView('matrix')}
              >
                <Grid3x3 size={12} />
                <span className="tab-label-full">Schedule Matrix</span>
                <span className="tab-label-short">Matrix</span>
              </button>
              <button
                type="button"
                className={view === 'superlatives' ? 'selected' : ''}
                onClick={() => setView('superlatives')}
              >
                <Award size={12} />
                <span>Bad Beats</span>
              </button>
            </div>
          </div>
        </div>

        {/* VIEW 1: STANDINGS TABLE & MOBILE CARDS */}
        {view === 'standings' && (
          <>
            {/* Desktop Full Table View (>= 769px) */}
            <div className="desktop-table-view">
              <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="th-rank">#</th>
                  <th>FRANCHISE</th>
                  <th
                    className="th-sortable"
                    onClick={() => handleSort('expectedWins')}
                    title="Expected Wins (Rank-based win probability)"
                  >
                    EXPECTED W–L <ArrowUpDown size={11} />
                  </th>
                  <th
                    className="th-sortable"
                    onClick={() => handleSort('actualWins')}
                    title="Actual official Sleeper record"
                  >
                    ACTUAL W–L <ArrowUpDown size={11} />
                  </th>
                  <th
                    className="th-sortable"
                    onClick={() => handleSort('luck')}
                    title="Luck Delta: Actual Wins minus Expected Wins"
                  >
                    LUCK Δ <ArrowUpDown size={11} />
                  </th>
                  <th
                    className="th-sortable"
                    onClick={() => handleSort('allPlay')}
                    title="Record if every team played every other team every week"
                  >
                    ALL-PLAY <ArrowUpDown size={11} />
                  </th>
                  <th
                    className="th-sortable"
                    onClick={() => handleSort('pointsFor')}
                    title="Total Starter Points For"
                  >
                    POINTS FOR <ArrowUpDown size={11} />
                  </th>
                  <th
                    className="th-sortable"
                    onClick={() => handleSort('pointsAgainst')}
                    title="Total Points Against (opponent scores)"
                  >
                    POINTS AGAINST <ArrowUpDown size={11} />
                  </th>
                  <th
                    className="th-sortable"
                    onClick={() => handleSort('avgRank')}
                    title="Average scoring rank in the league per week"
                  >
                    AVG RANK <ArrowUpDown size={11} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayTeams.map((team, idx) => {
                  const luckSign = team.luckDelta > 0 ? '+' : ''
                  const luckFormatted = `${luckSign}${formatDec(team.luckDelta, 2)}`
                  return (
                    <tr key={team.rosterId}>
                      <td className="td-rank">{idx + 1}</td>
                      <td>
                        <div className="team-cell">
                          {team.avatarUrl ? (
                            <img
                              src={team.avatarUrl}
                              alt={team.teamName}
                              className="team-avatar"
                              loading="lazy"
                            />
                          ) : (
                            <div className="team-avatar-fallback">
                              {team.teamName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="team-meta">
                            <span className="team-title">{team.teamName}</span>
                            <span className="team-sub">
                              {team.user?.display_name ?? `Team ${team.rosterId}`}
                              {hasMedian ? ` · Med: ${formatDec(team.medianActualWins, 0)}-${formatDec(team.medianActualLosses, 0)}` : ''}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Expected W-L */}
                      <td>
                        <div className="stat-primary">
                          <strong>{formatDec(team.expectedWins, 2)} – {formatDec(team.expectedLosses, 2)}</strong>
                          <span className="stat-sub">{formatPct(team.expectedWinPct)}</span>
                        </div>
                      </td>

                      {/* Actual W-L */}
                      <td>
                        <div className="stat-primary">
                          <strong>
                            {team.actualWins} – {team.actualLosses}
                            {team.actualTies > 0 ? ` – ${team.actualTies}` : ''}
                          </strong>
                          <span className="stat-sub">{formatPct(team.actualWinPct)}</span>
                        </div>
                      </td>

                      {/* Luck Delta */}
                      <td>
                        <span className={`luck-pill ${team.luckTier}`}>
                          {team.luckTier === 'very-lucky' || team.luckTier === 'lucky' ? (
                            <Flame size={12} />
                          ) : team.luckTier === 'very-unlucky' || team.luckTier === 'unlucky' ? (
                            <ShieldAlert size={12} />
                          ) : (
                            <Scale size={12} />
                          )}
                          <strong>{luckFormatted}</strong>
                          <span className="luck-label">
                            {team.luckTier === 'very-lucky'
                              ? 'Very Lucky'
                              : team.luckTier === 'lucky'
                              ? 'Lucky'
                              : team.luckTier === 'very-unlucky'
                              ? 'Very Unlucky'
                              : team.luckTier === 'unlucky'
                              ? 'Unlucky'
                              : 'Even'}
                          </span>
                        </span>
                      </td>

                      {/* All-Play Record */}
                      <td>
                        <div className="stat-primary">
                          <strong>{team.allPlayWins}–{team.allPlayLosses}</strong>
                          <span className="stat-sub">{formatPct(team.allPlayWinPct)}</span>
                        </div>
                      </td>

                      {/* Points For */}
                      <td>
                        <div className="stat-primary">
                          <strong>{formatDec(team.pointsFor, 1)}</strong>
                          <span className="stat-sub">#{team.pfRank} · {formatDec(team.avgPointsFor, 1)}/wk</span>
                        </div>
                      </td>

                      {/* Points Against */}
                      <td>
                        <div className="stat-primary">
                          <strong>{formatDec(team.pointsAgainst, 1)}</strong>
                          <span className="stat-sub">#{team.paRank} · {formatDec(team.avgPointsAgainst, 1)}/wk</span>
                        </div>
                      </td>

                      {/* Avg Weekly Rank */}
                      <td>
                        <div className="stat-primary">
                          <strong>{formatDec(team.avgWeeklyRank, 1)}</strong>
                          <span className="stat-sub">of {totalTeams}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {!data && (
                  <tr>
                    <td colSpan={9} className="empty-cell">
                      {busy ? (
                        <>
                          <RefreshCw size={16} className="spin" /> Loading Sleeper league data…
                        </>
                      ) : (
                        <div className="empty-prompt">
                          <p>Enter any public Sleeper League ID above to calculate live expected wins and schedule luck.</p>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                {data && displayTeams.length === 0 && (
                  <tr>
                    <td colSpan={9} className="empty-cell">
                      No franchises match “{search}”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Adaptive Cards View (<= 768px, NO horizontal scrolling) */}
        <div className="mobile-cards-view">
          {data && displayTeams.length > 0 && (
            <div className="mobile-sort-bar">
              <div className="m-sort-field-wrap">
                <span className="m-sort-label">SORT BY</span>
                <select
                  value={sortBy}
                  onChange={(e) => handleSort(e.target.value as SortField)}
                  className="m-sort-select"
                  aria-label="Sort standings by"
                >
                  <option value="expectedWins">Expected W–L (xWins)</option>
                  <option value="actualWins">Actual W–L</option>
                  <option value="luck">Schedule Luck Δ</option>
                  <option value="allPlay">All-Play Record</option>
                  <option value="pointsFor">Points For (PF)</option>
                  <option value="pointsAgainst">Points Against (PA)</option>
                  <option value="avgRank">Average Rank</option>
                </select>
              </div>
              <button
                type="button"
                className="m-sort-dir-btn"
                onClick={() => setSortAsc(!sortAsc)}
                aria-label={sortAsc ? 'Sort ascending' : 'Sort descending'}
              >
                <ArrowUpDown size={12} />
                <span>{sortAsc ? 'ASC' : 'DESC'}</span>
              </button>
            </div>
          )}

          <div className="m-standings-card-list">
            {displayTeams.map((team, idx) => {
              const luckSign = team.luckDelta > 0 ? '+' : ''
              const luckFormatted = `${luckSign}${formatDec(team.luckDelta, 2)}`
              return (
                <div key={team.rosterId} className="m-standings-card">
                  <div className="m-card-header">
                    <div className="m-card-identity">
                      <span className="m-card-rank">#{idx + 1}</span>
                      {team.avatarUrl ? (
                        <img
                          src={team.avatarUrl}
                          alt={team.teamName}
                          className="team-avatar"
                          loading="lazy"
                        />
                      ) : (
                        <div className="team-avatar-fallback">
                          {team.teamName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="team-meta">
                        <span className="team-title">{team.teamName}</span>
                        <span className="team-sub">
                          {team.user?.display_name ?? `Team ${team.rosterId}`}
                          {hasMedian ? ` · Med: ${formatDec(team.medianActualWins, 0)}-${formatDec(team.medianActualLosses, 0)}` : ''}
                        </span>
                      </div>
                    </div>

                    <span className={`luck-pill ${team.luckTier}`}>
                      {team.luckTier === 'very-lucky' || team.luckTier === 'lucky' ? (
                        <Flame size={12} />
                      ) : team.luckTier === 'very-unlucky' || team.luckTier === 'unlucky' ? (
                        <ShieldAlert size={12} />
                      ) : (
                        <Scale size={12} />
                      )}
                      <strong>{luckFormatted} W</strong>
                    </span>
                  </div>

                  <div className="m-card-metrics-grid">
                    <div className="m-metric-cell highlight">
                      <span className="m-metric-label">EXPECTED W–L</span>
                      <strong className="m-metric-val accent">
                        {formatDec(team.expectedWins, 1)}–{formatDec(team.expectedLosses, 1)}
                      </strong>
                      <span className="m-metric-sub">{formatPct(team.expectedWinPct)} exp</span>
                    </div>

                    <div className="m-metric-cell">
                      <span className="m-metric-label">ACTUAL W–L</span>
                      <strong className="m-metric-val">
                        {team.actualWins}–{team.actualLosses}
                        {team.actualTies > 0 ? `–${team.actualTies}` : ''}
                      </strong>
                      <span className="m-metric-sub">{formatPct(team.actualWinPct)} act</span>
                    </div>

                    <div className="m-metric-cell">
                      <span className="m-metric-label">ALL-PLAY</span>
                      <strong className="m-metric-val">
                        {team.allPlayWins}–{team.allPlayLosses}
                      </strong>
                      <span className="m-metric-sub">{formatPct(team.allPlayWinPct)}</span>
                    </div>

                    <div className="m-metric-cell">
                      <span className="m-metric-label">POINTS FOR</span>
                      <strong className="m-metric-val">
                        {formatDec(team.pointsFor, 1)}
                      </strong>
                      <span className="m-metric-sub">#{team.pfRank} · {formatDec(team.avgPointsFor, 1)}/wk</span>
                    </div>

                    <div className="m-metric-cell">
                      <span className="m-metric-label">POINTS AGAINST</span>
                      <strong className="m-metric-val">
                        {formatDec(team.pointsAgainst, 1)}
                      </strong>
                      <span className="m-metric-sub">#{team.paRank} · {formatDec(team.avgPointsAgainst, 1)}/wk</span>
                    </div>

                    <div className="m-metric-cell">
                      <span className="m-metric-label">AVG SCORING RANK</span>
                      <strong className="m-metric-val">
                        #{formatDec(team.avgWeeklyRank, 1)}
                      </strong>
                      <span className="m-metric-sub">of {totalTeams} teams</span>
                    </div>
                  </div>
                </div>
              )
            })}

            {!data && (
              <div className="empty-card">
                {busy ? (
                  <p><RefreshCw size={16} className="spin" /> Loading Sleeper league data…</p>
                ) : (
                  <p>Enter any public Sleeper League ID above to calculate live expected wins and schedule luck.</p>
                )}
              </div>
            )}
            {data && displayTeams.length === 0 && (
              <div className="empty-card">
                <p>No franchises match “{search}”.</p>
              </div>
            )}
          </div>
        </div>
      </>
    )}

        {/* VIEW 2: WEEKLY BREAKDOWN */}
        {view === 'weekly' && analysis && (
          <div className="weekly-container">
            {selectedWeek > analysis.lastScoredWeek && (
              <div className="weekly-in-progress-notice">
                <Flame size={14} />
                <span>
                  <strong>Week {selectedWeek} is currently in progress:</strong> Scores and results shown below are live projections until all games conclude.
                </span>
              </div>
            )}

            <div className="weekly-subhead">
              <span className="weekly-summary-pill">
                Week {selectedWeek} · {selectedWeekPerformances.length} Franchises · {hasMedian ? 'H2H + Top-Half Median Win Active' : 'Head-to-Head Scoring'}
              </span>
              {hasMedian && selectedWeekPerformances.length > 0 && (
                <span className="weekly-median-score">
                  Median Cut-Off Score:{' '}
                  <strong>
                    {formatDec(
                      selectedWeekPerformances[Math.floor(selectedWeekPerformances.length / 2) - 1]?.perf.points ?? 0,
                      1,
                    )}{' '}
                    pts
                  </strong>
                </span>
              )}
            </div>

            {/* Matchup cards grid for selected week */}
            <div className="matchups-grid">
              {selectedWeekMatchupPairs.map((pair) => {
                const a = pair.teamA
                const b = pair.teamB
                return (
                  <div key={pair.matchupId} className="matchup-card">
                    <div className="matchup-header">
                      <span className="matchup-tag">MATCHUP {pair.matchupId}</span>
                      <span className="matchup-tag-sub">WEEK {selectedWeek}</span>
                    </div>

                    <div className="matchup-body">
                      {/* Team A */}
                      <div className={`matchup-team ${a.won ? 'winner' : ''}`}>
                        <div className="matchup-team-info">
                          <span className="matchup-team-name">{a.team.teamName}</span>
                          <span className="matchup-team-sub">
                            Rank #{a.rank} of {totalTeams} · xWin: {formatDec(a.xWin, 2)}
                          </span>
                        </div>
                        <div className="matchup-score-box">
                          <span className="matchup-points">{formatDec(a.points, 2)}</span>
                          <span className={`matchup-result-badge ${a.won ? 'w' : a.tied ? 't' : 'l'}`}>
                            {a.won ? 'WIN' : a.tied ? 'TIE' : 'LOSS'}
                          </span>
                        </div>
                      </div>

                      {/* Team B */}
                      {b ? (
                        <div className={`matchup-team ${b.won ? 'winner' : ''}`}>
                          <div className="matchup-team-info">
                            <span className="matchup-team-name">{b.team.teamName}</span>
                            <span className="matchup-team-sub">
                              Rank #{b.rank} of {totalTeams} · xWin: {formatDec(b.xWin, 2)}
                            </span>
                          </div>
                          <div className="matchup-score-box">
                            <span className="matchup-points">{formatDec(b.points, 2)}</span>
                            <span className={`matchup-result-badge ${b.won ? 'w' : b.tied ? 't' : 'l'}`}>
                              {b.won ? 'WIN' : b.tied ? 'TIE' : 'LOSS'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="matchup-team bye">
                          <span className="matchup-team-name">BYE WEEK</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Weekly scoring leaderboard table & mobile cards */}
            <div className="weekly-leaderboard-box">
              <h3>Week {selectedWeek} Complete League Leaderboard</h3>

              {/* Desktop Leaderboard Table (>= 769px) */}
              <div className="desktop-table-view">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th className="th-rank">RANK</th>
                        <th>FRANCHISE</th>
                        <th>WEEK SCORE</th>
                        <th>H2H OPPONENT</th>
                        <th>H2H RESULT</th>
                        <th>EXPECTED WIN SHARE</th>
                        {hasMedian && <th>MEDIAN WIN</th>}
                        <th>WEEKLY LUCK Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedWeekPerformances.map((item, idx) => {
                        const p = item.perf
                        const medianCutoffIdx = Math.floor(selectedWeekPerformances.length / 2)
                        const isMedianBoundary = hasMedian && idx === medianCutoffIdx - 1
                        const oppTeam = p.oppRosterId
                          ? analysis.teams.find((t) => t.rosterId === p.oppRosterId)
                          : null

                        return (
                          <tr
                            key={item.team.rosterId}
                            className={isMedianBoundary ? 'median-boundary-row' : ''}
                          >
                            <td className="td-rank">#{p.rank}</td>
                            <td>
                              <div className="team-cell">
                                <span className="team-title">{item.team.teamName}</span>
                              </div>
                            </td>
                            <td>
                              <strong>{formatDec(p.points, 2)}</strong> pts
                            </td>
                            <td>
                              {oppTeam ? (
                                <span className="opp-meta">
                                  vs {oppTeam.teamName} ({formatDec(p.oppPoints ?? 0, 1)})
                                </span>
                              ) : (
                                <span className="summary-muted">Bye</span>
                              )}
                            </td>
                            <td>
                              <span
                                className={`matchup-result-badge ${
                                  p.h2hActualWins === 1 ? 'w' : p.h2hActualWins === 0.5 ? 't' : 'l'
                                }`}
                              >
                                {p.h2hActualWins === 1 ? 'WIN' : p.h2hActualWins === 0.5 ? 'TIE' : 'LOSS'}
                              </span>
                            </td>
                            <td>
                              <strong>{formatDec(p.h2hExpectedWins, 2)}</strong>
                              <span className="stat-sub">
                                ({p.allPlayWins}/{totalTeams - 1} beaten)
                              </span>
                            </td>
                            {hasMedian && (
                              <td>
                                <span className={`median-pill ${p.medianActualWins === 1 ? 'earned' : 'missed'}`}>
                                  {p.medianActualWins === 1 ? '+1.0 WIN' : '0.0'}
                                </span>
                              </td>
                            )}
                            <td>
                              <span
                                className={`luck-tag ${
                                  p.totalLuck > 0.15 ? 'pos' : p.totalLuck < -0.15 ? 'neg' : 'neu'
                                }`}
                              >
                                {p.totalLuck > 0 ? '+' : ''}
                                {formatDec(p.totalLuck, 2)}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Leaderboard Cards (<= 768px, NO horizontal scrolling) */}
              <div className="mobile-cards-view">
                <div className="m-weekly-cards-list">
                  {selectedWeekPerformances.map((item, idx) => {
                    const p = item.perf
                    const medianCutoffIdx = Math.floor(selectedWeekPerformances.length / 2)
                    const isMedianBoundary = hasMedian && idx === medianCutoffIdx - 1
                    const oppTeam = p.oppRosterId
                      ? analysis.teams.find((t) => t.rosterId === p.oppRosterId)
                      : null

                    return (
                      <div key={item.team.rosterId} className="m-weekly-item-wrap">
                        <div className="m-weekly-card">
                          <div className="m-weekly-card-top">
                            <div className="m-weekly-team-group">
                              <span className="m-weekly-rank">#{p.rank}</span>
                              <span className="m-weekly-team-name">{item.team.teamName}</span>
                            </div>
                            <span className="m-weekly-score">
                              <strong>{formatDec(p.points, 2)}</strong> pts
                            </span>
                          </div>

                          <div className="m-weekly-card-bottom">
                            <div className="m-weekly-opp-line">
                              {oppTeam ? (
                                <>
                                  <span className="m-opp-label">vs {oppTeam.teamName}</span>
                                  <span className="m-opp-pts">({formatDec(p.oppPoints ?? 0, 1)})</span>
                                </>
                              ) : (
                                <span className="m-opp-label">Bye Week</span>
                              )}
                              <span
                                className={`matchup-result-badge ${
                                  p.h2hActualWins === 1 ? 'w' : p.h2hActualWins === 0.5 ? 't' : 'l'
                                }`}
                              >
                                {p.h2hActualWins === 1 ? 'WIN' : p.h2hActualWins === 0.5 ? 'TIE' : 'LOSS'}
                              </span>
                            </div>

                            <div className="m-weekly-stats-chips">
                              <span className="m-chip">
                                xW: <strong>{formatDec(p.h2hExpectedWins, 2)}</strong>
                              </span>
                              {hasMedian && (
                                <span
                                  className={`m-chip ${
                                    p.medianActualWins === 1 ? 'earned' : 'missed'
                                  }`}
                                >
                                  Median: <strong>{p.medianActualWins === 1 ? '+1.0' : '0.0'}</strong>
                                </span>
                              )}
                              <span
                                className={`luck-tag ${
                                  p.totalLuck > 0.15 ? 'pos' : p.totalLuck < -0.15 ? 'neg' : 'neu'
                                }`}
                              >
                                {p.totalLuck > 0 ? '+' : ''}
                                {formatDec(p.totalLuck, 2)} Luck
                              </span>
                            </div>
                          </div>
                        </div>

                        {isMedianBoundary && (
                          <div className="m-median-divider">
                            <Award size={13} />
                            <span>MEDIAN CUTOFF · TOP {medianCutoffIdx} TEAMS GET +1.0 MEDIAN WIN</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: SCHEDULE LUCK MATRIX */}
        {view === 'matrix' && analysis && (
          <div className="matrix-container">
            <p className="matrix-description">
              <strong>What if you played someone else’s schedule?</strong> Takes each franchise’s weekly scores and pits them against the opponents faced by every other league member.
            </p>

            {/* Desktop Full 12x12 Matrix Grid (>= 769px) */}
            <div className="desktop-table-view">
              <div className="table-wrap">
                <table className="matrix-table">
                  <thead>
                    <tr>
                      <th className="sticky-col">FRANCHISE</th>
                      {analysis.teams.map((t) => (
                        <th key={t.rosterId} title={t.teamName}>
                          {t.teamName.slice(0, 10)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.teams.map((teamA) => (
                      <tr key={teamA.rosterId}>
                        <td className="sticky-col">
                          <span className="team-title" title={teamA.teamName}>{teamA.teamName}</span>
                        </td>
                        {analysis.teams.map((teamB) => {
                          const entry = analysis.scheduleMatrix.find(
                            (m) =>
                              m.teamRosterId === teamA.rosterId &&
                              m.scheduleOfRosterId === teamB.rosterId,
                          )
                          const isOwn = teamA.rosterId === teamB.rosterId
                          if (!entry) return <td key={teamB.rosterId}>--</td>

                          return (
                            <td
                              key={teamB.rosterId}
                              className={`matrix-cell ${isOwn ? 'own-schedule' : ''}`}
                              title={`${teamA.teamName} on ${teamB.teamName}'s schedule`}
                            >
                              <span className="matrix-wins">
                                {formatDec(entry.hypotheticalWins, 0)}-{formatDec(entry.hypotheticalLosses, 0)}
                              </span>
                              <span className="matrix-pct">{formatPct(entry.winPct)}</span>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Schedule Matrix View (<= 768px) */}
            <div className="mobile-matrix-view">
              {/* TOP MODE TOGGLE ABOVE TEAM DROPDOWN */}
              <div className="m-matrix-mode-bar">
                <button
                  type="button"
                  className={`m-mode-btn ${!showRawMatrix ? 'active' : ''}`}
                  onClick={() => setShowRawMatrix(false)}
                >
                  <Award size={13} />
                  <span>Team Inspector</span>
                </button>
                <button
                  type="button"
                  className={`m-mode-btn ${showRawMatrix ? 'active' : ''}`}
                  onClick={() => setShowRawMatrix(true)}
                >
                  <Grid3x3 size={13} />
                  <span>Full 12×12 Matrix Grid</span>
                </button>
              </div>

              {/* VIEW 1: FULL 12x12 GRID ON MOBILE (WHEN TOGGLED) */}
              {showRawMatrix && (
                <div className="m-full-matrix-wrap">
                  <div className="m-matrix-scroll-hint">
                    <span>👈 Swipe horizontally to view all schedules · Left column is pinned 👉</span>
                  </div>
                  <div className="table-wrap raw-matrix-reveal">
                    <table className="matrix-table">
                      <thead>
                        <tr>
                          <th className="sticky-col">FRANCHISE</th>
                          {analysis.teams.map((t) => (
                            <th key={t.rosterId} title={t.teamName}>
                              {t.teamName.slice(0, 10)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.teams.map((teamA) => (
                          <tr key={teamA.rosterId}>
                            <td className="sticky-col">
                              <span className="team-title" title={teamA.teamName}>{teamA.teamName}</span>
                            </td>
                            {analysis.teams.map((teamB) => {
                              const entry = analysis.scheduleMatrix.find(
                                (m) =>
                                  m.teamRosterId === teamA.rosterId &&
                                  m.scheduleOfRosterId === teamB.rosterId,
                              )
                              const isOwn = teamA.rosterId === teamB.rosterId
                              if (!entry) return <td key={teamB.rosterId}>--</td>

                              return (
                                <td
                                  key={teamB.rosterId}
                                  className={`matrix-cell ${isOwn ? 'own-schedule' : ''}`}
                                >
                                  <span className="matrix-wins">
                                    {formatDec(entry.hypotheticalWins, 0)}-{formatDec(entry.hypotheticalLosses, 0)}
                                  </span>
                                  <span className="matrix-pct">{formatPct(entry.winPct)}</span>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* VIEW 2: TEAM SCHEDULE INSPECTOR (WHEN NOT SHOWING FULL GRID) */}
              {!showRawMatrix && activeMatrixTeam && (
                <div className="mobile-matrix-inspector">
                  <div className="m-inspector-picker">
                    <label htmlFor="m-matrix-team-select">INSPECT SCHEDULE FOR:</label>
                    <select
                      id="m-matrix-team-select"
                      value={activeMatrixTeam.rosterId}
                      onChange={(e) => setMatrixTeamId(Number(e.target.value))}
                      className="m-inspector-select"
                    >
                      {analysis.teams.map((t) => (
                        <option key={t.rosterId} value={t.rosterId}>
                          {t.teamName} ({t.actualWins}–{t.actualLosses})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="m-inspector-summary-grid">
                    <div className="m-summary-chip">
                      <span className="chip-tag">REAL RECORD</span>
                      <strong>{activeMatrixTeam.actualWins}–{activeMatrixTeam.actualLosses}</strong>
                      <span className="chip-sub">{formatPct(activeMatrixTeam.actualWinPct)}</span>
                    </div>
                    <div className="m-summary-chip highlight">
                      <span className="chip-tag">BEST SCHEDULE</span>
                      <strong className="accent">
                        {matrixComparisons[0]?.ownerTeam.teamName.slice(0, 11)}
                      </strong>
                      <span className="chip-sub">
                        {matrixComparisons[0]?.hypotheticalWins}–{matrixComparisons[0]?.hypotheticalLosses} ({formatPct(matrixComparisons[0]?.winPct ?? 0)})
                      </span>
                    </div>
                    <div className="m-summary-chip">
                      <span className="chip-tag">TOUGHEST</span>
                      <strong>
                        {matrixComparisons[matrixComparisons.length - 1]?.ownerTeam.teamName.slice(0, 11)}
                      </strong>
                      <span className="chip-sub">
                        {matrixComparisons[matrixComparisons.length - 1]?.hypotheticalWins}–{matrixComparisons[matrixComparisons.length - 1]?.hypotheticalLosses}
                      </span>
                    </div>
                  </div>

                  <div className="m-schedule-cards-list">
                    {matrixComparisons.map((c) => {
                      const deltaSign = c.deltaFromOwn > 0 ? '+' : ''
                      return (
                        <div
                          key={c.ownerTeam.rosterId}
                          className={`m-sim-schedule-card ${c.isOwn ? 'own-schedule' : ''}`}
                        >
                          <div className="m-sim-card-left">
                            <span className="m-sim-title">
                              {c.isOwn ? 'Real Schedule (Actual Opponents)' : `On ${c.ownerTeam.teamName}'s Schedule`}
                            </span>
                            <span className="m-sim-desc">
                              {c.isOwn
                                ? 'Their actual opponents faced'
                                : c.deltaFromOwn === 0
                                ? 'Identical record'
                                : `${deltaSign}${formatDec(c.deltaFromOwn, 1)} wins vs real schedule`}
                            </span>
                          </div>
                          <div className="m-sim-card-right">
                            <strong className="m-sim-rec">
                              {formatDec(c.hypotheticalWins, 0)}–{formatDec(c.hypotheticalLosses, 0)}
                            </strong>
                            <span className="m-sim-pct">{formatPct(c.winPct)}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 4: SUPERLATIVES / ROBBERIES & ESCAPES */}
        {view === 'superlatives' && analysis && (
          <div className="superlatives-container">
            <div className="superlatives-grid">
              {/* Bad Beats Section */}
              <div className="superlative-box">
                <div className="box-header">
                  <ShieldAlert size={16} className="unluck-icon" />
                  <h3>Worst Bad Beats of the Season</h3>
                </div>
                <p className="box-desc">
                  Teams that scored in the top tier of the league that week, but were paired with an even higher scorer and took a brutal loss.
                </p>
                <div className="robbery-list">
                  {analysis.superlatives.biggestBadBeats.length === 0 ? (
                    <div className="empty-sub">No severe bad beats recorded yet.</div>
                  ) : (
                    analysis.superlatives.biggestBadBeats.map((bb, i) => (
                      <div key={i} className="robbery-item bad-beat">
                        <div className="robbery-left">
                          <span className="robbery-week">WEEK {bb.week}</span>
                          <strong>{bb.teamName}</strong>
                          <span className="robbery-detail">
                            Scored <strong>{formatDec(bb.points, 2)}</strong> pts (#{bb.rank} in league · xW: {formatDec(bb.xWin, 2)})
                          </span>
                        </div>
                        <div className="robbery-right">
                          <span className="robbery-opp">Lost to {bb.oppTeamName} ({formatDec(bb.oppPoints, 2)} pts)</span>
                          <span className="luck-tag neg">{formatDec(bb.luck, 2)} Wins</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Lucky Escapes Section */}
              <div className="superlative-box">
                <div className="box-header">
                  <Sparkles size={16} className="luck-icon" />
                  <h3>Luckiest Escapes of the Season</h3>
                </div>
                <p className="box-desc">
                  Teams that scored near the bottom of the league that week, but lucked into an even lower-scoring opponent and escaped with a victory.
                </p>
                <div className="robbery-list">
                  {analysis.superlatives.luckiestEscapes.length === 0 ? (
                    <div className="empty-sub">No lucky escapes recorded yet.</div>
                  ) : (
                    analysis.superlatives.luckiestEscapes.map((le, i) => (
                      <div key={i} className="robbery-item lucky-escape">
                        <div className="robbery-left">
                          <span className="robbery-week">WEEK {le.week}</span>
                          <strong>{le.teamName}</strong>
                          <span className="robbery-detail">
                            Scored only <strong>{formatDec(le.points, 2)}</strong> pts (#{le.rank} in league · xW: {formatDec(le.xWin, 2)})
                          </span>
                        </div>
                        <div className="robbery-right">
                          <span className="robbery-opp">Defeated {le.oppTeamName} ({formatDec(le.oppPoints, 2)} pts)</span>
                          <span className="luck-tag pos">+{formatDec(le.luck, 2)} Wins</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <footer className="table-footer">
          <div className="legend">
            <span><i className="legend-dot green-dot" /> LUCKY (WON MORE THAN EXPECTED)</span>
            <span><i className="legend-dot red-dot" /> UNLUCKY (SCHEDULE VICTIM)</span>
            {hasMedian && <span><Award size={14} /> LEAGUE MEDIAN INCLUDED</span>}
          </div>
          <span className="simulation-note">
            {analysis
              ? `${analysis.totalTeams} TEAMS · ${analysis.completedWeeksCount} WEEKS ANALYZED · SLEEPER API`
              : 'ENTER LEAGUE ID TO BEGIN'}
          </span>
        </footer>
      </section>

      {/* HOW IT WORKS / METHODOLOGY SECTION */}
      <details className="model-details" open>
        <summary>
          <span className="method-icon"><TrendingUp size={18} /></span>
          <div className="model-heading">
            <span className="model-tag">HOW IT WORKS</span>
            <strong>How Expected Wins &amp; Schedule Luck are calculated</strong>
          </div>
          <ChevronDown className="model-chevron" size={17} />
        </summary>

        <div className="model-content">
          <div className="model-cards-grid">
            <div className="model-card">
              <div className="model-card-header">
                <span className="model-card-tag">HEAD-TO-HEAD MATH</span>
                <h4>1. Head-to-Head Expected Wins (xW)</h4>
              </div>
              <p>
                In a head-to-head league with <code>N</code> teams, you play only one random opponent each week.
                Expected Wins calculates the mathematical probability of beating a randomly drawn opponent:
              </p>
              <p>
                <code>xW = (Teams Outscored + 0.5 × Ties) / (N - 1)</code>
              </p>
              <p>
                For example, in a 12-team league, if you post the 2nd highest score of the week, you beat 10 of 11 possible opponents. Your expected win value for that week is exactly <code>10/11 = 0.909</code> wins. If you score highest, you get <code>11/11 = 1.0</code> wins.
              </p>
            </div>

            <div className="model-card">
              <div className="model-card-header">
                <span className="model-card-tag">LEAGUE MEDIAN</span>
                <h4>2. Extra League Median Scoring</h4>
              </div>
              <p>
                In Sleeper leagues with League Median enabled, two games are decided each week: one head-to-head matchup, and one league-wide median matchup.
              </p>
              <p>
                Finishing in the top half (top <code>N/2</code> teams) awards <code>+1.0</code> median win, while the bottom half receives <code>0.0</code>. Because median scoring depends only on your score relative to the whole league, it is completely immune to schedule luck.
              </p>
            </div>

            <div className="model-card">
              <div className="model-card-header">
                <span className="model-card-tag">LUCK METRIC</span>
                <h4>3. Schedule Luck Delta (ΔW)</h4>
              </div>
              <p>
                Schedule Luck is simply the difference between your real win total and your expected win total:
                <br />
                <code>Luck = Actual Wins - Expected Wins</code>
              </p>
              <p>
                • <strong>Positive Luck (+2.4 W):</strong> You benefited from favorable scheduling—your opponents frequently had poor scoring weeks against you.
                <br />
                • <strong>Negative Luck (-2.1 W):</strong> You are a schedule victim—you consistently posted strong point totals but ran into opponents having their season-high explosions.
              </p>
            </div>

            <div className="model-card">
              <div className="model-card-header">
                <span className="model-card-tag">ALL-PLAY RECORD</span>
                <h4>4. All-Play Equivalence</h4>
              </div>
              <p>
                Your All-Play record shows what your win-loss record would be if you played a round-robin against every single league mate every single week.
              </p>
              <p>
                Mathematically, <strong>Expected Wins × (N - 1)</strong> is identically equal to your total All-Play wins. All-Play Win Percentage is the purest measure of roster scoring dominance over the course of a fantasy football season.
              </p>
            </div>
          </div>

          <div className="model-wiki-links">
            <span className="wiki-label">Mathematical Reference Articles:</span>
            <a href="https://en.wikipedia.org/wiki/Expected_value" target="_blank" rel="noopener noreferrer">
              Wikipedia: Expected Value
            </a>
            <span className="dot-sep">·</span>
            <a href="https://en.wikipedia.org/wiki/Round-robin_tournament" target="_blank" rel="noopener noreferrer">
              Wikipedia: Round-Robin Tournament
            </a>
            <span className="dot-sep">·</span>
            <a href="https://en.wikipedia.org/wiki/Percentile_rank" target="_blank" rel="noopener noreferrer">
              Wikipedia: Percentile Rank
            </a>
          </div>
        </div>
      </details>

      <div className="bottom-note">
        UNOFFICIAL DYNASTY &amp; REDRAFT TOOL <span>·</span> LIVE SCORES &amp; ROSTERS POWERED BY SLEEPER API
      </div>
    </main>
  )
}
