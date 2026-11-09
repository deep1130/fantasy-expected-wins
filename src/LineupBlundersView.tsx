import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  Flame,
  TrendingDown,
  Trophy,
  UserMinus,
  Users,
} from 'lucide-react'
import type { LeagueData } from './sleeper'
import type { SleeperPlayer } from './sleeperPlayers'
import type { SleeperTransaction } from './sleeperTransactions'
import { computeLineupBlunders } from './lineupBlunders'
import './LineupBlunders.css'

interface LineupBlundersViewProps {
  leagueData: LeagueData
  playersMap: Record<string, SleeperPlayer>
  isLoadingPlayers: boolean
  transactions?: SleeperTransaction[][]
  weeklyStats?: Record<string, any>[]
  projections?: Record<string, any>[]
}

export function LineupBlundersView({
  leagueData,
  playersMap,
  isLoadingPlayers,
  transactions,
  weeklyStats,
  projections,
}: LineupBlundersViewProps) {
  const [selectedRosterId, setSelectedRosterId] = useState<number | null>(null)
  const [filterType, setFilterType] = useState<'all' | 'bench' | 'drop'>('all')

  const summaries = useMemo(() => {
    if (Object.keys(playersMap).length === 0) return []
    return computeLineupBlunders(leagueData, playersMap, transactions, weeklyStats, projections)
  }, [leagueData, playersMap, transactions, weeklyStats, projections])

  // Default selected roster to the team with the most wins lost
  const activeRosterId = useMemo(() => {
    if (selectedRosterId != null && summaries.some((s) => s.rosterId === selectedRosterId)) {
      return selectedRosterId
    }
    return summaries.length > 0 ? summaries[0].rosterId : null
  }, [selectedRosterId, summaries])

  const selectedTeam = useMemo(() => {
    return summaries.find((s) => s.rosterId === activeRosterId) || null
  }, [summaries, activeRosterId])

  const filteredChoices = useMemo(() => {
    if (!selectedTeam) return []
    if (filterType === 'all') return selectedTeam.wrongChoices
    return selectedTeam.wrongChoices.filter((c) => c.blunderType === filterType)
  }, [selectedTeam, filterType])

  // Aggregate stats
  const totalLeagueWinsLost = useMemo(() => {
    return summaries.reduce((sum, s) => sum + s.totalWinsGained, 0)
  }, [summaries])

  const mostImpactedTeam = useMemo(() => {
    if (summaries.length === 0) return null
    return summaries[0]
  }, [summaries])

  const biggestSingleBlunder = useMemo(() => {
    let best = { pointsGained: 0, starter: '', sub: '', team: '', wins: 0, week: 0 }
    for (const s of summaries) {
      for (const c of s.wrongChoices) {
        if (
          c.winsGained > best.wins ||
          (c.winsGained === best.wins && c.pointsGained > best.pointsGained)
        ) {
          best = {
            pointsGained: c.pointsGained,
            starter: c.starterName,
            sub: c.subName,
            team: s.teamName,
            wins: c.winsGained,
            week: c.week,
          }
        }
      }
    }
    return best.team ? best : null
  }, [summaries])

  if (isLoadingPlayers) {
    return (
      <div className="blunders-container">
        <div className="blunder-empty-state" style={{ padding: '60px 20px' }}>
          <div style={{ display: 'inline-block', marginBottom: '12px' }}>
            <AlertTriangle className="spin" size={28} color="var(--accent)" />
          </div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)' }}>
            Loading NFL Players, Transactions &amp; Projections...
          </div>
          <p style={{ color: 'var(--muted)', marginTop: '4px', fontSize: '13px' }}>
            Evaluating realistic starting lineups, bench scores, dropped stars, and win-flipping decisions.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="blunders-container">
      {/* 1. Metric Cards Banner */}
      <div className="blunders-summary-grid">
        <div className="blunders-metric-card warning">
          <span className="blunders-metric-label">Total Wins Lost to Blunders</span>
          <span className="blunders-metric-value">{totalLeagueWinsLost} Wins</span>
          <span className="blunders-metric-sub">Across benchings and dropped stars</span>
        </div>

        {mostImpactedTeam && (
          <div className="blunders-metric-card accent">
            <span className="blunders-metric-label">Most Costly Decisions</span>
            <span className="blunders-metric-value">{mostImpactedTeam.totalWinsGained} Wins</span>
            <span className="blunders-metric-sub">
              {mostImpactedTeam.teamName} ({mostImpactedTeam.ownerName})
            </span>
          </div>
        )}

        {biggestSingleBlunder && (
          <div className="blunders-metric-card">
            <span className="blunders-metric-label">Biggest Single Blunder</span>
            <span className="blunders-metric-value">+{biggestSingleBlunder.pointsGained} pts</span>
            <span className="blunders-metric-sub">
              Week {biggestSingleBlunder.week}: {biggestSingleBlunder.sub} over{' '}
              {biggestSingleBlunder.starter} (+{biggestSingleBlunder.wins} Wins)
            </span>
          </div>
        )}
      </div>

      {/* 2. League Blunders Leaderboard Summary Table */}
      <div className="blunder-summary-table-card">
        <div className="blunder-summary-table-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={16} color="var(--accent)" />
            <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>
              League Blunder Leaderboard
            </span>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
            Click any team to inspect their decisions
          </span>
        </div>

        <div className="blunder-table-wrap">
          <table className="blunder-summary-table">
            <thead>
              <tr>
                <th>#</th>
                <th>FRANCHISE</th>
                <th>RECORD</th>
                <th>WHAT-IF</th>
                <th>WINS LOST</th>
                <th>TOP REALISTIC BLUNDER</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((team, idx) => {
                const isSelected = team.rosterId === activeRosterId
                const topBlunder = team.wrongChoices[0]
                return (
                  <tr
                    key={team.rosterId}
                    className={`blunder-summary-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedRosterId(team.rosterId)}
                  >
                    <td className="td-rank">{idx + 1}</td>
                    <td>
                      <div className="blunder-row-team">
                        {team.avatarUrl ? (
                          <img src={team.avatarUrl} alt="" className="blunder-row-avatar" />
                        ) : (
                          <div className="blunder-row-avatar-fallback">
                            {team.teamName.charAt(0)}
                          </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span className="blunder-row-teamname">{team.teamName}</span>
                          <span className="blunder-row-owner">{team.ownerName}</span>
                        </div>
                      </div>
                    </td>
                    <td className="td-mono">
                      {team.actualWins}-{team.actualLosses}
                      {team.actualTies > 0 ? `-${team.actualTies}` : ''}
                    </td>
                    <td className="td-mono highlight">
                      {team.potentialWins}-{team.potentialLosses}
                    </td>
                    <td>
                      <span className={`blunder-wins-tag ${team.totalWinsGained > 0 ? 'bad' : 'clean'}`}>
                        {team.totalWinsGained > 0 ? `-${team.totalWinsGained} W` : 'Clean'}
                      </span>
                    </td>
                    <td className="td-blunder-desc">
                      {topBlunder ? (
                        <span>
                          {topBlunder.blunderType === 'drop' ? '💔 Cut ' : '🪑 Sat '}
                          <strong>{topBlunder.subName}</strong> for {topBlunder.starterName} (W{topBlunder.week}, +{topBlunder.winsGained}W)
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>No win-flipping blunders</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Team Specific Inspector with Dropdown */}
      <div className="blunder-team-inspector-wrap">
        <div className="blunder-inspector-controls">
          <div className="blunder-dropdown-group">
            <label htmlFor="team-select" className="blunder-dropdown-label">
              Inspect Franchise Blunders:
            </label>
            <div className="blunder-select-wrap">
              <select
                id="team-select"
                className="blunder-team-select"
                value={activeRosterId ?? ''}
                onChange={(e) => setSelectedRosterId(Number(e.target.value))}
              >
                {summaries.map((team) => (
                  <option key={team.rosterId} value={team.rosterId}>
                    {team.teamName} ({team.ownerName}) — {team.totalWinsGained > 0 ? `-${team.totalWinsGained} Wins Lost` : 'Clean'}
                  </option>
                ))}
              </select>
              <ChevronDown className="blunder-select-chevron" size={16} />
            </div>
          </div>

          {/* Filter Pills */}
          <div className="blunder-type-filters">
            <button
              type="button"
              className={`blunder-filter-btn ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => setFilterType('all')}
            >
              All ({selectedTeam?.wrongChoices.length ?? 0})
            </button>
            <button
              type="button"
              className={`blunder-filter-btn ${filterType === 'bench' ? 'active' : ''}`}
              onClick={() => setFilterType('bench')}
            >
              🪑 Bench ({selectedTeam?.wrongChoices.filter((c) => c.blunderType === 'bench').length ?? 0})
            </button>
            <button
              type="button"
              className={`blunder-filter-btn ${filterType === 'drop' ? 'active' : ''}`}
              onClick={() => setFilterType('drop')}
            >
              💔 Drops ({selectedTeam?.wrongChoices.filter((c) => c.blunderType === 'drop').length ?? 0})
            </button>
          </div>
        </div>

        {/* Selected Team Detail View */}
        {selectedTeam && (
          <div className="blunder-team-detail-card">
            {/* Header */}
            <div className="blunder-card-header">
              <div className="blunder-team-info">
                {selectedTeam.avatarUrl ? (
                  <img src={selectedTeam.avatarUrl} alt="" className="blunder-team-avatar" />
                ) : (
                  <div className="blunder-team-avatar-fallback">
                    {selectedTeam.teamName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="blunder-team-names">
                  <span className="blunder-team-title">{selectedTeam.teamName}</span>
                  <span className="blunder-owner-name">{selectedTeam.ownerName}</span>
                </div>
              </div>

              <div className="blunder-record-pill">
                <span className="blunder-actual-record">
                  Actual Record: {selectedTeam.actualWins}-{selectedTeam.actualLosses}
                  {selectedTeam.actualTies > 0 ? `-${selectedTeam.actualTies}` : ''}
                </span>
                {selectedTeam.totalWinsGained > 0 && (
                  <span className="blunder-potential-record">
                    What-If Record: {selectedTeam.potentialWins}-{selectedTeam.potentialLosses} (+{selectedTeam.totalWinsGained} Wins)
                  </span>
                )}
              </div>
            </div>

            {/* List of Blunders */}
            {filteredChoices.length === 0 ? (
              <div className="blunder-empty-state">
                🎯 Clean Execution — No {filterType !== 'all' ? filterType : ''} decisions would have flipped any loss into a win for this franchise.
              </div>
            ) : (
              <div className="blunder-choices-list">
                {filteredChoices.map((choice, idx) => (
                  <div key={idx} className="blunder-choice-item">
                    {/* Top Row: Week, Opponent, Type Tag, Win Badge */}
                    <div className="blunder-choice-top">
                      <div className="blunder-choice-meta">
                        <span className="blunder-week-label">Week {choice.week}</span>
                        <span className="blunder-vs-label">vs {choice.oppTeamName}</span>
                        {choice.blunderType === 'drop' ? (
                          <span className="blunder-type-pill drop">
                            <UserMinus size={11} /> Dropped in W{choice.dropWeek}
                          </span>
                        ) : (
                          <span className="blunder-type-pill bench">
                            <Flame size={11} /> Benched
                          </span>
                        )}
                      </div>
                      <span className="blunder-win-badge">
                        <Trophy size={12} />
                        +{choice.winsGained.toFixed(1)} {choice.winsGained === 1 ? 'Win' : 'Wins'}
                      </span>
                    </div>

                    {/* Players Row: Started vs Sub */}
                    <div className="blunder-players-row">
                      <div className="blunder-player-box starter">
                        <span className="blunder-player-tag">Started</span>
                        <span className="blunder-player-name" title={choice.starterName}>
                          {choice.starterName}
                        </span>
                        <div className="blunder-player-detail">
                          <span>
                            {choice.starterPosition}
                            {choice.starterTeam ? ` • ${choice.starterTeam}` : ''}
                            {choice.starterProjected != null ? ` (Proj: ${choice.starterProjected.toFixed(1)})` : ''}
                          </span>
                          <span className="blunder-player-pts">{choice.starterPoints.toFixed(1)} pts</span>
                        </div>
                      </div>

                      <div className="blunder-swap-arrow">
                        <ArrowRight size={16} />
                        <span className="blunder-diff-tag">+{choice.pointsGained.toFixed(1)}</span>
                      </div>

                      <div className={`blunder-player-box ${choice.blunderType === 'drop' ? 'dropped' : 'bench'}`}>
                        <span className="blunder-player-tag">
                          {choice.blunderType === 'drop' ? 'Dropped Star' : 'Benched'}
                        </span>
                        <span className="blunder-player-name" title={choice.subName}>
                          {choice.subName}
                        </span>
                        <div className="blunder-player-detail">
                          <span>
                            {choice.subPosition}
                            {choice.subTeam ? ` • ${choice.subTeam}` : ''}
                            {choice.subProjected != null ? ` (Proj: ${choice.subProjected.toFixed(1)})` : ''}
                          </span>
                          <span
                            className="blunder-player-pts"
                            style={{ color: choice.blunderType === 'drop' ? '#c084fc' : '#34d399' }}
                          >
                            {choice.subPoints.toFixed(1)} pts
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Who Loses Wins & Claimed By */}
                    <div className="blunder-victims-section">
                      <span className="blunder-victims-title">Wins Transferred From:</span>
                      {choice.whoLosesH2H && (
                        <div className="blunder-victim-item">
                          <TrendingDown size={13} color="var(--unlucky-text)" />
                          <span>
                            <strong>{choice.whoLosesH2H}</strong> loses H2H matchup win
                          </span>
                        </div>
                      )}
                      {choice.whoLosesMedian && (
                        <div className="blunder-victim-item">
                          <TrendingDown size={13} color="var(--unlucky-text)" />
                          <span>
                            <strong>{choice.whoLosesMedian}</strong> knocked below median (loses median win)
                          </span>
                        </div>
                      )}
                      {choice.blunderType === 'drop' && choice.claimedByTeamName && (
                        <div className="blunder-victim-item" style={{ color: '#c084fc', marginTop: '2px' }}>
                          <span>
                            🎁 Claimed off waivers by: <strong>{choice.claimedByTeamName}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
