import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Search,
  TrendingDown,
  Trophy,
} from 'lucide-react'
import type { LeagueData } from './sleeper'
import type { SleeperPlayer } from './sleeperPlayers'
import { computeLineupBlunders } from './lineupBlunders'
import './LineupBlunders.css'

interface LineupBlundersViewProps {
  leagueData: LeagueData
  playersMap: Record<string, SleeperPlayer>
  isLoadingPlayers: boolean
}

export function LineupBlundersView({
  leagueData,
  playersMap,
  isLoadingPlayers,
}: LineupBlundersViewProps) {
  const [searchTerm, setSearchTerm] = useState('')

  const summaries = useMemo(() => {
    if (Object.keys(playersMap).length === 0) return []
    return computeLineupBlunders(leagueData, playersMap)
  }, [leagueData, playersMap])

  const filteredSummaries = useMemo(() => {
    if (!searchTerm.trim()) return summaries
    const term = searchTerm.toLowerCase()
    return summaries.filter(
      (s) =>
        s.teamName.toLowerCase().includes(term) ||
        s.ownerName.toLowerCase().includes(term) ||
        s.wrongChoices.some(
          (c) =>
            c.starterName.toLowerCase().includes(term) ||
            c.benchName.toLowerCase().includes(term) ||
            c.oppTeamName.toLowerCase().includes(term),
        ),
    )
  }, [summaries, searchTerm])

  // Aggregate stats
  const totalLeagueWinsLost = useMemo(() => {
    return summaries.reduce((sum, s) => sum + s.totalWinsGained, 0)
  }, [summaries])

  const mostImpactedTeam = useMemo(() => {
    if (summaries.length === 0) return null
    return summaries[0] // sorted by totalWinsGained desc
  }, [summaries])

  const biggestSingleBlunder = useMemo(() => {
    let best = { pointsGained: 0, starter: '', bench: '', team: '', wins: 0, week: 0 }
    for (const s of summaries) {
      for (const c of s.wrongChoices) {
        if (c.winsGained > best.wins || (c.winsGained === best.wins && c.pointsGained > best.pointsGained)) {
          best = {
            pointsGained: c.pointsGained,
            starter: c.starterName,
            bench: c.benchName,
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
            Loading NFL Player Roster Data...
          </div>
          <p style={{ color: 'var(--muted)', marginTop: '4px', fontSize: '13px' }}>
            Evaluating starting lineups, bench scores, and win-flipping decisions.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="blunders-container">
      {/* Metric Cards Banner */}
      <div className="blunders-summary-grid">
        <div className="blunders-metric-card warning">
          <span className="blunders-metric-label">Total Wins Lost to Bench</span>
          <span className="blunders-metric-value">{totalLeagueWinsLost} Wins</span>
          <span className="blunders-metric-sub">Across all 12 league managers</span>
        </div>

        {mostImpactedTeam && (
          <div className="blunders-metric-card accent">
            <span className="blunders-metric-label">Most Costly Lineups</span>
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
              Week {biggestSingleBlunder.week}: {biggestSingleBlunder.bench} for{' '}
              {biggestSingleBlunder.starter} (+{biggestSingleBlunder.wins} Wins)
            </span>
          </div>
        )}
      </div>

      {/* Filter / Search Bar */}
      <div className="blunders-filter-bar">
        <div className="blunders-search-wrap">
          <Search className="blunders-search-icon" />
          <input
            type="text"
            className="blunders-search-input"
            placeholder="Search by team, manager, or player..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
          Showing top 3 win-flipping choices per team
        </div>
      </div>

      {/* Teams Grid */}
      <div className="blunders-teams-grid">
        {filteredSummaries.map((team) => (
          <div key={team.rosterId} className="blunder-team-card">
            {/* Team Card Header */}
            <div className="blunder-card-header">
              <div className="blunder-team-info">
                {team.avatarUrl ? (
                  <img src={team.avatarUrl} alt="" className="blunder-team-avatar" />
                ) : (
                  <div className="blunder-team-avatar-fallback">
                    {team.teamName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="blunder-team-names">
                  <span className="blunder-team-title">{team.teamName}</span>
                  <span className="blunder-owner-name">{team.ownerName}</span>
                </div>
              </div>

              <div className="blunder-record-pill">
                <span className="blunder-actual-record">
                  {team.actualWins}-{team.actualLosses}
                  {team.actualTies > 0 ? `-${team.actualTies}` : ''}
                </span>
                {team.totalWinsGained > 0 && (
                  <span className="blunder-potential-record">
                    What-If: {team.potentialWins}-{team.potentialLosses} (+{team.totalWinsGained})
                  </span>
                )}
              </div>
            </div>

            {/* Wrong Choices (Up to 3) */}
            {team.wrongChoices.length === 0 ? (
              <div className="blunder-empty-state">
                🎯 Clean Decisions — No single-player bench swap would have flipped any loss into a
                win this season.
              </div>
            ) : (
              <div className="blunder-choices-list">
                {team.wrongChoices.map((choice, idx) => (
                  <div key={idx} className="blunder-choice-item">
                    {/* Top Row: Week, Opponent, Win Badge */}
                    <div className="blunder-choice-top">
                      <div>
                        <span className="blunder-week-label">Week {choice.week}</span>{' '}
                        <span className="blunder-vs-label">vs {choice.oppTeamName}</span>
                      </div>
                      <span className="blunder-win-badge">
                        <Trophy size={12} />
                        +{choice.winsGained.toFixed(1)} {choice.winsGained === 1 ? 'Win' : 'Wins'}
                      </span>
                    </div>

                    {/* Players Row: Started vs Bench */}
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
                          </span>
                          <span className="blunder-player-pts">{choice.starterPoints.toFixed(1)}</span>
                        </div>
                      </div>

                      <div className="blunder-swap-arrow">
                        <ArrowRight size={16} />
                        <span className="blunder-diff-tag">+{choice.pointsGained.toFixed(1)}</span>
                      </div>

                      <div className="blunder-player-box bench">
                        <span className="blunder-player-tag">Benched</span>
                        <span className="blunder-player-name" title={choice.benchName}>
                          {choice.benchName}
                        </span>
                        <div className="blunder-player-detail">
                          <span>
                            {choice.benchPosition}
                            {choice.benchTeam ? ` • ${choice.benchTeam}` : ''}
                          </span>
                          <span className="blunder-player-pts" style={{ color: '#34d399' }}>
                            {choice.benchPoints.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Who Loses Wins */}
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
                            <strong>{choice.whoLosesMedian}</strong> knocked below median (loses
                            median win)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
