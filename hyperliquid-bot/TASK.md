# Multi-Strategy Bot 実装タスク

## 目標
複数戦略を並列監視し、相場状況に応じて最適な戦略でトレードするシステム

## 背景
現状は各時間軸で1つの戦略のみ。複数戦略を組み合わせて「条件揃ったものを実行」する方が柔軟。

## 実装内容

### 1. backtest-explorer.js 改修
現状のbacktest-explorer.jsを確認して、以下に対応:
- 各戦略のパラメータバリエーションをテスト
- 結果を新形式で保存

**新形式:**
```json
{
  "strategies": {
    "momentum": {
      "5m": {
        "variations": [
          {"threshold": 0.3, "pnl": 50, "winRate": 55, "trades": 120},
          {"threshold": 0.5, "pnl": 70, "winRate": 60, "trades": 80}
        ],
        "best": {"threshold": 0.5, "pnl": 70, "winRate": 60}
      }
    },
    "supportBounce": {
      "5m": {
        "variations": [
          {"rsiThreshold": 30, "pnl": 80, "winRate": 70, "trades": 50}
        ],
        "best": {...}
      }
    }
  },
  "recommended": {
    "5m": ["supportBounce_rsi30", "momentum_0.5"],
    "15m": ["maCross_9_21"],
    "1h": ["breakout"]
  },
  "updatedAt": "2026-01-30T..."
}
```

保存先: `C:/clawd/memory/hyperliquid/strategy-analysis.json`

### 2. 新ファイル: src/executor/node-executor/multi-strategy-bot.js

**構造:**
```javascript
// 1. Market Regime Detector
function detectRegime(candles) {
  // ADXでトレンド強度を測定
  // Bollinger Band widthでボラティリティ測定
  // return { trend: 0-100, range: 0-100 }
}

// 2. Strategy Pool
const strategies = {
  // トレンド向き
  momentum: { check: (candles, params) => {...}, regimeAffinity: 'trend' },
  maCross: { check: (candles, params) => {...}, regimeAffinity: 'trend' },
  breakout: { check: (candles, params) => {...}, regimeAffinity: 'trend' },
  
  // レンジ向き
  supportBounce: { check: (candles, params) => {...}, regimeAffinity: 'range' },
  rsiReversal: { check: (candles, params) => {...}, regimeAffinity: 'range' },
};

// 3. Signal Generator
function generateSignals(candles, regime, strategyConfig) {
  // 各戦略をチェック
  // 相場適合度で重み付け
  // return signals with confidence scores
}

// 4. Confluence Checker
function checkConfluence(signals) {
  // 同方向のシグナルが複数 → 確信度UP
  // 例: momentum + maCross両方LONG → confidence × 1.5
}

// 5. Executor
function execute(signal, account) {
  // サイズ計算（リスクベース）
  // エントリー + TP/SL設定
}
```

### 3. 戦略の実装詳細

**momentum:**
- 直近N本のキャンドルの変化率を計算
- threshold超えたらシグナル
- params: { period: 5, threshold: 0.5 }

**maCross:**
- 短期MA vs 長期MA
- ゴールデンクロス → LONG, デッドクロス → SHORT
- params: { shortPeriod: 9, longPeriod: 21 }

**supportBounce:**
- 直近安値をサポートとして検出
- サポート付近 + RSI < threshold → LONG
- params: { rsiThreshold: 35, supportLookback: 20 }

**breakout:**
- 直近のレンジを検出
- レンジ上限ブレイク + ボリューム急増 → LONG
- params: { rangePeriod: 20, volumeMultiple: 1.5 }

**rsiReversal:**
- RSI < 30 → LONG, RSI > 70 → SHORT
- params: { oversold: 30, overbought: 70 }

### 4. テスト方法
1. backtest-explorer.jsで各戦略のパラメータ最適化を実行
2. strategy-analysis.jsonに結果保存
3. multi-strategy-botが結果を読み込んで、recommendedな戦略を監視
4. シグナル発生時にconfluenceチェック → 実行

### 5. 実行
まずbacktest-explorer.jsの改修から始めてください。
現在のコードを読んで、新形式に対応するよう修正。
