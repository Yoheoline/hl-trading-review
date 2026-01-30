/**
 * Backtest Explorer v2 - 自動パラメータ探索
 * - 検証済みパラメータをスキップ
 * - 複数期間でテスト（直近、1ヶ月前、2ヶ月前など）
 * - 月次換算PnLで公平に比較
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';

const API_URL = 'https://api.hyperliquid.xyz/info';
const FEE_PCT = 0.0007; // 0.07% round-trip fee (taker)
const RESULTS_PATH = 'C:/clawd/memory/hyperliquid/backtest-results.json';
const BASELINE_PATH = 'C:/clawd/memory/hyperliquid/backtest-baseline.json';
const TESTED_PATH = 'C:/clawd/memory/hyperliquid/backtest-tested.json';
const HISTORY_PATH = 'C:/clawd/memory/hyperliquid/backtest-history.json';
const ANALYSIS_PATH = 'C:/clawd/memory/hyperliquid/strategy-analysis.json';

// 探索するパラメータ空間
const PARAM_SPACE = {
  intervals: ['1m', '5m', '15m', '1h', '4h', '1d'],
  strategies: ['maCross', 'rsiMomentum', 'rsi', 'momentum', 'breakout', 'pivotBounce', 'rangeBounce', 'swingPoint', 'returnMove', 'stochRsi', 'vwapBounce', 'obvDivergence', 'bbSqueeze', 'emaCrossRsi', 'atrBreakout', 'supertrend', 'ichimokuCloud', 'donchianBreakout', 'keltnerChannel', 'williamsR', 'macdDivergence', 'linearRegression'],
  positionMode: ['basic', 'pyramid', 'full', 'doten'],
  maxPyramid: [2, 3, 5],
  
  maFast: [5, 9, 12, 20],
  maSlow: [20, 21, 26, 50],
  rsiPeriod: [7, 14, 21],
  rsiOversold: [20, 25, 30, 35],
  rsiOverbought: [65, 70, 75, 80],
  momentumWindow: [2, 3, 5, 10],
  momentumThreshold: [0.001, 0.002, 0.003, 0.005],
  breakoutWindow: [5, 10, 15, 20],
  // Pivot/Range params
  pivotLookback: [24, 48, 96],      // ピボット計算の期間
  pivotTouchPct: [0.001, 0.002, 0.003], // ピボットへの接近閾値
  rangeWindow: [20, 50, 100],       // レンジ検出期間
  rangeBounceZone: [0.1, 0.15, 0.2], // 端からの反発ゾーン(%)
  // Swing point params
  swingLookback: [3, 5, 7],         // スイングポイント検出の左右キャンドル数
  swingBounceThreshold: [0.002, 0.003, 0.005], // 反発確認閾値
  // Return move params
  returnMoveWindow: [10, 20, 30],   // ブレイクアウト検出期間
  returnMoveRetestBars: [3, 5, 10, 15], // 戻りを待つ期間
  returnMoveTouchPct: [0.003, 0.005, 0.008, 0.01], // ブレイクレベルへの接近閾値（広めに）
  takeProfitPct: [0.003, 0.005, 0.01, 0.015, 0.02],
  stopLossPct: [0.0015, 0.0025, 0.005, 0.0075, 0.01],
  // Stochastic RSI
  srRsiPeriod: [7, 14, 21],
  srStochPeriod: [7, 14],
  srOversold: [10, 15, 20],
  // VWAP Bounce
  vwapPeriod: [20, 50, 100],
  vwapBounceZone: [0.001, 0.002, 0.003, 0.005],
  // OBV Divergence
  obvPeriod: [10, 20, 30],
  obvDivWindow: [5, 10, 15],
  // Bollinger Band Squeeze
  bbPeriod: [10, 20, 30],
  bbStdDev: [1.5, 2.0, 2.5],
  bbSqueezeThreshold: [0.01, 0.02, 0.03],
  // EMA Cross RSI
  ecFastEma: [5, 8, 12],
  ecSlowEma: [20, 26, 50],
  ecRsiPeriod: [7, 14],
  ecRsiFilter: [40, 45, 50],
  // ATR Breakout
  atrBoPeriod: [7, 14, 20],
  atrBoMultiplier: [1.0, 1.5, 2.0, 2.5],
  atrBoLookback: [10, 20, 30],
  // Supertrend
  stAtrPeriod: [7, 10, 14],
  stMultiplier: [1.5, 2.0, 3.0],
  // Ichimoku
  ichiTenkan: [7, 9, 12],
  ichiKijun: [22, 26, 30],
  ichiSenkou: [44, 52, 60],
  // Donchian
  donchianPeriod: [10, 20, 30, 55],
  donchianExitPeriod: [5, 10, 15],
  // Keltner Channel
  kcEmaPeriod: [10, 20, 30],
  kcAtrPeriod: [7, 10, 14],
  kcAtrMult: [1.0, 1.5, 2.0, 2.5],
  // Williams %R
  wrPeriod: [7, 14, 21],
  wrOversold: [-90, -85, -80],
  wrOverbought: [-20, -15, -10],
  // MACD Divergence
  macdFast: [8, 12, 16],
  macdSlow: [21, 26, 30],
  macdSignal: [5, 9, 12],
  macdDivWindow: [5, 10, 15],
  // Linear Regression
  lrPeriod: [20, 30, 50],
  lrDevMult: [1.5, 2.0, 2.5],
  srOverbought: [80, 85, 90],
};

// テスト期間（日数前からの期間）
const TEST_PERIODS = [
  { name: 'recent', daysAgo: 0 },      // 直近
  { name: '1m_ago', daysAgo: 30 },     // 1ヶ月前
  { name: '2m_ago', daysAgo: 60 },     // 2ヶ月前
  { name: '3m_ago', daysAgo: 90 },     // 3ヶ月前
];

// パラメータのハッシュを生成
function hashParams(params) {
  const str = JSON.stringify(params, Object.keys(params).sort());
  return createHash('md5').update(str).digest('hex').slice(0, 12);
}

// 検証済みセットを読み込み
function loadTestedSet() {
  if (existsSync(TESTED_PATH)) {
    try { return new Set(JSON.parse(readFileSync(TESTED_PATH))); } catch(e) {}
  }
  return new Set();
}

// 検証済みセットを保存
function saveTestedSet(tested) {
  writeFileSync(TESTED_PATH, JSON.stringify([...tested].slice(-5000))); // 最新5000件保持
}

// Save to history (top 100 per interval, save if better than lowest)
function saveToHistory(result) {
  let history = [];
  if (existsSync(HISTORY_PATH)) {
    try { history = JSON.parse(readFileSync(HISTORY_PATH)); } catch(e) {}
  }
  
  const interval = result.params.interval;
  const newPnl = parseFloat(result.summary.monthlyPnl);
  
  // Get results for this interval
  const intervalResults = history.filter(h => h.params.interval === interval);
  const otherResults = history.filter(h => h.params.interval !== interval);
  
  // Check if duplicate
  if (intervalResults.some(h => h.hash === result.hash)) {
    return;
  }
  
  // If less than 500, just add
  if (intervalResults.length < 500) {
    intervalResults.push(result);
    intervalResults.sort((a, b) => parseFloat(b.summary.monthlyPnl) - parseFloat(a.summary.monthlyPnl));
    const finalHistory = [...otherResults, ...intervalResults];
    writeFileSync(HISTORY_PATH, JSON.stringify(finalHistory, null, 2));
    console.log(`  💾 Saved (${interval}: ${intervalResults.length}/500)`);
    return;
  }
  
  // Find lowest in this interval
  intervalResults.sort((a, b) => parseFloat(b.summary.monthlyPnl) - parseFloat(a.summary.monthlyPnl));
  const lowest = intervalResults[intervalResults.length - 1];
  const lowestPnl = parseFloat(lowest.summary.monthlyPnl);
  
  // If better than lowest, replace it
  if (newPnl > lowestPnl) {
    intervalResults.pop();
    intervalResults.push(result);
    intervalResults.sort((a, b) => parseFloat(b.summary.monthlyPnl) - parseFloat(a.summary.monthlyPnl));
    const finalHistory = [...otherResults, ...intervalResults];
    writeFileSync(HISTORY_PATH, JSON.stringify(finalHistory, null, 2));
    console.log(`  💾 Replaced ${lowestPnl.toFixed(1)}% → ${newPnl.toFixed(1)}% (${interval})`);
  }
}


async function fetchCandles(coin, interval, days, daysAgo = 0) {
  const now = Date.now() - (daysAgo * 24 * 60 * 60 * 1000);
  const startTime = now - (days * 24 * 60 * 60 * 1000);
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval, startTime, endTime: now } })
  });
  return await response.json();
}

function calculateSMA(prices, period) {
  if (prices.length < period) return null;
  return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calculateRSI(prices, period) {
  if (prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change; else losses += Math.abs(change);
  }
  if (losses === 0) return 100;
  return 100 - (100 / (1 + (gains / period) / (losses / period)));
}

// キャンドル数から実際の日数を計算
function candlesToDays(candleCount, interval) {
  const candlesPerDay = { '1m': 1440, '5m': 288, '15m': 96, '1h': 24, '4h': 6, '1d': 1 };
  return candleCount / (candlesPerDay[interval] || 96);
}

// 月次（30日）換算
function toMonthlyPnl(pnl, actualDays) {
  if (actualDays <= 0) return 0;
  return (pnl / actualDays) * 30;
}


function getSignal(params, priceSlice, prices, highs, lows, i, price) {
  let signal = null;
  
  if (params.strategy === 'maCross') {
    const fast = calculateSMA(priceSlice, params.maFast || 9);
    const slow = calculateSMA(priceSlice, params.maSlow || 21);
    const prevFast = calculateSMA(priceSlice.slice(0, -1), params.maFast || 9);
    const prevSlow = calculateSMA(priceSlice.slice(0, -1), params.maSlow || 21);
    if (fast && slow && prevFast && prevSlow) {
      if (prevFast <= prevSlow && fast > slow) signal = 'LONG';
      if (prevFast >= prevSlow && fast < slow) signal = 'SHORT';
    }
  }
  
  if (params.strategy === 'rsi') {
    const rsi = calculateRSI(priceSlice, params.rsiPeriod || 14);
    if (rsi !== null) {
      if (rsi < (params.rsiOversold || 30)) signal = 'LONG';
      if (rsi > (params.rsiOverbought || 70)) signal = 'SHORT';
    }
  }
  
  if (params.strategy === 'rsiMomentum') {
    const rsi = calculateRSI(priceSlice, params.rsiPeriod || 14);
    const window = params.momentumWindow || 5;
    if (rsi !== null && i >= window) {
      const change = (price - prices[i - window]) / prices[i - window];
      if (rsi < (params.rsiOversold || 30) && change < -(params.momentumThreshold || 0.002)) signal = 'LONG';
      if (rsi > (params.rsiOverbought || 70) && change > (params.momentumThreshold || 0.002)) signal = 'SHORT';
    }
  }
  
  if (params.strategy === 'momentum') {
    const window = params.momentumWindow || 5;
    if (i >= window) {
      const change = (price - prices[i - window]) / prices[i - window];
      if (change < -(params.momentumThreshold || 0.002)) signal = 'LONG';
      if (change > (params.momentumThreshold || 0.002)) signal = 'SHORT';
    }
  }
  
  if (params.strategy === 'breakout') {
    const window = params.breakoutWindow || 10;
    if (i >= window) {
      const recentHighs = highs.slice(i - window, i);
      const recentLows = lows.slice(i - window, i);
      const high = Math.max(...recentHighs);
      const low = Math.min(...recentLows);
      if (price > high) signal = 'LONG';
      if (price < low) signal = 'SHORT';
    }
  }
  
  if (params.strategy === 'rangeBounce') {
    const window = params.rangeWindow || 50;
    const bounceZone = params.rangeBounceZone || 0.15;
    if (i >= window) {
      const rangeHighs = highs.slice(i - window, i);
      const rangeLows = lows.slice(i - window, i);
      const rangeHigh = Math.max(...rangeHighs);
      const rangeLow = Math.min(...rangeLows);
      const rangeSize = rangeHigh - rangeLow;
      if (price < rangeLow + rangeSize * bounceZone && price > prices[i - 1]) signal = 'LONG';
      if (price > rangeHigh - rangeSize * bounceZone && price < prices[i - 1]) signal = 'SHORT';
    }
  }
  
  if (params.strategy === 'pivotBounce') {
    const lookback = params.pivotLookback || 24;
    const touchPct = params.pivotTouchPct || 0.002;
    if (i >= lookback) {
      const periodHighs = highs.slice(i - lookback, i);
      const periodLows = lows.slice(i - lookback, i);
      const periodCloses = prices.slice(i - lookback, i);
      const H = Math.max(...periodHighs);
      const L = Math.min(...periodLows);
      const C = periodCloses[periodCloses.length - 1];
      const pivot = (H + L + C) / 3;
      const s1 = 2 * pivot - H;
      const r1 = 2 * pivot - L;
      if (Math.abs(price - s1) / s1 < touchPct && price > prices[i - 1]) signal = 'LONG';
      if (Math.abs(price - r1) / r1 < touchPct && price < prices[i - 1]) signal = 'SHORT';
    }
  }
  
  if (params.strategy === 'swingPoint') {
    const lookback = params.swingLookback || 5;
    const threshold = params.swingBounceThreshold || 0.003;
    if (i >= lookback * 3) {
      let swingLows = [], swingHighs = [];
      for (let j = i - lookback * 3; j < i - lookback; j++) {
        if (j < lookback) continue;
        const leftLows = lows.slice(j - lookback, j);
        const rightLows = lows.slice(j + 1, j + lookback + 1);
        if (lows[j] < Math.min(...leftLows) && lows[j] < Math.min(...rightLows)) swingLows.push(lows[j]);
        const leftHighs = highs.slice(j - lookback, j);
        const rightHighs = highs.slice(j + 1, j + lookback + 1);
        if (highs[j] > Math.max(...leftHighs) && highs[j] > Math.max(...rightHighs)) swingHighs.push(highs[j]);
      }
      if (swingLows.length > 0) {
        const nearestLow = swingLows[swingLows.length - 1];
        if (Math.abs(price - nearestLow) / nearestLow < threshold && price > prices[i - 1]) signal = 'LONG';
      }
      if (swingHighs.length > 0) {
        const nearestHigh = swingHighs[swingHighs.length - 1];
        if (Math.abs(price - nearestHigh) / nearestHigh < threshold && price < prices[i - 1]) signal = 'SHORT';
      }
    }
  }
  
  if (params.strategy === 'returnMove') {
    const window = params.returnMoveWindow || 20;
    const retestBars = params.returnMoveRetestBars || 5;
    const touchPct = params.returnMoveTouchPct || 0.005;
    if (i >= window + retestBars) {
      const lookbackHighs = highs.slice(i - window - retestBars, i - retestBars);
      const lookbackLows = lows.slice(i - window - retestBars, i - retestBars);
      const breakoutHigh = Math.max(...lookbackHighs);
      const breakoutLow = Math.min(...lookbackLows);
      const maxRecentHigh = Math.max(...highs.slice(i - retestBars, i + 1));
      const minRecentLow = Math.min(...lows.slice(i - retestBars, i + 1));
      if (maxRecentHigh > breakoutHigh * 1.001 && 
          price >= breakoutHigh * (1 - touchPct) && price <= breakoutHigh * (1 + touchPct) &&
          price > prices[i - 1]) signal = 'LONG';
      if (minRecentLow < breakoutLow * 0.999 &&
          price >= breakoutLow * (1 - touchPct) && price <= breakoutLow * (1 + touchPct) &&
          price < prices[i - 1]) signal = 'SHORT';
    }
  }
  

  if (params.strategy === 'stochRsi') {
    const rsiP = params.srRsiPeriod || 14;
    const stochP = params.srStochPeriod || 14;
    if (i >= rsiP + stochP) {
      // Calculate RSI series
      const rsis = [];
      for (let k = i - stochP; k <= i; k++) {
        let g = 0, l = 0;
        for (let j = k - rsiP; j < k; j++) {
          const d = prices[j+1] - prices[j];
          if (d > 0) g += d; else l -= d;
        }
        rsis.push(100 - 100 / (1 + g / (l || 0.0001)));
      }
      const rsiHigh = Math.max(...rsis);
      const rsiLow = Math.min(...rsis);
      const stochRsi = rsiHigh !== rsiLow ? (rsis[rsis.length-1] - rsiLow) / (rsiHigh - rsiLow) * 100 : 50;
      const oversold = params.srOversold || 20;
      const overbought = params.srOverbought || 80;
      if (stochRsi < oversold && price > prices[i-1]) signal = 'LONG';
      if (stochRsi > overbought && price < prices[i-1]) signal = 'SHORT';
    }
  }

  if (params.strategy === 'vwapBounce') {
    const period = params.vwapPeriod || 50;
    if (i >= period) {
      let sumPV = 0, sumV = 0;
      for (let j = i - period; j <= i; j++) {
        const typical = (highs[j] + lows[j] + prices[j]) / 3;
        const vol = highs[j] - lows[j];
        sumPV += typical * vol; sumV += vol;
      }
      const vwap = sumPV / sumV;
      const bounceZone = params.vwapBounceZone || 0.002;
      const dist = (price - vwap) / vwap;
      if (Math.abs(dist) < bounceZone) {
        if (price > prices[i-1] && price > vwap) signal = 'LONG';
        if (price < prices[i-1] && price < vwap) signal = 'SHORT';
      }
    }
  }

  if (params.strategy === 'obvDivergence') {
    const divWindow = params.obvDivWindow || 10;
    if (i >= divWindow + 1) {
      let obv = [0];
      for (let j = 1; j <= i; j++) {
        const range = highs[j] - lows[j];
        if (prices[j] > prices[j-1]) obv.push(obv[obv.length-1] + range);
        else if (prices[j] < prices[j-1]) obv.push(obv[obv.length-1] - range);
        else obv.push(obv[obv.length-1]);
      }
      const obvNow = obv[obv.length-1], obvPrev = obv[obv.length-1-divWindow];
      if (price < prices[i-divWindow] && obvNow > obvPrev && price > prices[i-1]) signal = 'LONG';
      if (price > prices[i-divWindow] && obvNow < obvPrev && price < prices[i-1]) signal = 'SHORT';
    }
  }

  if (params.strategy === 'bbSqueeze') {
    const period = params.bbPeriod || 20;
    const stdMult = params.bbStdDev || 2.0;
    const sqThresh = params.bbSqueezeThreshold || 0.02;
    if (i >= period * 2) {
      const slice = prices.slice(i - period, i + 1);
      const sma = slice.reduce((a,b) => a+b, 0) / slice.length;
      const std = Math.sqrt(slice.reduce((s,v) => s + (v-sma)**2, 0) / slice.length);
      const upper = sma + stdMult * std, lower = sma - stdMult * std;
      const bw = (upper - lower) / sma;
      const ps = prices.slice(i-period-1, i);
      const pSma = ps.reduce((a,b) => a+b, 0) / ps.length;
      const pStd = Math.sqrt(ps.reduce((s,v) => s + (v-pSma)**2, 0) / ps.length);
      const pBw = ((pSma + stdMult*pStd) - (pSma - stdMult*pStd)) / pSma;
      if (pBw < sqThresh && bw > pBw * 1.1) {
        if (price > upper) signal = 'LONG';
        if (price < lower) signal = 'SHORT';
      }
    }
  }

  if (params.strategy === 'emaCrossRsi') {
    const fastLen = params.ecFastEma || 8, slowLen = params.ecSlowEma || 21;
    const rsiP = params.ecRsiPeriod || 14, rsiF = params.ecRsiFilter || 45;
    if (i >= Math.max(slowLen, rsiP) + 2) {
      const ema = (data, len) => { const k = 2/(len+1); let e = data[0]; for (let j=1;j<data.length;j++) e = data[j]*k + e*(1-k); return e; };
      const fN = ema(prices.slice(0,i+1).slice(-fastLen*3), fastLen);
      const fP = ema(prices.slice(0,i).slice(-fastLen*3), fastLen);
      const sN = ema(prices.slice(0,i+1).slice(-slowLen*3), slowLen);
      const sP = ema(prices.slice(0,i).slice(-slowLen*3), slowLen);
      let gains=0, losses=0;
      for (let j=i-rsiP; j<i; j++) { const d=prices[j+1]-prices[j]; if(d>0) gains+=d; else losses-=d; }
      const rsi = 100 - 100/(1 + gains/(losses||0.0001));
      if (fP <= sP && fN > sN && rsi > rsiF) signal = 'LONG';
      if (fP >= sP && fN < sN && rsi < (100-rsiF)) signal = 'SHORT';
    }
  }

  if (params.strategy === 'atrBreakout') {
    const atrP = params.atrBoPeriod || 14, atrM = params.atrBoMultiplier || 1.5, lb = params.atrBoLookback || 20;
    if (i >= Math.max(atrP, lb) + 1) {
      let atrSum = 0;
      for (let j = i-atrP; j < i; j++) atrSum += Math.max(highs[j]-lows[j], Math.abs(highs[j]-prices[j-1]), Math.abs(lows[j]-prices[j-1]));
      const atr = atrSum / atrP;
      const mid = prices.slice(i-lb, i).reduce((a,b) => a+b, 0) / lb;
      if (price > mid + atr*atrM && price > prices[i-1]) signal = 'LONG';
      if (price < mid - atr*atrM && price < prices[i-1]) signal = 'SHORT';
    }
  }

  if (params.strategy === 'supertrend') {
    const atrP = params.stAtrPeriod || 10;
    const mult = params.stMultiplier || 3.0;
    if (i >= atrP + 1) {
      let atrSum = 0;
      for (let j = i - atrP; j < i; j++) atrSum += Math.max(highs[j]-lows[j], Math.abs(highs[j]-prices[j-1]), Math.abs(lows[j]-prices[j-1]));
      const atr = atrSum / atrP;
      const hl2 = (highs[i] + lows[i]) / 2;
      const upperBand = hl2 + mult * atr;
      const lowerBand = hl2 - mult * atr;
      const prevHl2 = (highs[i-1] + lows[i-1]) / 2;
      let prevAtrSum = 0;
      for (let j = i-1-atrP; j < i-1; j++) prevAtrSum += Math.max(highs[j]-lows[j], Math.abs(highs[j]-prices[j-1]), Math.abs(lows[j]-prices[j-1]));
      const prevAtr = prevAtrSum / atrP;
      const prevUpper = prevHl2 + mult * prevAtr;
      const prevLower = prevHl2 - mult * prevAtr;
      if (price > upperBand && !(prices[i-1] > prevUpper)) signal = 'LONG';
      if (price < lowerBand && !(prices[i-1] < prevLower)) signal = 'SHORT';
    }
  }

  if (params.strategy === 'ichimokuCloud') {
    const tenkanP = params.ichiTenkan || 9;
    const kijunP = params.ichiKijun || 26;
    const senkouP = params.ichiSenkou || 52;
    if (i >= senkouP) {
      const midHL = (start, len) => {
        let hi = -Infinity, lo = Infinity;
        for (let j = start; j < start + len && j <= i; j++) { hi = Math.max(hi, highs[j]); lo = Math.min(lo, lows[j]); }
        return (hi + lo) / 2;
      };
      const tenkan = midHL(i - tenkanP + 1, tenkanP);
      const kijun = midHL(i - kijunP + 1, kijunP);
      const senkouA = (tenkan + kijun) / 2;
      const senkouB = midHL(i - senkouP + 1, senkouP);
      const cloudTop = Math.max(senkouA, senkouB);
      const cloudBottom = Math.min(senkouA, senkouB);
      if (price > cloudTop && prices[i-1] <= cloudTop) signal = 'LONG';
      if (price < cloudBottom && prices[i-1] >= cloudBottom) signal = 'SHORT';
    }
  }

  if (params.strategy === 'donchianBreakout') {
    const period = params.donchianPeriod || 20;
    if (i >= period) {
      const channelHighs = highs.slice(i - period, i);
      const channelLows = lows.slice(i - period, i);
      const upper = Math.max(...channelHighs);
      const lower = Math.min(...channelLows);
      if (price > upper) signal = 'LONG';
      if (price < lower) signal = 'SHORT';
    }
  }

  if (params.strategy === 'keltnerChannel') {
    const emaP = params.kcEmaPeriod || 20;
    const atrP = params.kcAtrPeriod || 10;
    if (i >= Math.max(emaP, atrP) + 1) {
      const k = 2 / (emaP + 1);
      let ema = prices[0];
      for (let j = 1; j <= i; j++) ema = prices[j] * k + ema * (1 - k);
      let atrSum = 0;
      for (let j = i - atrP; j < i; j++) atrSum += Math.max(highs[j]-lows[j], Math.abs(highs[j]-prices[j-1]), Math.abs(lows[j]-prices[j-1]));
      const atr = atrSum / atrP;
      const mult = params.kcAtrMult || 1.5;
      const upper = ema + mult * atr;
      const lower = ema - mult * atr;
      if (price > upper && price > prices[i-1]) signal = 'LONG';
      if (price < lower && price < prices[i-1]) signal = 'SHORT';
    }
  }

  if (params.strategy === 'williamsR') {
    const period = params.wrPeriod || 14;
    if (i >= period) {
      const periodHighs = highs.slice(i - period + 1, i + 1);
      const periodLows = lows.slice(i - period + 1, i + 1);
      const hh = Math.max(...periodHighs);
      const ll = Math.min(...periodLows);
      const wr = hh !== ll ? ((hh - price) / (hh - ll)) * -100 : -50;
      if (wr < (params.wrOversold || -80) && price > prices[i-1]) signal = 'LONG';
      if (wr > (params.wrOverbought || -20) && price < prices[i-1]) signal = 'SHORT';
    }
  }

  if (params.strategy === 'macdDivergence') {
    const fastLen = params.macdFast || 12, slowLen = params.macdSlow || 26;
    const divW = params.macdDivWindow || 10;
    if (i >= slowLen + divW + 10) {
      const ema = (data, len) => { const k = 2/(len+1); let e = data[0]; for(let j=1;j<data.length;j++) e=data[j]*k+e*(1-k); return e; };
      const calcHist = (idx) => {
        const sl = prices.slice(0, idx + 1);
        return ema(sl.slice(-fastLen*3), fastLen) - ema(sl.slice(-slowLen*3), slowLen);
      };
      const histNow = calcHist(i), histPrev = calcHist(i - divW);
      if (price < prices[i-divW] && histNow > histPrev && price > prices[i-1]) signal = 'LONG';
      if (price > prices[i-divW] && histNow < histPrev && price < prices[i-1]) signal = 'SHORT';
    }
  }

  if (params.strategy === 'linearRegression') {
    const period = params.lrPeriod || 30;
    const devMult = params.lrDevMult || 2.0;
    if (i >= period) {
      const slice = prices.slice(i - period + 1, i + 1);
      const n = slice.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      for (let j = 0; j < n; j++) { sumX += j; sumY += slice[j]; sumXY += j * slice[j]; sumX2 += j * j; }
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      const predicted = intercept + slope * (n - 1);
      let devSum = 0;
      for (let j = 0; j < n; j++) { const diff = slice[j] - (intercept + slope * j); devSum += diff * diff; }
      const stdDev = Math.sqrt(devSum / n);
      if (price < predicted - devMult * stdDev && price > prices[i-1]) signal = 'LONG';
      if (price > predicted + devMult * stdDev && price < prices[i-1]) signal = 'SHORT';
    }
  }

  return signal;
}

function runBacktest(candles, params) {
  const prices = candles.map(c => parseFloat(c.c));
  const highs = candles.map(c => parseFloat(c.h));
  const lows = candles.map(c => parseFloat(c.l));
  const mode = params.positionMode || 'basic';
  const maxPyramid = params.maxPyramid || 3;
  const FEE_RATE = 0.00035;
  
  let position = null, trades = [], pnl = 0;
  
  for (let i = 50; i < prices.length; i++) {
    const price = prices[i];
    const priceSlice = prices.slice(0, i + 1);
    
    // Check TP/SL if in position
    if (position) {
      const avgEntry = position.entries ? 
        position.entries.reduce((sum, e) => sum + e.price, 0) / position.entries.length : 
        position.entry;
      const totalSize = position.entries ? position.entries.length : 1;
      const pnlPct = position.isLong ? (price - avgEntry) / avgEntry : (avgEntry - price) / avgEntry;
      
      // TP/SL check
      if (pnlPct >= params.takeProfitPct || pnlPct <= -params.stopLossPct) {
        const netPnl = (pnlPct - FEE_RATE * 2) * totalSize;
        trades.push({ ...position, exit: price, pnl: netPnl, avgEntry, size: totalSize });
        pnl += netPnl;
        position = null;
        continue;
      }
      
      // Get signal for doten/pyramid
      const signal = getSignal(params, priceSlice, prices, highs, lows, i, price);
      
      if (signal) {
        const isOpposite = (position.isLong && signal === 'SHORT') || (!position.isLong && signal === 'LONG');
        const isSame = (position.isLong && signal === 'LONG') || (!position.isLong && signal === 'SHORT');
        
        // Doten (reverse position)
        if (isOpposite && (mode === 'doten' || mode === 'full')) {
          const netPnl = (pnlPct - FEE_RATE * 2) * totalSize;
          trades.push({ ...position, exit: price, pnl: netPnl, reason: 'doten' });
          pnl += netPnl;
          position = { entry: price, isLong: signal === 'LONG', time: i, entries: [{ price, time: i }] };
          continue;
        }
        
        // Pyramid (add to position)
        if (isSame && (mode === 'pyramid' || mode === 'full')) {
          if (!position.entries) position.entries = [{ price: position.entry, time: position.time }];
          if (position.entries.length < maxPyramid) {
            position.entries.push({ price, time: i });
          }
          continue;
        }
      }
      continue;
    }
    
    // New entry
    const signal = getSignal(params, priceSlice, prices, highs, lows, i, price);
    if (signal) {
      position = { entry: price, isLong: signal === 'LONG', time: i, entries: [{ price, time: i }] };
    }
  }
  
  const wins = trades.filter(t => t.pnl > 0).length;
  return {
    trades: trades.length,
    wins,
    losses: trades.length - wins,
    winRate: trades.length > 0 ? (wins / trades.length * 100).toFixed(1) : '0',
    totalPnl: (pnl * 100).toFixed(2),
    avgPnl: trades.length > 0 ? (pnl / trades.length * 100).toFixed(3) : '0',
    candleCount: prices.length
  };
}

// ベストパラメータの近傍を生成（ヒルクライミング用）
// 数値パラメータを±20%変動、離散値は最も近い候補にスナップ
function generateNeighborParams(bestParams, testedSet, maxAttempts = 50) {
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  
  // 数値パラメータを±perturbPct変動させ、PARAM_SPACE内の最近値にスナップ
  function perturbNumeric(value, spaceKey, perturbPct = 0.2) {
    const space = PARAM_SPACE[spaceKey];
    if (!space || !Array.isArray(space)) return value;
    const factor = 1 + (Math.random() * 2 - 1) * perturbPct; // 0.8 ~ 1.2
    const target = value * factor;
    // 最も近い候補にスナップ
    let closest = space[0];
    let minDist = Math.abs(target - closest);
    for (const v of space) {
      const dist = Math.abs(target - v);
      if (dist < minDist) { minDist = dist; closest = v; }
    }
    return closest;
  }
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const params = { ...bestParams };
    
    // 一部のカテゴリカルパラメータはそのまま維持（strategy, interval）
    // positionMode, maxPyramidは時々変える（20%の確率）
    if (Math.random() < 0.2) params.positionMode = pick(PARAM_SPACE.positionMode);
    if (Math.random() < 0.2) params.maxPyramid = pick(PARAM_SPACE.maxPyramid);
    
    // 数値パラメータを変動
    if (params.maFast != null) params.maFast = perturbNumeric(params.maFast, 'maFast');
    if (params.maSlow != null) params.maSlow = perturbNumeric(params.maSlow, 'maSlow');
    if (params.maFast >= params.maSlow) continue;
    
    if (params.rsiPeriod != null) params.rsiPeriod = perturbNumeric(params.rsiPeriod, 'rsiPeriod');
    if (params.rsiOversold != null) params.rsiOversold = perturbNumeric(params.rsiOversold, 'rsiOversold');
    if (params.rsiOverbought != null) params.rsiOverbought = perturbNumeric(params.rsiOverbought, 'rsiOverbought');
    if (params.momentumWindow != null) params.momentumWindow = perturbNumeric(params.momentumWindow, 'momentumWindow');
    if (params.momentumThreshold != null) params.momentumThreshold = perturbNumeric(params.momentumThreshold, 'momentumThreshold');
    if (params.breakoutWindow != null) params.breakoutWindow = perturbNumeric(params.breakoutWindow, 'breakoutWindow');
    if (params.pivotLookback != null) params.pivotLookback = perturbNumeric(params.pivotLookback, 'pivotLookback');
    if (params.pivotTouchPct != null) params.pivotTouchPct = perturbNumeric(params.pivotTouchPct, 'pivotTouchPct');
    if (params.rangeWindow != null) params.rangeWindow = perturbNumeric(params.rangeWindow, 'rangeWindow');
    if (params.rangeBounceZone != null) params.rangeBounceZone = perturbNumeric(params.rangeBounceZone, 'rangeBounceZone');
    if (params.swingLookback != null) params.swingLookback = perturbNumeric(params.swingLookback, 'swingLookback');
    if (params.swingBounceThreshold != null) params.swingBounceThreshold = perturbNumeric(params.swingBounceThreshold, 'swingBounceThreshold');
    if (params.returnMoveWindow != null) params.returnMoveWindow = perturbNumeric(params.returnMoveWindow, 'returnMoveWindow');
    if (params.returnMoveRetestBars != null) params.returnMoveRetestBars = perturbNumeric(params.returnMoveRetestBars, 'returnMoveRetestBars');
    if (params.returnMoveTouchPct != null) params.returnMoveTouchPct = perturbNumeric(params.returnMoveTouchPct, 'returnMoveTouchPct');
    if (params.takeProfitPct != null) params.takeProfitPct = perturbNumeric(params.takeProfitPct, 'takeProfitPct');
    if (params.stopLossPct != null) params.stopLossPct = perturbNumeric(params.stopLossPct, 'stopLossPct');
    
    const hash = hashParams(params);
    if (!testedSet.has(hash)) {
      return { params, hash };
    }
  }
  return null;
}

// 既存のベストパラメータをstrategy-analysis.jsonから取得
function loadBestParams() {
  if (!existsSync(ANALYSIS_PATH)) return null;
  try {
    const analysis = JSON.parse(readFileSync(ANALYSIS_PATH));
    if (!analysis.strategies) return null;
    // 全strategy/intervalからbestを集め、pnl降順でソート
    const bests = [];
    for (const strategy of Object.keys(analysis.strategies)) {
      for (const interval of Object.keys(analysis.strategies[strategy])) {
        const data = analysis.strategies[strategy][interval];
        if (data?.best?.params && data.best.pnl > 0) {
          bests.push({ params: data.best.params, pnl: data.best.pnl });
        }
      }
    }
    if (bests.length === 0) return null;
    bests.sort((a, b) => b.pnl - a.pnl);
    return bests;
  } catch(e) { return null; }
}

function generateRandomParams(testedSet, maxAttempts = 50) {
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const strategy = pick(PARAM_SPACE.strategies);
    const interval = pick(PARAM_SPACE.intervals);
    
    const params = { 
      strategy, 
      interval, 
      positionMode: pick(PARAM_SPACE.positionMode),
      maxPyramid: pick(PARAM_SPACE.maxPyramid),
      takeProfitPct: pick(PARAM_SPACE.takeProfitPct), 
      stopLossPct: pick(PARAM_SPACE.stopLossPct) 
    };
    
    if (strategy === 'maCross') { 
      params.maFast = pick(PARAM_SPACE.maFast); 
      params.maSlow = pick(PARAM_SPACE.maSlow);
      if (params.maFast >= params.maSlow) continue; // fast must be < slow
    }
    if (strategy === 'rsi' || strategy === 'rsiMomentum') { 
      params.rsiPeriod = pick(PARAM_SPACE.rsiPeriod); 
      params.rsiOversold = pick(PARAM_SPACE.rsiOversold); 
      params.rsiOverbought = pick(PARAM_SPACE.rsiOverbought); 
    }
    if (strategy === 'momentum' || strategy === 'rsiMomentum') { 
      params.momentumWindow = pick(PARAM_SPACE.momentumWindow); 
      params.momentumThreshold = pick(PARAM_SPACE.momentumThreshold); 
    }
    if (strategy === 'breakout') {
      params.breakoutWindow = pick(PARAM_SPACE.breakoutWindow);
    }
    if (strategy === 'pivotBounce') {
      params.pivotLookback = pick(PARAM_SPACE.pivotLookback);
      params.pivotTouchPct = pick(PARAM_SPACE.pivotTouchPct);
    }
    if (strategy === 'rangeBounce') {
      params.rangeWindow = pick(PARAM_SPACE.rangeWindow);
      params.rangeBounceZone = pick(PARAM_SPACE.rangeBounceZone);
    }
    if (strategy === 'swingPoint') {
      params.swingLookback = pick(PARAM_SPACE.swingLookback);
      params.swingBounceThreshold = pick(PARAM_SPACE.swingBounceThreshold);
    }
    if (strategy === 'returnMove') {
      params.returnMoveWindow = pick(PARAM_SPACE.returnMoveWindow);
      params.returnMoveRetestBars = pick(PARAM_SPACE.returnMoveRetestBars);
      params.returnMoveTouchPct = pick(PARAM_SPACE.returnMoveTouchPct);
    }
    if (strategy === 'stochRsi') {
      params.srRsiPeriod = pick(PARAM_SPACE.srRsiPeriod);
      params.srStochPeriod = pick(PARAM_SPACE.srStochPeriod);
      params.srOversold = pick(PARAM_SPACE.srOversold);
      params.srOverbought = pick(PARAM_SPACE.srOverbought);
    }
    if (strategy === 'vwapBounce') {
      params.vwapPeriod = pick(PARAM_SPACE.vwapPeriod);
      params.vwapBounceZone = pick(PARAM_SPACE.vwapBounceZone);
    }
    if (strategy === 'obvDivergence') {
      params.obvPeriod = pick(PARAM_SPACE.obvPeriod);
      params.obvDivWindow = pick(PARAM_SPACE.obvDivWindow);
    }
    if (strategy === 'bbSqueeze') {
      params.bbPeriod = pick(PARAM_SPACE.bbPeriod);
      params.bbStdDev = pick(PARAM_SPACE.bbStdDev);
      params.bbSqueezeThreshold = pick(PARAM_SPACE.bbSqueezeThreshold);
    }
    if (strategy === 'emaCrossRsi') {
      params.ecFastEma = pick(PARAM_SPACE.ecFastEma);
      params.ecSlowEma = pick(PARAM_SPACE.ecSlowEma);
      params.ecRsiPeriod = pick(PARAM_SPACE.ecRsiPeriod);
      params.ecRsiFilter = pick(PARAM_SPACE.ecRsiFilter);
    }
    if (strategy === 'atrBreakout') {
      params.atrBoPeriod = pick(PARAM_SPACE.atrBoPeriod);
      params.atrBoMultiplier = pick(PARAM_SPACE.atrBoMultiplier);
      params.atrBoLookback = pick(PARAM_SPACE.atrBoLookback);
    }
    if (strategy === 'supertrend') {
      params.stAtrPeriod = pick(PARAM_SPACE.stAtrPeriod);
      params.stMultiplier = pick(PARAM_SPACE.stMultiplier);
    }
    if (strategy === 'ichimokuCloud') {
      params.ichiTenkan = pick(PARAM_SPACE.ichiTenkan);
      params.ichiKijun = pick(PARAM_SPACE.ichiKijun);
      params.ichiSenkou = pick(PARAM_SPACE.ichiSenkou);
    }
    if (strategy === 'donchianBreakout') {
      params.donchianPeriod = pick(PARAM_SPACE.donchianPeriod);
      params.donchianExitPeriod = pick(PARAM_SPACE.donchianExitPeriod);
    }
    if (strategy === 'keltnerChannel') {
      params.kcEmaPeriod = pick(PARAM_SPACE.kcEmaPeriod);
      params.kcAtrPeriod = pick(PARAM_SPACE.kcAtrPeriod);
      params.kcAtrMult = pick(PARAM_SPACE.kcAtrMult);
    }
    if (strategy === 'williamsR') {
      params.wrPeriod = pick(PARAM_SPACE.wrPeriod);
      params.wrOversold = pick(PARAM_SPACE.wrOversold);
      params.wrOverbought = pick(PARAM_SPACE.wrOverbought);
    }
    if (strategy === 'macdDivergence') {
      params.macdFast = pick(PARAM_SPACE.macdFast);
      params.macdSlow = pick(PARAM_SPACE.macdSlow);
      params.macdSignal = pick(PARAM_SPACE.macdSignal);
      params.macdDivWindow = pick(PARAM_SPACE.macdDivWindow);
    }
    if (strategy === 'linearRegression') {
      params.lrPeriod = pick(PARAM_SPACE.lrPeriod);
      params.lrDevMult = pick(PARAM_SPACE.lrDevMult);
    }
    
    const hash = hashParams(params);
    if (!testedSet.has(hash)) {
      return { params, hash };
    }
  }
  
  return null; // 全部テスト済み
}

async function runExploration(iterations = 5) {
  console.log(`Running ${iterations} backtest explorations (multi-period, monthly-normalized, hill-climbing + walk-forward)...`);
  
  const testedSet = loadTestedSet();
  console.log(`Already tested: ${testedSet.size} combinations`);
  
  // ヒルクライミング: bestパラメータを読み込み
  const bestParamsList = loadBestParams();
  const hasHillClimbTargets = bestParamsList && bestParamsList.length > 0;
  if (hasHillClimbTargets) {
    console.log(`🏔️ Hill-climbing enabled: ${bestParamsList.length} best params available`);
  } else {
    console.log(`🎲 No best params yet, using full random exploration`);
  }
  
  // 探索配分: 半分ランダム、半分ヒルクライミング（bestがある場合）
  const hillClimbCount = hasHillClimbTargets ? Math.floor(iterations / 2) : 0;
  const randomCount = iterations - hillClimbCount;
  
  const results = [];
  const baseDays = { '1m': 3, '5m': 7, '15m': 14, '1h': 30 };
  
  for (let i = 0; i < iterations; i++) {
    const useHillClimb = hasHillClimbTargets && i >= randomCount;
    let generated;
    
    if (useHillClimb) {
      // ヒルクライミング: bestからランダムに選んで近傍探索
      const pick = arr => arr[Math.floor(Math.random() * arr.length)];
      const bestEntry = pick(bestParamsList);
      generated = generateNeighborParams(bestEntry.params, testedSet);
      if (generated) {
        console.log(`\n[${i + 1}/${iterations}] 🏔️ Hill-climb from ${bestEntry.params.strategy}/${bestEntry.params.interval} (base pnl: ${bestEntry.pnl.toFixed(2)}%)`);
      }
    }
    
    if (!generated) {
      generated = generateRandomParams(testedSet);
      if (generated && useHillClimb) {
        console.log(`  (hill-climb exhausted, falling back to random)`);
      }
    }
    
    if (!generated) {
      console.log('All combinations tested!');
      break;
    }
    
    const { params, hash } = generated;
    const mode = useHillClimb && generated ? '🏔️' : '🎲';
    console.log(`\n[${i + 1}/${iterations}] ${mode} ${params.strategy}/${params.positionMode || "basic"} (${params.interval}) - hash:${hash}`);
    
    const periodResults = [];
    
    for (const period of TEST_PERIODS) {
      try {
        const candles = await fetchCandles('BTC', params.interval, baseDays[params.interval], period.daysAgo);
        if (!candles || candles.length < 100) {
          console.log(`  ${period.name}: skip (insufficient data)`);
          continue;
        }
        
        const result = runBacktest(candles, params);
        
        // 実際の日数と月次換算PnLを計算
        const actualDays = candlesToDays(result.candleCount, params.interval);
        const monthlyPnl = toMonthlyPnl(parseFloat(result.totalPnl), actualDays);
        
        console.log(`  ${period.name}: ${result.trades} trades, ${result.winRate}% WR, ${result.totalPnl}% raw (${actualDays.toFixed(1)}d), 月次${monthlyPnl.toFixed(2)}%`);
        
        periodResults.push({
          period: period.name,
          daysAgo: period.daysAgo,
          actualDays: actualDays,
          monthlyPnl: monthlyPnl,
          ...result
        });
        
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.log(`  ${period.name}: error - ${e.message}`);
      }
    }
    
    // ウォークフォワード検証: 直近期間のキャンドルを前半(train)/後半(test)に分割
    let walkForward = null;
    try {
      const wfCandles = await fetchCandles('BTC', params.interval, baseDays[params.interval], 0);
      if (wfCandles && wfCandles.length >= 200) {
        const midpoint = Math.floor(wfCandles.length / 2);
        const trainCandles = wfCandles.slice(0, midpoint);
        const testCandles = wfCandles.slice(midpoint);
        
        const trainResult = runBacktest(trainCandles, params);
        const testResult = runBacktest(testCandles, params);
        
        const trainDays = candlesToDays(trainResult.candleCount, params.interval);
        const testDays = candlesToDays(testResult.candleCount, params.interval);
        const trainPnl = toMonthlyPnl(parseFloat(trainResult.totalPnl), trainDays);
        const testPnl = toMonthlyPnl(parseFloat(testResult.totalPnl), testDays);
        const overfitFlag = trainPnl > 0 && testPnl < 0;
        
        walkForward = { trainPnl, testPnl, overfitFlag };
        
        const overfitLabel = overfitFlag ? ' ⚠️ OVERFIT' : '';
        console.log(`  📊 Walk-forward: train=${trainPnl.toFixed(2)}% test=${testPnl.toFixed(2)}%${overfitLabel}`);
      }
    } catch(e) {
      console.log(`  📊 Walk-forward: error - ${e.message}`);
    }
    
    if (periodResults.length > 0) {
      // 月次換算PnLの平均
      const avgMonthlyPnl = periodResults.reduce((sum, r) => sum + r.monthlyPnl, 0) / periodResults.length;
      const avgWinRate = periodResults.reduce((sum, r) => sum + parseFloat(r.winRate), 0) / periodResults.length;
      const consistency = periodResults.filter(r => r.monthlyPnl > 0).length / periodResults.length;
      
      // 1トレードあたり期待値（総PnL / 総トレード数）
      const totalPnlSum = periodResults.reduce((sum, r) => sum + parseFloat(r.totalPnl), 0);
      const totalTradesSum = periodResults.reduce((sum, r) => sum + r.trades, 0);
      const avgExpectedPnl = totalTradesSum > 0 ? totalPnlSum / totalTradesSum : 0;
      
      const resultEntry = {
        params,
        hash,
        periodResults,
        summary: {
          avgMonthlyPnl: avgMonthlyPnl.toFixed(2),
          avgExpectedPnl: avgExpectedPnl.toFixed(3),
          avgWinRate: avgWinRate.toFixed(1),
          consistency: (consistency * 100).toFixed(0) + '%',
          periods: periodResults.length
        },
        timestamp: new Date().toISOString()
      };
      
      // ウォークフォワード結果を追加
      if (walkForward) {
        resultEntry.walkForward = walkForward;
      }
      
      results.push(resultEntry);
      
      console.log(`  => 月次: ${avgMonthlyPnl.toFixed(2)}%, 期待値: ${avgExpectedPnl.toFixed(3)}%/trade, WR: ${avgWinRate.toFixed(1)}%`);
    }
    
    testedSet.add(hash);
    await new Promise(r => setTimeout(r, 500));
  }
  
  saveTestedSet(testedSet);
  
  // Save results
  let existing = { results: [] };
  if (existsSync(RESULTS_PATH)) try { existing = JSON.parse(readFileSync(RESULTS_PATH)); } catch(e) {}
  const all = [...results, ...(existing.results || [])].slice(0, 200);
  
  const saveData = {
    lastRun: new Date().toISOString(),
    results: all
  };
  writeFileSync(RESULTS_PATH, JSON.stringify(saveData, null, 2));
  
  // Save all results to history (top 100 per interval)
  for (const r of results) {
    saveToHistory(r);
  }
  
  console.log(`\nTotal tested: ${testedSet.size}`);

  // Build strategy-analysis.json
  buildStrategyAnalysis(results);

  return results;
}

// Build strategy-analysis.json from ALL history + existing analysis (merge, not overwrite)
// 手法 × 時間軸ごとにパラメータTop5を保存（手法横断のrecommendedは不要）
function buildStrategyAnalysis(results) {
  // Load full history for comprehensive analysis
  let allResults = results;
  if (existsSync(HISTORY_PATH)) {
    try {
      const history = JSON.parse(readFileSync(HISTORY_PATH));
      allResults = [...results, ...history];
    } catch(e) {}
  }
  
  // Deduplicate by hash
  const seen = new Set();
  allResults = allResults.filter(r => {
    if (seen.has(r.hash)) return false;
    seen.add(r.hash);
    return true;
  });
  
  // Load existing analysis to preserve results not in history
  let existingAnalysis = null;
  if (existsSync(ANALYSIS_PATH)) {
    try {
      existingAnalysis = JSON.parse(readFileSync(ANALYSIS_PATH));
    } catch(e) {}
  }

  const strategies = {};

  // First: seed from existing analysis (preserve current top5)
  if (existingAnalysis?.strategies) {
    for (const strategy of Object.keys(existingAnalysis.strategies)) {
      if (!strategies[strategy]) strategies[strategy] = {};
      for (const interval of Object.keys(existingAnalysis.strategies[strategy])) {
        const existing = existingAnalysis.strategies[strategy][interval];
        if (!strategies[strategy][interval]) {
          strategies[strategy][interval] = { variations: [], best: null };
        }
        if (existing?.variations) {
          for (const v of existing.variations) {
            // Use params hash to track seen
            const paramHash = hashParams(v.params);
            if (!seen.has(paramHash)) {
              seen.add(paramHash);
              strategies[strategy][interval].variations.push(v);
            }
          }
        }
      }
    }
  }

  // Then: add from history + current results
  for (const result of allResults) {
    if (!result.params || !result.summary) continue;
    const { strategy, interval } = result.params;
    if (!strategy || !interval) continue;

    if (!strategies[strategy]) strategies[strategy] = {};
    if (!strategies[strategy][interval]) {
      strategies[strategy][interval] = { variations: [], best: null };
    }

    // Build variation entry
    const trades = result.periodResults 
      ? result.periodResults.reduce((sum, p) => sum + (p.trades || 0), 0)
      : 0;
    const variation = {
      params: result.params,
      pnl: parseFloat(result.summary.avgMonthlyPnl) || 0,
      winRate: parseFloat(result.summary.avgWinRate) || 0,
      expectedPnl: parseFloat(result.summary.avgExpectedPnl) || 0,
      trades,
      consistency: result.summary.consistency
    };
    
    // ウォークフォワード検証データを追加
    if (result.walkForward) {
      variation.trainPnl = result.walkForward.trainPnl;
      variation.testPnl = result.walkForward.testPnl;
      variation.overfitFlag = result.walkForward.overfitFlag;
    }

    // Only keep positive PnL variations
    if (variation.pnl > 0) {
      strategies[strategy][interval].variations.push(variation);
    }
  }

  // Sort variations by PnL and keep top 5 for each strategy/interval
  for (const strategy of Object.keys(strategies)) {
    for (const interval of Object.keys(strategies[strategy])) {
      const data = strategies[strategy][interval];
      // Deduplicate by params within each cell
      const paramSeen = new Set();
      data.variations = data.variations.filter(v => {
        const key = JSON.stringify(v.params, Object.keys(v.params).sort());
        if (paramSeen.has(key)) return false;
        paramSeen.add(key);
        return true;
      });
      data.variations.sort((a, b) => b.pnl - a.pnl);
      data.variations = data.variations.slice(0, 5); // Top 5 per strategy/interval
      data.best = data.variations[0] || null;
    }
  }

  const analysis = {
    strategies,
    updatedAt: new Date().toISOString()
  };

  writeFileSync(ANALYSIS_PATH, JSON.stringify(analysis, null, 2));
  console.log(`\n💾 Strategy analysis saved to ${ANALYSIS_PATH}`);
}

runExploration(parseInt(process.argv[2]) || 5).catch(console.error);
