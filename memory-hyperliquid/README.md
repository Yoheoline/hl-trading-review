# Hyperliquid Trading Division

## 🏢 組織構成（2026-01-30〜）

```
JARVIS Holdings 🏢
└── 🔷 HL Trading Division
    ├── 【COO】🎖️ JARVIS（Heartbeat — 監視・判断・対処。作業はしない）
    │
    ├── 【前線】トレーダー（4アカウント体制、合計$197.66）
    │   ├── 🧘 Swing Trader (1h) — Account 1 ($49.43)
    │   ├── 📊 DayTrader (15m) — Account 2 ($49.41)
    │   ├── ⚡ Scalper (5m) — Account 3 ($49.41)
    │   └── 🔥 UltraScalper (1m) — Account 4 ($49.41)
    │
    ├── 【防衛・リスク管理】
    │   └── 👁 Position Monitor（10分毎 — SL管理・損失監視・過集中警告・ポートフォリオリスク）
    │
    ├── 【情報】
    │   └── 📰 Fundamental Analyst（朝8:00 / 夜20:00 — ファンダ収集・警告）
    │
    ├── 【研究】
    │   ├── 🔍 Backtest Explorer（30分毎 — パラメータ探索）
    │   └── 📚 Strategy Researcher（日曜10:00 — 新戦略リサーチ）
    │
    └── 【参謀】
        ├── 📝 Trade Reviewer（毎晩22:00 — 日次振り返り・教訓抽出）
        ├── 🔄 System Architect（日曜11:00 — 週次進化レビュー）
        └── 🎯 Chief of Staff（月初10:00 — 月次組織レビュー）
```

**別働隊:**
- 🌅 デイトレアナリスト（平日7:30 — 日本株デイトレ候補選定）

※ 各メンバーの実体はCronジョブ。`cron list` で稼働状況を確認。

---

## 📁 このフォルダの内容

Cronジョブ・ボットの出力データ:
- `state.json` - 現在のアカウント状態
- `market-brief.md` - ファンダ情報 + リスク状態（Fundamental Analyst + Position Monitor が更新。テクニカルは各トレーダーが自分で取得）
- `strategy-analysis.json` - 戦略ランキング（Backtest Explorerが更新）
- `trade-history.json` - トレード履歴
- `trade-lessons.md` - 教訓集（Trade Reviewerが更新）
- `backtest-*.json` - バックテスト結果
- `trades-strategy-*.md` - 各戦略のトレードログ
- `system-health.md` - システム健全性ログ
- `improvement-backlog.md` - 改善バックログ

## 作業記録は別の場所
JARVIS裁量トレードなどの作業記録は:
→ `C:\Users\yohei\projects\hyperliquid-bot\memory\`

プロジェクト固有の詳細はプロジェクト内、ここはCron出力専用。
