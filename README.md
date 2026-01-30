# Hyperliquid AI Trading Organization - Review Package

This repository contains the complete codebase and configuration for an AI-powered BTC trading organization running on Hyperliquid DEX.

## Structure

`
├── hyperliquid-bot/          # Main trading bot code
│   ├── src/                  # Source code (Python + Node.js)
│   │   ├── executor/node-executor/  # Core trading scripts (JS)
│   │   ├── data/             # Market data client (Python)
│   │   ├── strategy/         # Strategy engine (Python)
│   │   ├── risk/             # Risk management (Python)
│   │   └── learning/         # Reflection/learning (Python)
│   ├── config/               # Strategy configuration
│   ├── docs/                 # Dashboard HTML
│   └── CLAUDE.md             # AI agent instructions for this project
│
├── skills-hl-trading/        # AI Organization Skill Files (Source of Truth)
│   ├── SKILL.md              # COO (JARVIS) operational manual
│   ├── swing-trader.md       # Swing Trader (1h) skill
│   ├── day-trader.md         # Day Trader (15m) skill
│   ├── scalper.md            # Scalper (5m) skill
│   ├── ultra-scalper.md      # Ultra Scalper (1m) skill
│   ├── position-monitor.md   # CRO / Position Monitor skill
│   ├── fundamental-analyst.md # Fundamental Analyst skill
│   ├── trade-reviewer.md     # Trade Reviewer (PDCA - daily)
│   ├── strategy-optimizer.md # Strategy Optimizer (PDCA - MWF)
│   ├── system-evolution.md   # System Architect (PDCA - weekly)
│   ├── chief-of-staff.md     # Chief of Staff (monthly)
│   ├── backtest-explorer.md  # Backtest Explorer
│   ├── trader-guide.md       # Common trader guidelines
│   └── hard-limits.md        # CEO-set hard limits (AI cannot override)
│
├── memory-hyperliquid/       # AI Memory & State Files
│   ├── risk-gate.json        # CRO risk gate state
│   ├── market-brief.md       # Current market brief
│   ├── trade-lessons.md      # Accumulated trade lessons
│   ├── strategies-learned.md # Discovered strategies
│   ├── graduation-criteria.md # Conditions for capital increase
│   ├── org-review-report.md  # Organization review report
│   └── ...                   # Other state/analysis files
│
├── hl-dashboard/             # Trading Dashboard (HTML)
│   └── index.html
│
└── HEARTBEAT.md              # COO (JARVIS) heartbeat definition
`

## Architecture

### Organization Structure
`
CEO (Human) → COO (JARVIS/Heartbeat) → Departments (Cron Jobs)
`

### 4-Account Trading Setup
| Account | Role | Timeframe | Risk/Trade |
|---------|------|-----------|------------|
| 1 | Swing | 1h | 4.0% |
| 2 | DayTrade | 15m | 2.5% |
| 3 | Scalp | 5m | 2.0% |
| 4 | UltraScalp | 1m | 1.5% |

### PDCA Cycle
- **Plan**: Skill files define parameters
- **Do**: Cron jobs read skills and execute
- **Check**: Trade Reviewer (daily) / Strategy Optimizer (MWF)
- **Act**: Update skill files → next Cron picks up changes

### Risk Management (CRO)
- Total exposure cap: 50%
- Total risk cap: 7%
- Daily loss limit: 5% → 24h lockout
- Same-direction limit: 3/4 accounts max
- BTC volatility gates: ±7%/1h → halt, ±10%/4h → reduce 50%, ±12%/4h → close all
- FA RED alert → no new entries

### Key Scripts
- `check-signals.js` - Main signal checker (multi-strategy, MTF analysis)
- `entry-with-tpsl.js` - Entry with TP/SL execution
- `backtest-explorer.js` - Strategy backtesting
- `risk-gate-update.js` - CRO risk gate updater
- `position-monitor.js` - Position monitoring

## Notes
- `.env` excluded (contains API keys)
- `node_modules/` excluded
- Large JSON data files (backtest history, strategy analysis) excluded from memory-hyperliquid
- This is a review-only snapshot; the actual running system uses Clawdbot + Cron jobs
