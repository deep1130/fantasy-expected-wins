# Fantasy Expected Wins (xWins) & Schedule Luck

An analytics web app that calculates **Expected Wins (xW)**, **Schedule Luck ($\Delta W$)**, and **All-Play standings** for any fantasy football league on [Sleeper](https://sleeper.com).

Supports standard Head-to-Head formats as well as leagues featuring **League Median** (an extra game each week against the median league score).

---

## What is Expected Wins?

In typical fantasy football leagues, you play only one opponent per week. A team that scores the 2nd most points in the league can lose if they happen to face the team that scored the most points that week. Conversely, a team scoring the 2nd lowest points can win if they face the lowest-scoring team.

**Expected Wins (xW)** measures how many wins a team *deserves* based purely on their weekly scoring output, removing the randomness of who they were scheduled to play.

### 1. Head-to-Head Expected Wins
For any given week in an $N$-team league:

$$\text{xW}_{\text{h2h}} = \frac{\text{Teams Outscored} + 0.5 \times \text{Ties}}{N - 1}$$

- If you finish **2nd** in scoring in a 12-team league, you outscore 10 of 11 possible opponents:
  $$\text{xW} = \frac{10}{11} \approx 0.909\text{ wins}$$
- If you finish **1st** in scoring, you outscore 11 opponents:
  $$\text{xW} = \frac{11}{11} = 1.0\text{ wins}$$
- If you finish **12th** (last), you outscore 0 opponents:
  $$\text{xW} = \frac{0}{11} = 0.0\text{ wins}$$

### 2. League Median Scoring Support
When a Sleeper league enables **League Median** (`league_average_match = 1`), teams play two matchups each week:
1. **Head-to-Head matchup** (vs. scheduled opponent)
2. **Median matchup** (vs. the league midpoint score)

In this format:
- Scoring in the top half ($\le N/2$ rank): $+1.0$ median win
- Scoring in the bottom half ($> N/2$ rank): $0.0$ median win
- Exact ties on the median line: $+0.5$ win

Because median scoring is identical for every team based on the weekly distribution, it has zero schedule variance.

$$\text{xW}_{\text{total}} = \text{xW}_{\text{h2h}} + \text{xW}_{\text{median}}$$
$$\text{Actual Wins}_{\text{total}} = \text{Wins}_{\text{h2h}} + \text{Wins}_{\text{median}}$$

### 3. Schedule Luck Delta ($\Delta W$)

$$\text{Luck Delta } (\Delta W) = \text{Actual Wins} - \text{Expected Wins}$$

- **Positive Luck ($+2.5\text{ W}$):** Lucky schedule. The team won matchups despite modest scoring because their opponents repeatedly underperformed against them.
- **Negative Luck ($-2.5\text{ W}$):** Schedule victim. The team posted consistently high scores but repeatedly faced opponents having their highest-scoring weeks of the season.

### 4. All-Play Equivalence
Your All-Play record is your record if you played a complete round-robin against every single league manager every single week:

$$\text{All-Play Wins} = \text{xW}_{\text{h2h}} \times (N - 1)$$
$$\text{All-Play Win \%} = \frac{\text{xW}_{\text{h2h}}}{\text{Weeks Played}}$$

---

## Features

- **Standings View:** Live comparison table with Expected Wins, Actual Wins, Luck Delta, Points For (PF), Points Against (PA), All-Play record, and scoring standard deviation.
- **Weekly Breakdown:** Week-by-week deep dive showing weekly rank, points, matchup outcome, opponent score, and median line cutoff.
- **Schedule Matrix ("What If?"):** A simulation table recalculating every team's record if they had played every other team's schedule.
- **Superlatives & Bad Beats:** Automated detection of the season's biggest "Bad Beats" (high score + loss) and "Lucky Escapes" (low score + win).
- **Fast Sleeper Integration:** Fetches league details, rosters, users, and weekly matchups in parallel using Sleeper's public API without requiring an API key.
- **Responsive Mobile Dark UI:** Built with custom dark theme design tokens (`#0a0b0d`, `#121418`), Space Grotesk, DM Sans, and DM Mono.
- **URL & Storage Sync:** Supports bookmarking and sharing leagues with `?league=<league_id>` and stores the last searched league in `localStorage`.

---

## Mathematical References

- [Wikipedia: Expected Value](https://en.wikipedia.org/wiki/Expected_value)
- [Wikipedia: Round-Robin Tournament](https://en.wikipedia.org/wiki/Round-robin_tournament)
- [Wikipedia: Percentile Rank](https://en.wikipedia.org/wiki/Percentile_rank)

---

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or pnpm

### Installation

```bash
# Clone the repository
cd fantasy-expected-wins

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be running at `http://localhost:5173`.

### Production Build

```bash
# Compile TypeScript and bundle with Vite
npm run build

# Preview production build locally
npm run preview
```

---

## Deployment (GitHub Pages)

A GitHub Actions workflow is included at `.github/workflows/deploy.yml`. When pushed to GitHub on branch `main`, it automatically builds and publishes the app to GitHub Pages.
