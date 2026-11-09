import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Flame,
  UserMinus,
  Users,
} from 'lucide-react'
import type { LeagueData } from './sleeper'
import type { SleeperPlayer } from './sleeperPlayers'
import type { SleeperTransaction } from './sleeperTransactions'
import { computeLineupBlunders, type BlunderType } from './lineupBlunders'
import './LineupBlunders.css'

interface LineupBlundersViewProps {
  mode: BlunderType
  leagueData: LeagueData
  playersMap: Record<string, SleeperPlayer>
  isLoadingPlayers: boolean
  transactions?: SleeperTransaction[][]
  weeklyStats?: Record<string, any>[]
  projections?: Record<string, any>[]
}

export function LineupBlundersView({
  mode,
  leagueData,
  playersMap,
  isLoadingPlayers,
  transactions,
  weeklyStats,
  projections,
}: LineupBlundersViewProps) {
  const [selectedRosterId, setSelectedRosterId] = useState<number | null>(null)

  const summaries = useMemo(() => {
    if (Object.keys(playersMap).length === 0) return []
    return computeLineupBlunders(
      leagueData,
      playersMap,
      transactions,
      weeklyStats,
      projections,
      mode,
    )
  }, [leagueData, playersMap, transactions, weeklyStats, projections, mode])

  const activeRosterId = useMemo(() => {
    if (selectedRosterId != null && summaries.some((s) => s.rosterId === selectedRosterId)) {
      return selectedRosterId
    }
    return summaries.length > 0 ? summaries[0].rosterId : null
  }, [selectedRosterId, summaries])

  const selectedTeam = useMemo(() => {
    return summaries.find((s) => s.rosterId === activeRosterId) || null
  }, [summaries, activeRosterId])

  const summaryStats = useMemo(() => {
    let totalWins = 0
    let biggest: {
      pointsGained: number
      starter: string
      sub: string
      team: string
      wins: number
      week: number
      claimerTeam?: string | null
      claimerWinsLost?: number
    } | null = null

    let topClaimerSwing: {
      dropperTeam: string
      claimerTeam: string
      player: string
      week: number
      pointsLost: number
      winsLost: number
      oppTeam: string | null
    } | null = null

    for (const s of summaries) {
      totalWins += s.totalWinsGained
      for (const c of s.wrongChoices) {
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
            claimerTeam: c.claimedByTeamName,
            claimerWinsLost: c.claimerImpact?.winsLost ?? 0,
          }
        }
        if (c.claimerImpact?.startedPlayer) {
          if (
            !topClaimerSwing ||
            c.claimerImpact.winsLost > topClaimerSwing.winsLost ||
            (c.claimerImpact.winsLost === topClaimerSwing.winsLost &&
              c.claimerImpact.pointsLost > topClaimerSwing.pointsLost)
          ) {
            topClaimerSwing = {
              dropperTeam: s.teamName,
              claimerTeam: c.claimerImpact.teamName,
              player: c.subName,
              week: c.week,
              pointsLost: c.claimerImpact.pointsLost,
              winsLost: c.claimerImpact.winsLost,
              oppTeam: c.claimerImpact.oppTeamName,
            }
          }
        }
      }
    }

    const worstTeams = summaries.filter((s) => s.totalWinsGained > 0)
    const cleanTeams = summaries.filter((s) => s.totalWinsGained === 0)

    return {
      totalWins,
      worstTeam: worstTeams[0] || null,
      cleanTeams,
      biggest,
      topClaimerSwing,
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
      {/* 1. Compact 3-Card Summary Row (Worst Choice, Best/Cleanest, Biggest Swing) */}
      <div className="blunder-summary-row">
        <div className="blunder-kpi-box">
          <span className="blunder-kpi-tag neg">
            {mode === 'bench' ? 'WORST BENCH DECISIONS' : 'MOST COSTLY WAIVER DROPS'}
          </span>
          {summaryStats.worstTeam ? (
            <>
              <div className="blunder-kpi-headline">
                <strong>{summaryStats.worstTeam.teamName}</strong>
                <span className="luck-tag neg">-{summaryStats.worstTeam.totalWinsGained} Wins</span>
              </div>
              <p className="blunder-kpi-sub">
                {summaryStats.worstTeam.actualWins}–{summaryStats.worstTeam.actualLosses} actual →{' '}
                <strong>
                  {summaryStats.worstTeam.potentialWins}–{summaryStats.worstTeam.potentialLosses}
                </strong>{' '}
                if {mode === 'bench' ? 'optimal bench started' : 'dropped players kept'} (
                {summaryStats.totalWins}W lost league-wide)
              </p>
            </>
          ) : (
            <p className="blunder-kpi-sub">No costly decisions recorded yet.</p>
          )}
        </div>

        <div className="blunder-kpi-box">
          <span className="blunder-kpi-tag pos">
            {mode === 'bench'
              ? 'BEST START/SIT MANAGEMENT (0 LOST)'
              : 'CLEANEST WAIVER MANAGEMENT (0 LOST)'}
          </span>
          <div className="blunder-kpi-headline">
            <strong>
              {summaryStats.cleanTeams.length}{' '}
              {summaryStats.cleanTeams.length === 1 ? 'Franchise' : 'Franchises'}
            </strong>
            <span className="luck-tag pos">0 Blunders</span>
          </div>
          <p className="blunder-kpi-sub">
            {summaryStats.cleanTeams.length > 0
              ? summaryStats.cleanTeams.map((t) => t.teamName).join(' · ')
              : 'Every franchise had at least 1 win-costing decision'}
          </p>
        </div>

        <div className="blunder-kpi-box">
          <span className="blunder-kpi-tag accent">
            {mode === 'bench' ? 'BIGGEST BENCH WIN FLIP' : 'CLAIMER RIPPLE IMPACT'}
          </span>
          {mode === 'drop' && summaryStats.topClaimerSwing ? (
            <>
              <div className="blunder-kpi-headline">
                <strong>
                  {summaryStats.topClaimerSwing.player} → {summaryStats.topClaimerSwing.claimerTeam}
                </strong>
                {summaryStats.topClaimerSwing.winsLost > 0 ? (
                  <span className="luck-tag neg">
                    -{summaryStats.topClaimerSwing.winsLost}W to Claimer
                  </span>
                ) : (
                  <span className="luck-tag neu">
                    -{summaryStats.topClaimerSwing.pointsLost.toFixed(1)} pts
                  </span>
                )}
              </div>
              <p className="blunder-kpi-sub">
                Cut by {summaryStats.topClaimerSwing.dropperTeam}; without him in W
                {summaryStats.topClaimerSwing.week}, {summaryStats.topClaimerSwing.claimerTeam}{' '}
                loses {summaryStats.topClaimerSwing.pointsLost.toFixed(2)} pts
                {summaryStats.topClaimerSwing.winsLost > 0 && summaryStats.topClaimerSwing.oppTeam
                  ? ` & loses H2H vs ${summaryStats.topClaimerSwing.oppTeam}`
                  : ''}
              </p>
            </>
          ) : summaryStats.biggest ? (
            <>
              <div className="blunder-kpi-headline">
                <strong>
                  W{summaryStats.biggest.week}: {summaryStats.biggest.sub}
                </strong>
                <span className="luck-tag pos">+{summaryStats.biggest.pointsGained.toFixed(2)} pts</span>
              </div>
              <p className="blunder-kpi-sub">
                {summaryStats.biggest.team} started {summaryStats.biggest.starter} (+
                {summaryStats.biggest.wins}W flipped)
              </p>
            </>
          ) : (
            <p className="blunder-kpi-sub">No single blunder recorded.</p>
          )}
        </div>
      </div>

      {/* 2. Team-Specific Dropdown Inspector */}
      {selectedTeam && (
        <div className="superlative-box blunder-inspector-box">
          <div className="blunder-inspector-toolbar">
            <div className="blunder-selector-group">
              <div className="box-header" style={{ marginBottom: 0 }}>
                <Users size={15} className="luck-icon" />
                <h3>Select Franchise:</h3>
              </div>

              <div className="blunder-select-wrapper">
                <select
                  aria-label="Select franchise to inspect"
                  className="blunder-select"
                  value={activeRosterId ?? ''}
                  onChange={(e) => setSelectedRosterId(Number(e.target.value))}
                >
                  {summaries.map((t) => (
                    <option key={t.rosterId} value={t.rosterId}>
                      {t.teamName} ({t.ownerName}) —{' '}
                      {t.totalWinsGained > 0
                        ? `-${t.totalWinsGained} ${t.totalWinsGained === 1 ? 'Win' : 'Wins'} (${t.actualWins}-${t.actualLosses} → ${t.potentialWins}-${t.potentialLosses})`
                        : `0 Blunders (${t.actualWins}-${t.actualLosses})`}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="blunder-select-icon" />
              </div>
            </div>

            {/* Quick-jump team pills for teams with blunders */}
            <div className="blunder-quick-pills">
              {summaries
                .filter((t) => t.totalWinsGained > 0)
                .map((t) => (
                  <button
                    key={t.rosterId}
                    type="button"
                    className={`blunder-team-pill ${
                      t.rosterId === activeRosterId ? 'active' : ''
                    }`}
                    onClick={() => setSelectedRosterId(t.rosterId)}
                  >
                    <span>{t.teamName}</span>
                    <strong>-{t.totalWinsGained}W</strong>
                  </button>
                ))}
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
                  {selectedTeam.ownerName} ·{' '}
                  {mode === 'bench'
                    ? 'Realistic weekly start/sit mistakes from active bench'
                    : 'Players dropped on waivers who would have flipped lost matchups'}
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
                <span className="blunder-rec-label">
                  {mode === 'bench' ? 'IF BENCH STARTED' : 'IF DROPS KEPT'}
                </span>
                <strong className="blunder-rec-val pos-text">
                  {selectedTeam.potentialWins}–{selectedTeam.potentialLosses}
                </strong>
              </div>
              {selectedTeam.totalWinsGained > 0 ? (
                <span className="luck-tag pos">+{selectedTeam.totalWinsGained} Wins</span>
              ) : (
                <span className="luck-tag neu">0 Wins Lost</span>
              )}
            </div>
          </div>

          {/* Decision List (Up to 5) */}
          {selectedTeam.wrongChoices.length === 0 ? (
            <div className="empty-card">
              <p>
                <CheckCircle2 size={16} />
                {selectedTeam.teamName} has zero realistic{' '}
                {mode === 'bench' ? 'bench start/sit' : 'waiver add/drop'} blunders that cost a win.
              </p>
            </div>
          ) : (
            <div className="blunder-decision-list">
              {selectedTeam.wrongChoices.map((c, idx) => (
                <div
                  key={`${c.week}-${c.starterId}-${c.subId}-${idx}`}
                  className={`blunder-decision-card ${
                    c.blunderType === 'drop' ? 'is-drop' : 'is-bench'
                  }`}
                >
                  <div className="blunder-card-topbar">
                    <div className="blunder-card-meta">
                      <span className="blunder-week-chip">WEEK {c.week}</span>
                      <span className="blunder-slot-chip">{c.slotType}</span>
                      {c.blunderType === 'drop' ? (
                        <span className="blunder-type-badge drop">
                          <UserMinus size={11} /> CUT IN WEEK {c.dropWeek}
                        </span>
                      ) : (
                        <span className="blunder-type-badge bench">
                          <Flame size={11} /> BENCHED STARTER
                        </span>
                      )}
                      <span className="blunder-score-context">
                        Score: <strong>{c.originalPoints.toFixed(2)}</strong> →{' '}
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
                    {c.blunderType === 'drop' && (
                      <div className="blunder-ripple-chip claimer">
                        <span className="ripple-label">CLAIMED BY:</span>
                        <strong>{c.claimedByTeamName || 'Unclaimed (Free Agent)'}</strong>
                        {c.claimerImpact?.startedPlayer ? (
                          <span className="ripple-claimer-detail">
                            Started {c.subName} in W{c.week} — without him (subbing{' '}
                            {c.claimerImpact.backupName
                              ? `${c.claimerImpact.backupName}, ${c.claimerImpact.backupPoints.toFixed(2)} pts`
                              : '0.00 pt backup'}
                            ), {c.claimerImpact.teamName} drops{' '}
                            {c.claimerImpact.originalPoints.toFixed(2)} →{' '}
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
                        ) : c.claimedByTeamName ? (
                          <span className="ripple-claimer-detail">
                            (On {c.claimedByTeamName} bench in W{c.week})
                          </span>
                        ) : null}
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
