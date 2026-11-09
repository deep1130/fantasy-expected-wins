import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
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
      {/* 1. Ultra-compact 3-card league summary strip */}
      <div className="blunder-summary-row">
        <div className="blunder-kpi-box">
          <div className="blunder-kpi-top">
            <span className="blunder-kpi-tag neg">
              {mode === 'bench' ? 'WORST BENCH DECISIONS' : 'MOST COSTLY DROPS'}
            </span>
            {summaryStats.worstTeam && (
              <span className="luck-tag neg">-{summaryStats.worstTeam.totalWinsGained}W</span>
            )}
          </div>
          {summaryStats.worstTeam ? (
            <div className="blunder-kpi-line">
              <strong>{summaryStats.worstTeam.teamName}</strong>
              <span>
                {summaryStats.worstTeam.actualWins}–{summaryStats.worstTeam.actualLosses} →{' '}
                {summaryStats.worstTeam.potentialWins}–{summaryStats.worstTeam.potentialLosses} (
                {summaryStats.totalWins}W league total)
              </span>
            </div>
          ) : (
            <span className="blunder-kpi-sub">None recorded</span>
          )}
        </div>

        <div className="blunder-kpi-box">
          <div className="blunder-kpi-top">
            <span className="blunder-kpi-tag pos">
              {mode === 'bench' ? 'CLEANEST BENCH (0 LOST)' : 'CLEANEST WAIVERS (0 LOST)'}
            </span>
            <span className="luck-tag pos">{summaryStats.cleanTeams.length} Teams</span>
          </div>
          <div className="blunder-kpi-line">
            <span className="blunder-clean-list">
              {summaryStats.cleanTeams.length > 0
                ? summaryStats.cleanTeams.map((t) => t.teamName).join(' · ')
                : 'Every team had at least 1 blunder'}
            </span>
          </div>
        </div>

        <div className="blunder-kpi-box">
          <div className="blunder-kpi-top">
            <span className="blunder-kpi-tag accent">
              {mode === 'bench' ? 'BIGGEST BENCH SWING' : 'CLAIMER WIN IMPACT'}
            </span>
            {mode === 'drop' && summaryStats.topClaimerSwing ? (
              <span className="luck-tag neg">
                {summaryStats.topClaimerSwing.winsLost > 0
                  ? `-${summaryStats.topClaimerSwing.winsLost}W Claimer`
                  : `-${summaryStats.topClaimerSwing.pointsLost.toFixed(1)} pts`}
              </span>
            ) : summaryStats.biggest ? (
              <span className="luck-tag pos">+{summaryStats.biggest.pointsGained.toFixed(1)} pts</span>
            ) : null}
          </div>
          {mode === 'drop' && summaryStats.topClaimerSwing ? (
            <div className="blunder-kpi-line">
              <strong>
                W{summaryStats.topClaimerSwing.week} {summaryStats.topClaimerSwing.player}
              </strong>
              <span>
                {summaryStats.topClaimerSwing.claimerTeam} loses{' '}
                {summaryStats.topClaimerSwing.pointsLost.toFixed(1)} pts
                {summaryStats.topClaimerSwing.winsLost > 0 && summaryStats.topClaimerSwing.oppTeam
                  ? ` & H2H vs ${summaryStats.topClaimerSwing.oppTeam}`
                  : ''}
              </span>
            </div>
          ) : summaryStats.biggest ? (
            <div className="blunder-kpi-line">
              <strong>
                W{summaryStats.biggest.week} {summaryStats.biggest.sub}
              </strong>
              <span>
                over {summaryStats.biggest.starter} ({summaryStats.biggest.team}, +
                {summaryStats.biggest.wins}W)
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* 2. Compact Screenshot-Friendly Franchise Inspector */}
      {selectedTeam && (
        <div className="superlative-box blunder-inspector-box">
          {/* Merged Header: Dropdown + Quick Pills + Selected Team Record */}
          <div className="blunder-header-bar">
            <div className="blunder-header-left">
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
                        ? `-${t.totalWinsGained}W (${t.actualWins}-${t.actualLosses} → ${t.potentialWins}-${t.potentialLosses})`
                        : `0 Blunders (${t.actualWins}-${t.actualLosses})`}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="blunder-select-icon" />
              </div>
            </div>

            <div className="blunder-banner-records">
              <div className="blunder-record-chip">
                <span className="blunder-rec-label">ACTUAL</span>
                <strong>
                  {selectedTeam.actualWins}–{selectedTeam.actualLosses}
                </strong>
              </div>
              <ArrowRight size={13} className="blunder-rec-arrow" />
              <div className="blunder-record-chip optimal">
                <span className="blunder-rec-label">WHAT-IF</span>
                <strong className="pos-text">
                  {selectedTeam.potentialWins}–{selectedTeam.potentialLosses}
                </strong>
              </div>
              {selectedTeam.totalWinsGained > 0 ? (
                <span className="luck-tag pos">+{selectedTeam.totalWinsGained} Wins</span>
              ) : (
                <span className="luck-tag neu">0 Lost</span>
              )}
            </div>
          </div>

          {/* Quick-jump team pills */}
          <div className="blunder-quick-pills">
            {summaries
              .filter((t) => t.totalWinsGained > 0)
              .map((t) => (
                <button
                  key={t.rosterId}
                  type="button"
                  className={`blunder-team-pill ${t.rosterId === activeRosterId ? 'active' : ''}`}
                  onClick={() => setSelectedRosterId(t.rosterId)}
                >
                  <span>{t.teamName}</span>
                  <strong>-{t.totalWinsGained}W</strong>
                </button>
              ))}
          </div>

          {/* Compact Decision Cards (all fit in 1 screenshot) */}
          {selectedTeam.wrongChoices.length === 0 ? (
            <div className="empty-card" style={{ padding: '22px 14px' }}>
              <p>
                <CheckCircle2 size={15} />
                {selectedTeam.teamName} has zero realistic{' '}
                {mode === 'bench' ? 'bench start/sit' : 'waiver add/drop'} blunders that cost a win.
              </p>
            </div>
          ) : (
            <div className="blunder-decision-list">
              {selectedTeam.wrongChoices.map((c, idx) => (
                <div
                  key={`${c.week}-${c.starterId}-${c.subId}-${idx}`}
                  className={`blunder-compact-card ${
                    c.blunderType === 'drop' ? 'is-drop' : 'is-bench'
                  }`}
                >
                  {/* Row 1: Week/Slot | Started -> Bench/Drop | Score & Win Badge */}
                  <div className="blunder-compact-main">
                    <div className="blunder-compact-taggroup">
                      <span className="blunder-week-chip">W{c.week}</span>
                      <span className="blunder-slot-chip">
                        {c.blunderType === 'drop' ? `CUT W${c.dropWeek} · ${c.slotType}` : c.slotType}
                      </span>
                    </div>

                    <div className="blunder-compact-players">
                      <div className="blunder-cp-side bad">
                        <span className="cp-role">STARTED</span>
                        <strong>{c.starterName}</strong>
                        <span className="cp-pts neg-text">{c.starterPoints.toFixed(2)}</span>
                        {c.starterProjected != null && (
                          <span className="cp-proj">(proj {c.starterProjected.toFixed(1)})</span>
                        )}
                      </div>

                      <div className="blunder-cp-arrow">
                        <ArrowRight size={13} />
                        <span>+{c.pointsGained.toFixed(2)}</span>
                      </div>

                      <div className="blunder-cp-side good">
                        <span className="cp-role">
                          {c.blunderType === 'drop' ? 'DROPPED' : 'BENCH'}
                        </span>
                        <strong>{c.subName}</strong>
                        <span className="cp-pts pos-text">{c.subPoints.toFixed(2)}</span>
                        {c.subProjected != null && (
                          <span className="cp-proj">(proj {c.subProjected.toFixed(1)})</span>
                        )}
                      </div>
                    </div>

                    <div className="blunder-compact-outcome">
                      <span className="blunder-compact-score">
                        {c.originalPoints.toFixed(1)} →{' '}
                        <strong className="pos-text">{c.newTotalPoints.toFixed(1)}</strong>{' '}
                        <span className="cp-opp">(vs {c.oppPoints.toFixed(1)})</span>
                      </span>
                      <div className="blunder-card-badges">
                        {c.h2hFlipped && <span className="blunder-flip-pill">H2H</span>}
                        {c.medianFlipped && <span className="blunder-flip-pill">MED</span>}
                        <span className="luck-tag pos">+{c.winsGained}W</span>
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Single-line Ripple Impact */}
                  <div className="blunder-compact-sub">
                    {c.whoLosesH2H && (
                      <span className="cp-impact-item">
                        H2H from <strong>{c.whoLosesH2H}</strong> <b className="neg-text">(-1W)</b>
                      </span>
                    )}
                    {c.whoLosesMedian && (
                      <span className="cp-impact-item">
                        Median from <strong>{c.whoLosesMedian}</strong>{' '}
                        <b className="neg-text">(-1W)</b>
                      </span>
                    )}
                    {c.blunderType === 'drop' && (
                      <span className="cp-impact-item claimer">
                        Claimed by <strong>{c.claimedByTeamName || 'FA'}</strong>
                        {c.claimerImpact?.startedPlayer ? (
                          c.claimerImpact.pointsLost > 0 ? (
                            <>
                              {' '}
                              (started in W{c.week}; subbing{' '}
                              {c.claimerImpact.backupName
                                ? `${c.claimerImpact.backupName} ${c.claimerImpact.backupPoints.toFixed(1)}`
                                : '0.0'}{' '}
                              drops {c.claimerImpact.teamName}{' '}
                              {c.claimerImpact.originalPoints.toFixed(1)} →{' '}
                              {c.claimerImpact.newPoints.toFixed(1)} [-
                              {c.claimerImpact.pointsLost.toFixed(1)} pts]
                              {c.claimerImpact.winsLost > 0 ? (
                                <b className="neg-text">
                                  {' '}
                                  · loses -{c.claimerImpact.winsLost}W vs{' '}
                                  {c.claimerImpact.oppTeamName}
                                </b>
                              ) : (
                                ' · holds W/L'
                              )}
                              )
                            </>
                          ) : (
                            ` (started in W${c.week}; backup ${c.claimerImpact.backupName || 'QB'} had ${c.claimerImpact.backupPoints.toFixed(1)} pts · holds W/L)`
                          )
                        ) : c.claimedByTeamName ? (
                          ` (benched in W${c.week})`
                        ) : null}
                      </span>
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
