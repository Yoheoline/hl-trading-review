# Hyperliquid AI Trading Organization

BTCパーペチュアル先物を自動売買するAI組織の全構造。

## 概要

- **プラットフォーム:** Hyperliquid（分散型パーペチュアル先物取引所）
- **対象:** BTC-PERP のみ
- **運用資金:** $197.66（4アカウント × ~$49.4）
- **技術:** Node.js スクリプト群 + Clawdbot（AI常駐アシスタント）の Cronジョブ
- **各Cronジョブ:** 独立したAIセッション（isolated session）として起動。セッション間で文脈を共有しない。共有はファイル経由のみ。

## ディレクトリ構造

```
├── SKILL.md                    # 組織全体のマニュアル（CEO指令・組織図・行動規範）
├── trader-guide.md             # トレーダー共通ガイド（判断プロセス・絶対ルール）
├── hard-limits.md              # CEO設定・AI変更不可の絶対制限
│
├── swing-trader.md             # 🧘 Swing Trader (1h) — Account 1
├── day-trader.md               # 📊 DayTrader (15m) — Account 2
├── scalper.md                  # ⚡ Scalper (5m) — Account 3
├── ultra-scalper.md            # 🔥 UltraScalper (1m) — Account 4
│
├── position-monitor.md         # 🛡️ CRO — 最高リスク責任者（リスクゲート管理）
├── fundamental-analyst.md      # 📰 Fundamental Analyst（ファンダメンタル情報収集）
├── backtest-explorer.md        # 🔍 Backtest Explorer（パラメータ探索）
├── strategy-optimizer.md       # 🧬 Strategy Optimizer（データドリブン最適化）
├── trade-reviewer.md           # 📝 Trade Reviewer（日次振り返り）
├── system-evolution.md         # 🔄 System Architect（週次進化レビュー）
├── chief-of-staff.md           # 🎯 Chief of Staff（月次組織レビュー）
│
├── cron-prompts/               # 全Cronジョブのプロンプト（実際にAIに送られるテキスト）
│
├── memory/                     # 状態ファイル・設定
│   ├── risk-gate.json          # リスクゲート状態（CROが更新、全トレーダーが参照）
│   ├── graduation-criteria.md  # 増資判断条件（卒業条件）
│   ├── market-brief.md         # マーケットブリーフ（FAが更新、トレーダーが参照）
│   ├── trade-lessons.md        # 教訓集（Reviewerが更新、トレーダーが必読）
│   ├── trade-history.json      # トレード履歴（構造化データ）
│   ├── jarvis-trades.md        # トレード履歴（人間可読）
│   ├── strategies-learned.md   # 学習した戦略ナレッジ
│   ├── system-health.md        # システム健全性ログ
│   ├── improvement-backlog.md  # 改善バックログ
│   └── trading-plan.md         # トレーディングプラン
│
└── scripts/                    # 実行スクリプト（Node.js）
    ├── check-signals.js        # シグナル取得（テクニカル分析）
    ├── executor.js             # 注文実行
    ├── add-tpsl-v2.js          # TP/SL自動設定
    ├── position-monitor.js     # ポジション監視
    ├── check-all-positions.js  # 全アカウントポジション確認
    ├── risk-gate-update.js     # リスクゲート更新
    ├── trade-review.js         # トレード統計取得
    └── backtest-snapshot.js    # バックテスト状態スナップショット
```

## 組織構造

```
👔 CEO: よーさん（最終決定者）
🎖️ COO: JARVIS（Heartbeat — 監視・判断・対処。作業はしない）

🔷 HL Trading Division（各部署 = Cronジョブ）
├── 【前線】トレーダー
│   ├── 🧘 Swing Trader (1h) — Account 1 — 毎時:00
│   ├── 📊 DayTrader (15m) — Account 2 — 5分毎
│   ├── ⚡ Scalper (5m) — Account 3 — 5分毎
│   └── 🔥 UltraScalper (1m) — Account 4 — 3分毎
├── 【防衛】
│   └── 🛡️ CRO (Position Monitor) — 10分毎
├── 【情報】
│   └── 📰 Fundamental Analyst — 朝8:00/夜20:00
├── 【研究】
│   ├── 🔍 Backtest Explorer — 30分毎
│   └── 📚 Strategy Researcher — 日曜10:00
├── 【最適化】
│   └── 🧬 Strategy Optimizer — 月水金12:00
└── 【参謀】
    ├── 📝 Trade Reviewer — 毎晩22:00
    ├── 🔄 System Architect — 日曜11:00
    └── 🎯 Chief of Staff — 月初10:00
```

## データフロー

```
📰 FA → market-brief.md → トレーダー（Step 2で参照）
🛡️ CRO → risk-gate.json → トレーダー（Step 2.5で参照）
📝 Reviewer → trade-lessons.md → トレーダー（Step 1で参照）
📝 Reviewer / 🧬 Optimizer → スキルファイル更新 → トレーダー（次回起動で即反映）
🔍 Explorer → strategy-analysis.json → トレーダー（Step 6で参照）
```

## PDCAサイクル

```
Plan: スキルファイルで定義
Do: Cronがスキルを読んで実行
Check: Trade Reviewer（毎晩）/ Strategy Optimizer（週3）/ System Architect（週次）
Act: スキルファイルを更新 → 次のCron起動で即反映
暴走防止: hard-limits.md が絶対範囲を定義
```

## レビュー依頼

この組織構造について、以下の観点でレビューをお願いします：

1. **矛盾・不整合** — ファイル間で矛盾している箇所はないか
2. **設計上の弱点** — 致命的な問題が起きるシナリオは？
3. **改善提案** — 組織効率・リスク管理・PDCA回り方の改善点
4. **見落とし** — 気づいていない盲点はないか

特に：
- CRO（リスク管理）の設計は十分か
- PDCAサイクルは暴走しないか
- 各メンバーの役割分担に隙間や重複はないか
- 卒業条件（増資判断）は適切か
