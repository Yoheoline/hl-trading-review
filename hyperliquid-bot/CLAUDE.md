# Hyperliquid Autonomous Trading Bot

## Overview
自律学習型BTC自動売買BOT。Hyperliquid上でスキャルピング〜短期デイトレを行い、
数トレードごとに自己振り返り・戦略改善を行う。

## Architecture
- Data Module: 価格データ、センチメント収集
- Strategy Engine: シグナル生成、エントリー判断
- Executor: Hyperliquid API経由で注文執行
- Risk Manager: ポジションサイジング、損切り
- Learning Module: 振り返り、仮説検証、パラメータ調整

## Core Principles

### 1. Safety First
- 1トレード最大リスク: 5%
- 日次最大損失: 15%
- キルスイッチ: 連続3敗 or 日次損失10%超で一時停止

### 2. Adaptive Learning Loop
- 5トレードごとにMicro-Reflection
- 勝率、PnL、市場状態を分析
- パラメータ微調整 or 戦略切替

### 3. Multi-Source Analysis
- テクニカル: RSI, MA, Volume
- センチメント: X/Twitter, News
- オンチェーン: Funding Rate, Open Interest

## Risk Parameters
- max_position_pct: 0.3 (最大ポジション: 資金の30%)
- max_loss_per_trade_pct: 0.05
- max_daily_loss_pct: 0.15
- max_leverage: 3
- kill_switch: consecutive_losses=3, daily_loss_trigger=0.10

## API Keys
Store in .env:
HYPERLIQUID_API_KEY=your_key
HYPERLIQUID_API_SECRET=your_secret
HYPERLIQUID_WALLET_ADDRESS=your_wallet

## Memory / 作業記録

作業記録は `memory/` フォルダに保存:
- `memory/jarvis-trades.md` - JARVIS裁量トレード記録

### ルール
- 作業の区切りごとに状態を書く
- 数値（残高、ポジション、PnL）は必ず記録
- コンテキスト圧縮後の復旧に使う

### 復旧時
1. `memory/jarvis-trades.md` を読む
2. 最新の状態から再開
