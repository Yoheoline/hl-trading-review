# Hyperliquid Bot Strategy

## Current Configuration (4 Accounts)

| Bot | Account | Timeframe | Strategy | Status |
|-----|---------|-----------|----------|--------|
| bot-swing | 1 | 1h | **rangeBounce(pyramid)** | LIVE |
| bot-daytrade | 2 | 15m | **momentum(pyramid)** | LIVE |
| bot-scalp | 3 | 5m | **rangeBounce(pyramid)** | LIVE |
| bot-ultrascalp | 4 | 1m | **rangeBounce(pyramid)** | LIVE |

## 評価チェックリスト (10トレード後)

### 1. 基本指標
- [ ] 勝率: ___%
- [ ] 平均R:R: ___
- [ ] トレード頻度: ___/day

### 2. TP/SL分析
- [ ] TP発動: ___回
- [ ] SL発動: ___回
- [ ] 手動クローズ: ___回

### 3. シグナル別勝率
- [ ] Momentum: ___%
- [ ] Breakout: ___%
- [ ] MA Cross: ___%

### 4. パラメータ調整検討
- RSI閾値: 現在 30/70
- TP/SL幅: 現在 ___
- エントリー条件: ___

### 5. 次のアクション
- [ ] 継続
- [ ] パラメータ調整
- [ ] 戦略変更

---

## 変更履歴

### 2026-01-29 20:00
- **bot-scalp: rsi/basic → rangeBounce(pyramid) に変更**
  - 5mで最高成績: 月次 **+142.47%** (62.5% WR, 8勝3敗)
  - 変更点:
    - strategy: rsi → rangeBounce
    - positionMode: basic → pyramid
    - TP: 0.5% → 2%
    - rangeWindow: 50, rangeBounceZone: 0.15
    - maxPyramid: 5
  - 旧設定(rsi/basic): +80.01%/月
  - **+78%改善** 📈
  - 自動更新（backtestで15%以上の改善検出）
  - ネットワークエラー(7/10)発生中も継続動作、戦略更新とrestart実施

### 2026-01-29 07:33
- **bot-daytrade: パラメータ最適化**
  - Backtest結果: 月次 **+32.36%** (48.8% WR, 100%一貫性)
  - 変更点:
    - TP: 2% → 1.5%
    - momentumWindow: 5 → 10
    - maxPyramid: 追加 (7)
    - momentumThreshold: 0.003 → 0.002
  - 旧設定: +19.46%/月
  - **+66%改善** 📈
  - 自動更新（backtestで15%以上の改善検出）

### 2026-01-29 06:25
- **bot-ultrascalp: パラメータ最適化**
  - Backtest結果: 月次 **+189.20%** (91.7% WR, 22勝2敗)
  - 変更点:
    - SL: 0.5% → 0.75%
    - rangeBounceZone: 0.2 → 0.1
    - maxPyramid: 3 → 2
  - 旧設定推定: ~+86%/月
  - 約2倍の改善見込み
  - 自動更新（backtestで15%以上の改善検出）

### 2026-01-29 05:02
- **bot-swing: rsiMomentum → rangeBounce(pyramid) に変更**
  - 1hで最高成績: 月次+18.93%
  - positionMode: pyramid
  - rangeWindow: 20, rangeBounceZone: 0.2
  - TP:2%, SL:0.75%
  - 旧設定(rsiMomentum): -$0.89 (2トレード、0勝1敗)
  - 自動更新（backtestで改善検出）

### 2026-01-29 04:36
- **bot-ultrascalp: パラメータ最適化**
  - TP: 0.3% → 0.5%
  - SL: 0.75% → 0.5%
  - rangeBounceZone: 0.1 → 0.2
  - Backtest結果: +86.30%/月 (67.6% win rate, 23勝11敗)
  - 旧設定: +45.70%/月 → **+89%改善**
  - pm2 restart済み

### 2026-01-29 04:15
- **bot-scalp: rangeBounce → momentum(pyramid) に変更**
  - 5mで最高成績: 月次+54.81%、win rate 78.1% (32勝7敗)
  - momentum戦略, TP:0.5%, SL:1%
  - momentumWindow: 10, threshold: 0.002

### 2026-01-29 04:00
- **bot-daytrade: 5m/basic → 15m/pyramid に変更**
  - 15mで最高成績: 月次+19.46%、win rate 47.2%
  - positionMode: pyramid
  - interval: 15m → 5mから変更
  - momentumWindow: 5 (以前は10)
  - TP:2%, SL:1%
  - 自動更新（backtestで15%以上の改善検出）

### 2026-01-29 02:47
- **bot-swing: returnMove → breakout(pyramid) に変更**
  - 1hで最高成績: 月次+12.96%、consistency 75%
  - positionMode: pyramid, maxPyramid: 3
  - breakoutWindow: 20
  - TP:2%, SL:0.75%
  - 旧ポジション手動クローズ（+$0.03）

### 2026-01-28 20:42
- **bot-daytrade: rangeBounce → momentum に変更**
  - 15mで最高成績: 月次+28.66%、consistency 100%
  - priceWindowMinutes=30 (2キャンドル)
  - entryThreshold=0.5%
  - TP:1.5%, SL:0.75%

### 2026-01-28 20:30
- bot-daytrade: MA Cross → rangeBounce に変更（すぐmomentumに切替）
- bot.jsにrangeBounce実装を追加
- maxWindow計算を修正（rangeWindowを考慮）

### 2026-01-28
- 初期設定: 3アカウント体制でLIVE開始
- bot-swing: 1h RSI+Momentum
- bot-daytrade: 15m MA Cross
- bot-scalp: 5m MA Cross

---

## トレードログ参照
- `memory/hyperliquid/trades-strategy-swing.md`
- `memory/hyperliquid/trades-strategy-daytrade.md`
- `memory/hyperliquid/trades-strategy-scalp.md`
