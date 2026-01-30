# 🔍 AI Trading Organization - Code Review Package

## 概要
BTC専業の自律トレーディングAI組織。4アカウント×4時間軸。$200規模の実験機。
目標: 退場しないこと。利益は副産物。

## アーキテクチャ

```
CEO (よーさん・人間)
  └── COO (JARVIS) — Heartbeat監視のみ
       └── CRO (10分毎) — risk-gate-update.js → risk-gate.json
       └── Traders (Cron) — スキルファイル読む → check-signals.js → executor.js
       └── PDCA層 — Trade Reviewer / Strategy Optimizer / System Architect
```

各トレーダーのCronがスキルファイル(markdown)を読み、以下を実行:
1. 教訓確認 (trade-lessons.md)
2. ファンダ確認 (market-brief.md)
3. **リスクゲート確認 (risk-gate.json)** ← NEW
4. ポジション確認 (check-all-positions.js)
5. シグナル取得 (check-signals.js <interval>)
6. 確信度計算 → 閾値以上なら executor.js でエントリー

---

## 1. check-signals.js — シグナル判断の心臓部

### 構造
- 22種のテクニカル戦略を実装 (momentum, rangeBounce, rsi, maCross, breakout, pivotBounce, swingPoint, returnMove, stochRsi, supertrend, ichimokuCloud, donchianBreakout, keltnerChannel, williamsR, bbSqueeze, vwapBounce, macdDivergence, obvDivergence, emaCrossRsi, atrBreakout, linearRegression, rsiMomentum)
- strategy-analysis.json（バックテスト結果）からTop5戦略を自動選択
- MTF（マルチタイムフレーム）分析: 対象時間軸 + 上位2つの時間軸を確認

### シグナル判断フロー
1. 上位足の分析（トレンド + バイアス）
2. 自分の時間軸でTop5戦略のシグナル確認
3. MTFコンフルエンス計算:
   - 自分のシグナル: 各+20点
   - 上位足バイアス一致: +15~30点
   - 上位足バイアス逆行: -25点
   - 上位足トレンド一致: +10点
   - 上位足トレンド逆行: -15点
4. スコア60+: STRONG signal, 30+: signal, 0以下: SKIP

### 全戦略の共通パターン
- ほぼ全戦略が「直近N本のキャンドルデータ」のみ使用
- 出来高データはOBV以外では使っていない（Hyperliquidの出来高がrangeで代用）
- 各戦略のパラメータはstrategy-analysis.jsonから動的取得（バックテスト最適値）

---

## 2. risk-gate-update.js — CROリスクゲート

### チェック項目
1. 全体エクスポージャー > 50%（含み損考慮） → 新規禁止
2. 同方向集中 3/4アカウント → その方向禁止
3. 合計リスク ≧ 7% (Kelly基準) → 新規禁止
4. 日次損失 > -5% → 翌日タイムロック（手動解除不可）
5. BTC 1h変動 > ±7% → 新規停止
6. BTC 4h変動 > ±10% → 50%縮小 / > ±12% → 全クローズ
7. FA警告🔴 → 新規禁止

### 追加機能
- **崩壊予兆スコア (dangerScore 0-100)**: 各リスク要因を数値化、止めなくても記録
- **仮想継続ログ (virtualTrades)**: ゲート発動時に「止めなかったら」の結果を記録

---

## 3. executor.js — 注文執行

- Hyperliquid API経由でBTC-PERPの成行注文
- `risk_pct`ベースのポジションサイジング（残高×risk%÷SL%）
- TP/SL自動設定（add-tpsl-v2.js）
- アカウント指定（--account 1~4）

---

## 4. PDCAサイクル

- **Trade Reviewer (毎晩22:00)**: 日次レビュー、パラメータ微調整（±20%以内）
- **Strategy Optimizer (月水金12:00)**: データドリブン最適化
- **System Architect (日曜11:00)**: 構造変更
- **hard-limits.md**: CEO設定の絶対範囲（AIは超えられない）
- 変更権限: 🟢Auto(±20%) / 🟡Report(範囲超) / 🔴Strict(CEO only)

---

## 5. 卒業条件（増資判断）

| 条件 | 閾値 |
|------|------|
| 連続稼働 | 30日+ |
| 最大DD | -15%以内 |
| ガード有効率 | 60%+ |
| 勝率 | 45%+ |
| ゲート発動 | 1回以上 |
| 致命的バグ | 0件 |

---

## レビュー依頼事項

この組織の設計・実装を見て:
1. **致命的な設計上の欠陥**はあるか？
2. **check-signals.jsの戦略群**は妥当か？22戦略は多すぎ/少なすぎ？
3. **MTFコンフルエンスの点数配分**は適切か？
4. **risk-gate-update.jsのチェック項目**に漏れはないか？
5. **PDCAサイクル**に暴走リスクや盲点はないか？
6. **$200規模で月額APIコスト**が利益を上回るリスクは？
7. **その他、改善提案**があれば。
