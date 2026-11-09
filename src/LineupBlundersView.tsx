import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Flame,
  TrendingDown,
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

  const stats = useMemo(() => {
    let totalWins = 0
    let benchWins = 0
    let dropWins = 0
    let biggest: {
      pointsGained: number
      starter: string
      sub: string
      team: string
      wins: number
      week: number
    } | null = null

    for (const s of summaries) {
      totalWins += s.totalWinsGained
      for (const c of s.wrongChoices) {
        if (c.blunderType === 'bench') benchWins += c.winsGained
        else dropWins += c.winsGained
        if (
          !biggest ||
          c.winsGained > biggest.wins ||
          (c.winsGained === biggest.wins && c.pointsGained > biggest.pointsGained)
        ) {
          biggest = {
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

    const cleanTeams = summaries.filter((s) => s.totalWinsGained === 0).map((s) => s.teamName)
    return {
      totalWins,
      benchWins,
      dropWins,
      mostImpacted: summaries[0] || null,
      cleanTeams,
      biggest,
    }
  }, [summaries])

  if (isLoadingPlayers) {
    return (
      <div className="blunders-view">
        <div className="empty-card">
          <p>
            <AlertTriangle size={16} />
            Loading NFL rosters, waiver transactions, and pre-game projections in background...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="blunders-view">
      {/* 1. KPI Summary Strip matching .summary-strip in App.css */}
      <div className="summary-strip blunders-kpi-strip">
        <div className="summary-item">
          <span className="summary-label">LEAGUE WINS LEFT ON TABLE</span>
          <strong className="summary-value neg-text">{stats.totalWins} Wins</strong>
          <span className="summary-sub">
            {stats.benchWins}W from benchings · {stats.dropWins}W from waiver drops
          </span>
        </div>

        {stats.mostImpacted && (
          <div className="summary-item">
            <span className="summary-label">MOST COSTLY LINEUP DECISIONS</span>
            <strong className="summary-value">{stats.mostImpacted.teamName}</strong>
            <span className="summary-sub">
              -{stats.mostImpacted.totalWinsGained} Wins ({stats.mostImpacted.actualWins}–
              {stats.mostImpacted.actualLosses} actual → {stats.mostImpacted.potentialWins}–
              {stats.mostImpacted.potentialLosses} optimal)
            </span>
          </div>
        )}

        <div className="summary-item">
          <span className="summary-label">BEST LINEUP MANAGEMENT (0 BLUNDERS)</span>
          <strong className="summary-value pos-text">
            {stats.cleanTeams.length > 0 ? `${stats.cleanTeams.length} Teams` : 'None'}
          </strong>
          <span className="summary-sub">
            {stats.cleanTeams.length > 0
              ? stats.cleanTeams.join(', ')
              : 'Every franchise had at least 1 blunder'}
          </span>
        </div>

        {stats.biggest && (
          <div className="summary-item">
            <span className="summary-label">BIGGEST SINGLE POINT SWING</span>
            <strong className="summary-value">+{stats.biggest.pointsGained.toFixed(2)} pts</strong>
            <span className="summary-sub">
              W{stats.biggest.week} {stats.biggest.team}: {stats.biggest.sub} over{' '}
              {stats.biggest.starter}
            </span>
          </div>
        )}
      </div>

      {/* 2. League Summary Table (Desktop) & Compact Leaderboard (Mobile) */}
      <div className="desktop-table-view">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="th-rank">#</th>
                <th>FRANCHISE</th>
                <th>ACTUAL W–L</th>
                <th>WHAT-IF W–L</th>
                <th>WINS LOST</th>
                <th>DECISION SPLIT</th>
                <th>MOST COSTLY REALISTIC BLUNDER</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((team, idx) => {
                const isSelected = team.rosterId === activeRosterId
                const top = team.wrongChoices[0]
                return (
                  <tr
                    key={team.rosterId}
                    className={`blunder-table-row ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => {
                      setSelectedRosterId(team.rosterId)
                      setFilterType('all')
                    }}
                  >
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
                          <span className="team-sub">{team.ownerName}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="stat-primary">
                        <strong>
                          {team.actualWins} – {team.actualLosses}
                        </strong>
                        <span className="stat-sub">
                          {leagueData.hasMedianMatch
                            ? `${team.h2hWins}-${team.h2hLosses} H2H · ${team.medianWins}-${team.medianLosses} Med`
                            : 'Official'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="stat-primary">
                        <strong className={team.totalWinsGained > 0 ? 'pos-text' : ''}>
                          {team.potentialWins} – {team.potentialLosses}
                        </strong>
                        <span className="stat-sub">
                          {team.totalWinsGained > 0
                            ? `If top ${team.wrongChoices.length} fixed`
                            : 'Already optimal'}
                        </span>
                      </div>
                    </td>
                    <td>
                      {team.totalWinsGained > 0 ? (
                        <span
                          className={`luck-pill ${
                            team.totalWinsGained >= 3 ? 'very-unlucky' : 'unlucky'
                          }`}
                        >
                          <TrendingDown size={12} />
                          <strong>-{team.totalWinsGained} W</strong>
                        </span>
                      ) : (
                        <span className="luck-pill very-lucky">
                          <CheckCircle2 size={12} />
                          <strong>0 W</strong>
                          <span className="luck-label">CLEAN</span>
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="stat-primary">
                        <span>
                          {team.benchBlundersCount} Bench · {team.dropBlundersCount} Drop
                        </span>
                        {team.claimerWinsCostTotal > 0 && (
                          <span className="stat-sub neg-text">
                            Gifted +{team.claimerWinsCostTotal}W to claimer
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="blunder-top-cell">
                      {top ? (
                        <div className="blunder-top-summary">
                          <span className="blunder-week-chip">W{top.week}</span>
                          <span className="blunder-top-text">
                            {top.blunderType === 'drop' ? 'Dropped ' : 'Benched '}
                            <strong>{top.subName}</strong> ({top.subPoints.toFixed(1)}) over{' '}
                            {top.starterName} ({top.starterPoints.toFixed(1)})
                          </span>
                          <span className="luck-tag neg">+{top.winsGained}W</span>
                        </div>
                      ) : (
                        <span className="stat-sub">No realistic win-flipping blunders</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Team-Specific Dropdown Inspector */}
      {selectedTeam && (
        <div className="superlative-box blunder-inspector-box">
          <div className="blunder-inspector-toolbar">
            <div className="blunder-selector-group">
              <div className="box-header" style={{ marginBottom: 0 }}>
                <Users size={15} className="luck-icon" />
                <h3>Franchise Blunder Breakdown</h3>
              </div>

              <div className="blunder-select-wrapper">
                <select
                  aria-label="Select franchise to inspect blunders"
                  className="blunder-select"
                  value={activeRosterId ?? ''}
                  onChange={(e) => {
                    setSelectedRosterId(Number(e.target.value))
                    setFilterType('all')
                  }}
                >
                  {summaries.map((t) => (
                    <option key={t.rosterId} value={t.rosterId}>
                      {t.teamName} ({t.ownerName}) —{' '}
                      {t.totalWinsGained > 0
                        ? `-${t.totalWinsGained}W (${t.actualWins}-${t.actualLosses} → ${t.potentialWins}-${t.potentialLosses})`
                        : `0 Blunders (${t.actualWins}-${t.actualLosses})`}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="blunder-select-icon" />
              </div>
            </div>

            <div className="blunder-filter-tabs">
              <button
                type="button"
                className={filterType === 'all' ? 'selected' : ''}
                onClick={() => setFilterType('all')}
              >
                All ({selectedTeam.wrongChoices.length})
              </button>
              <button
                type="button"
                className={filterType === 'bench' ? 'selected' : ''}
                onClick={() => setFilterType('bench')}
              >
                Bench ({selectedTeam.benchBlundersCount})
              </button>
              <button
                type="button"
                className={filterType === 'drop' ? 'selected' : ''}
                onClick={() => setFilterType('drop')}
              >
                Waiver Drops ({selectedTeam.dropBlundersCount})
              </button>
            </div>
          </div>

          {/* Selected Franchise Banner */}
          <div className="blunder-team-banner">
            <div className="team-cell">
              {selectedTeam.avatarUrl ? (
                <img
                  src={selectedTeam.avatarUrl}
                  alt={selectedTeam.teamName}
                  className="team-avatar"
                />
              ) : (
                <div className="team-avatar-fallback">
                  {selectedTeam.teamName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="team-meta">
                <span className="team-title">{selectedTeam.teamName}</span>
                <span className="team-sub">
                  Managed by {selectedTeam.ownerName} · Showing up to 5 realistic projection-backed
                  blunders
                </span>
              </div>
            </div>

            <div className="blunder-banner-records">
              <div className="blunder-record-box">
                <span className="blunder-rec-label">ACTUAL RECORD</span>
                <strong className="blunder-rec-val">
                  {selectedTeam.actualWins}–{selectedTeam.actualLosses}
                </strong>
              </div>
              <ArrowRight size={14} className="blunder-rec-arrow" />
              <div className="blunder-record-box optimal">
                <span className="blunder-rec-label">WHAT-IF RECORD</span>
                <strong className="blunder-rec-val pos-text">
                  {selectedTeam.potentialWins}–{selectedTeam.potentialLosses}
                </strong>
              </div>
              {selectedTeam.totalWinsGained > 0 && (
                <span className="luck-tag pos">+{selectedTeam.totalWinsGained} Wins</span>
              )}
            </div>
          </div>

          {/* Decision List */}
          {filteredChoices.length === 0 ? (
            <div className="empty-card">
              <p>
                <CheckCircle2 size={16} />
                No realistic {filterType === 'all' ? '' : filterType} lineup blunders cost{' '}
                {selectedTeam.teamName} a win.
              </p>
            </div>
          ) : (
            <div className="blunder-decision-list">
              {filteredChoices.map((c, idx) => (
                <div
                  key={`${c.week}-${c.starterId}-${c.subId}-${idx}`}
                  className={`blunder-decision-card ${
                    c.blunderType === 'drop' ? 'is-drop' : 'is-bench'
                  }`}
                >
                  {/* Top Bar: Week + Type + Score Context + Win Flip Tags */}
                  <div className="blunder-card-topbar">
                    <div className="blunder-card-meta">
                      <span className="blunder-week-chip">WEEK {c.week}</span>
                      <span className="blunder-slot-chip">{c.slotType}</span>
                      {c.blunderType === 'drop' ? (
                        <span className="blunder-type-badge drop">
                          <UserMinus size={11} /> WAIVER DROP (CUT W{c.dropWeek})
                        </span>
                      ) : (
                        <span className="blunder-type-badge bench">
                          <Flame size={11} /> BENCH MISTAKE
                        </span>
                      )}
                      <span className="blunder-score-context">
                        Team Score: <strong>{c.originalPoints.toFixed(2)}</strong> →{' '}
                        <strong className="pos-text">{c.newTotalPoints.toFixed(2)} pts</strong> (vs{' '}
                        {c.oppTeamName}: {c.oppPoints.toFixed(2)})
                      </span>
                    </div>

                    <div className="blunder-card-badges">
                      {c.h2hFlipped && <span className="blunder-flip-pill">H2H WIN</span>}
                      {c.medianFlipped && <span className="blunder-flip-pill">MEDIAN WIN</span>}
                      <span className="luck-tag pos">
                        +{c.winsGained} {c.winsGained === 1 ? 'Win' : 'Wins'}
                      </span>
                    </div>
                  </div>

                  {/* Middle: Started vs Should Have Started */}
                  <div className="blunder-matchup-grid">
                    <div className="blunder-player-box started">
                      <div className="blunder-player-left">
                        <span className="blunder-role-tag bad">STARTED IN {c.slotType}</span>
                        <div className="blunder-player-name-row">
                          <strong>{c.starterName}</strong>
                          <span className="blunder-pos-meta">
                            {c.starterPosition}
                            {c.starterTeam ? ` · ${c.starterTeam}` : ''}
                          </span>
                        </div>
                      </div>
                      <div className="blunder-player-right">
                        <strong className="blunder-pts-val neg-text">
                          {c.starterPoints.toFixed(2)} pts
                        </strong>
                        {c.starterProjected != null && (
                          <span className="blunder-proj-val">
                            Proj: {c.starterProjected.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="blunder-swap-divider">
                      <ArrowRight size={15} />
                      <span>+{c.pointsGained.toFixed(2)}</span>
                    </div>

                    <div className="blunder-player-box optimal">
                      <div className="blunder-player-left">
                        <span className="blunder-role-tag good">
                          {c.blunderType === 'drop'
                            ? `DROPPED IN WEEK ${c.dropWeek}`
                            : 'LEFT ON BENCH'}
                        </span>
                        <div className="blunder-player-name-row">
                          <strong>{c.subName}</strong>
                          <span className="blunder-pos-meta">
                            {c.subPosition}
                            {c.subTeam ? ` · ${c.subTeam}` : ''}
                          </span>
                        </div>
                      </div>
                      <div className="blunder-player-right">
                        <strong className="blunder-pts-val pos-text">
                          {c.subPoints.toFixed(2)} pts
                        </strong>
                        {c.subProjected != null && (
                          <span className="blunder-proj-val">
                            Proj: {c.subProjected.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom: Win Transfers & Claiming Team Ripple Effect */}
                  <div className="blunder-ripple-footer">
                    {c.whoLosesH2H && (
                      <div className="blunder-ripple-chip">
                        <span className="ripple-label">H2H WIN TAKEN FROM:</span>
                        <strong>{c.whoLosesH2H}</strong>
                        <span className="luck-tag neg">-1 W</span>
                      </div>
                    )}
                    {c.whoLosesMedian && (
                      <div className="blunder-ripple-chip">
                        <span className="ripple-label">BUMPED FROM TOP-6 MEDIAN:</span>
                        <strong>{c.whoLosesMedian}</strong>
                        <span className="luck-tag neg">-1 W</span>
                      </div>
                    )}
                    {c.blunderType === 'drop' && c.claimedByTeamName && (
                      <div className="blunder-ripple-chip claimer">
                        <span className="ripple-label">CLAIMED BY:</span>
                        <strong>{c.claimedByTeamName}</strong>
                        {c.claimerImpact?.startedPlayer ? (
                          <span className="ripple-claimer-detail">
                            Started {c.subName} in W{c.week} — without him (subbing{' '}
                            {c.claimerImpact.backupName
                              ? `${c.claimerImpact.backupName}, ${c.claimerImpact.backupPoints.toFixed(2)} pts`
                              : '0.00 pt backup'}
                            ), score drops {c.claimerImpact.originalPoints.toFixed(2)} →{' '}
                            {c.claimerImpact.newPoints.toFixed(2)} (-
                            {c.claimerImpact.pointsLost.toFixed(2)} pts)
                            {c.claimerImpact.winsLost > 0 ? (
                              <strong className="neg-text">
                                {' '}
                                · Costs {c.claimerImpact.teamName} -{c.claimerImpact.winsLost}W
                                {c.claimerImpact.lostH2H && c.claimerImpact.oppTeamName
                                  ? ` (loses H2H vs ${c.claimerImpact.oppTeamName})`
                                  : ''}
                              </strong>
                            ) : (
                              ' · Still holds W/L result'
                            )}
                          </span>
                        ) : (
                          <span className="ripple-claimer-detail">(Benched in W{c.week})</span>
                        )}
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
  )
}
