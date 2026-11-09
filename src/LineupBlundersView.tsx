import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Flame,
  Search,
  TrendingDown,
  Trophy,
  UserMinus,
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
}

export function LineupBlundersView({
  leagueData,
  playersMap,
  isLoadingPlayers,
  transactions,
  weeklyStats,
}: LineupBlundersViewProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'bench' | 'drop'>('all')

  const summaries = useMemo(() => {
    if (Object.keys(playersMap).length === 0) return []
    return computeLineupBlunders(leagueData, playersMap, transactions, weeklyStats)
  }, [leagueData, playersMap, transactions, weeklyStats])

  const filteredSummaries = useMemo(() => {
    return summaries
      .map((team) => {
        const matchesSearch =
          !searchTerm.trim() ||
          team.teamName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          team.ownerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          team.wrongChoices.some(
            (c) =>
              c.starterName.toLowerCase().includes(searchTerm.toLowerCase()) ||
              c.subName.toLowerCase().includes(searchTerm.toLowerCase()) ||
              c.oppTeamName.toLowerCase().includes(searchTerm.toLowerCase()),
          )

        if (!matchesSearch) return null

        let choices = team.wrongChoices
        if (filterType !== 'all') {
          choices = choices.filter((c) => c.blunderType === filterType)
        }

        return {
          ...team,
          wrongChoices: choices,
        }
      })
      .filter(Boolean) as typeof summaries
  }, [summaries, searchTerm, filterType])

  // Aggregate stats
  const totalLeagueWinsLost = useMemo(() => {
    return summaries.reduce((sum, s) => sum + s.totalWinsGained, 0)
  }, [summaries])

  const mostImpactedTeam = useMemo(() => {
    if (summaries.length === 0) return null
    return summaries[0]
  }, [summaries])

  const biggestSingleBlunder = useMemo(() => {
    let best = { pointsGained: 0, starter: '', sub: '', team: '', wins: 0, week: 0, type: 'bench' }
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
            type: c.blunderType,
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
            Loading NFL Player Roster Data &amp; Transactions...
          </div>
          <p style={{ color: 'var(--muted)', marginTop: '4px', fontSize: '13px' }}>
            Evaluating starting lineups, bench scores, dropped players, and win-flipping decisions.
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

        {/* Blunder Type Toggle */}
        <div className="blunder-type-filters">
          <button
            type="button"
            className={`blunder-filter-btn ${filterType === 'all' ? 'active' : ''}`}
            onClick={() => setFilterType('all')}
          >
            All Decisions
          </button>
          <button
            type="button"
            className={`blunder-filter-btn ${filterType === 'bench' ? 'active' : ''}`}
            onClick={() => setFilterType('bench')}
          >
            🪑 Bench Only
          </button>
          <button
            type="button"
            className={`blunder-filter-btn ${filterType === 'drop' ? 'active' : ''}`}
            onClick={() => setFilterType('drop')}
          >
            💔 Drops Only
          </button>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
          Showing top 5 win-flipping decisions per team
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

            {/* Wrong Choices (Up to 5) */}
            {team.wrongChoices.length === 0 ? (
              <div className="blunder-empty-state">
                🎯 Clean Decisions — No bench swap or dropped player would have flipped any loss into a
                win this season.
              </div>
            ) : (
              <div className="blunder-choices-list">
                {team.wrongChoices.map((choice, idx) => (
                  <div key={idx} className="blunder-choice-item">
                    {/* Top Row: Week, Opponent, Type Tag, Win Badge */}
                    <div className="blunder-choice-top">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="blunder-week-label">Week {choice.week}</span>{' '}
                        <span className="blunder-vs-label">vs {choice.oppTeamName}</span>
                        {choice.blunderType === 'drop' ? (
                          <span className="blunder-type-pill drop">
                            <UserMinus size={11} /> Dropped W{choice.dropWeek}
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
                          </span>
                          <span className="blunder-player-pts">{choice.starterPoints.toFixed(1)}</span>
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
                          </span>
                          <span
                            className="blunder-player-pts"
                            style={{ color: choice.blunderType === 'drop' ? '#c084fc' : '#34d399' }}
                          >
                            {choice.subPoints.toFixed(1)}
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
                            <strong>{choice.whoLosesMedian}</strong> knocked below median (loses
                            median win)
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
        ))}
      </div>
    </div>
  )
}
