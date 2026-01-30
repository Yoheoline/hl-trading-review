/**
 * Multi-Strategy Bot
 * 
 * 複数戦略を並列監視し、相場状況に応じて最適な戦略でトレード
 * 
 * Features:
 * - strategy-analysis.json からrecommended戦略をロード
 * - Market Regime検出（トレンド vs レンジ）
 * - 複数戦略を並列チェック
 * - Confluence scoring（複数戦略一致で確信度UP）
 * - 最高スコアの戦略で実行
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { Hyperliquid } from 'hyperliquid';

const API_URL = 'https://api.hyperliquid.xyz/info';
const ANALYSIS_PATH = 'C:/clawd/memory/hyperliquid/strategy-analysis.json';
const STATE_PATH = 'C:/clawd/memory/hyperliquid/multi-bot-state.json';
const TRADES_PATH = 'C:/clawd/memory/hyperliquid/trades-multi-strategy.md';

// ===== Configuration =====
const CONFIG = {
  accountIndex: 0,      // Which Hyperliquid account to use
  coin: 'BTC',
  interval: '5m',       // Default interval
  minConfidence: 0.6,   // Minimum confidence to execute (60%)
  maxPositionSize: 0.005, // Max position in BTC
  riskPerTrade: 0.02,   // Risk 2% of account per trade
  confluenceBonus: 0.15, // Bonus for each additional agreeing strategy
};

// ===== Strategy Definitions =====
const STRATEGIES = {
  momentum: {
    name: 'momentum',
    regimeAffinity: 'trend', // Works better in trending markets
    check: (candles, params) => {
      const prices = candles.map(c => parseFloat(c.c));
      const window = params.momentumWindow || 5;
      if (prices.length < window + 1) return null;
      
      const current = prices[prices.length - 1];
      const past = prices[prices.length - 1 - window];
      const change = (current - past) / past;
      const threshold = params.momentumThreshold || 0.002;
      
      if (change < -threshold) return { signal: 'LONG', strength: Math.abs(change) / threshold };
      if (change > threshold) return { signal: 'SHORT', strength: Math.abs(change) / threshold };
      return null;
    }
  },
  
  maCross: {
    name: 'maCross',
    regimeAffinity: 'trend',
    check: (candles, params) => {
      const prices = candles.map(c => parseFloat(c.c));
      const fastPeriod = params.maFast || 9;
      const slowPeriod = params.maSlow || 21;
      
      if (prices.length < slowPeriod + 2) return null;
      
      const fast = prices.slice(-fastPeriod).reduce((a, b) => a + b, 0) / fastPeriod;
      const slow = prices.slice(-slowPeriod).reduce((a, b) => a + b, 0) / slowPeriod;
      const prevFast = prices.slice(-fastPeriod - 1, -1).reduce((a, b) => a + b, 0) / fastPeriod;
      const prevSlow = prices.slice(-slowPeriod - 1, -1).reduce((a, b) => a + b, 0) / slowPeriod;
      
      // Golden cross
      if (prevFast <= prevSlow && fast > slow) {
        return { signal: 'LONG', strength: (fast - slow) / slow * 100 };
      }
      // Death cross
      if (prevFast >= prevSlow && fast < slow) {
        return { signal: 'SHORT', strength: (slow - fast) / fast * 100 };
      }
      return null;
    }
  },
  
  rsi: {
    name: 'rsi',
    regimeAffinity: 'range',
    check: (candles, params) => {
      const prices = candles.map(c => parseFloat(c.c));
      const period = params.rsiPeriod || 14;
      
      if (prices.length < period + 1) return null;
      
      let gains = 0, losses = 0;
      for (let i = prices.length - period; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses += Math.abs(change);
      }
      
      const rsi = losses === 0 ? 100 : 100 - (100 / (1 + (gains / period) / (losses / period)));
      const oversold = params.rsiOversold || 30;
      const overbought = params.rsiOverbought || 70;
      
      if (rsi < oversold) return { signal: 'LONG', strength: (oversold - rsi) / oversold, rsi };
      if (rsi > overbought) return { signal: 'SHORT', strength: (rsi - overbought) / (100 - overbought), rsi };
      return null;
    }
  },
  
  rangeBounce: {
    name: 'rangeBounce',
    regimeAffinity: 'range',
    check: (candles, params) => {
      const highs = candles.map(c => parseFloat(c.h));
      const lows = candles.map(c => parseFloat(c.l));
      const prices = candles.map(c => parseFloat(c.c));
      const window = params.rangeWindow || 50;
      const bounceZone = params.rangeBounceZone || 0.15;
      
      if (candles.length < window) return null;
      
      const rangeHighs = highs.slice(-window);
      const rangeLows = lows.slice(-window);
      const rangeHigh = Math.max(...rangeHighs);
      const rangeLow = Math.min(...rangeLows);
      const rangeSize = rangeHigh - rangeLow;
      const price = prices[prices.length - 1];
      const prevPrice = prices[prices.length - 2];
      
      // Near support and bouncing up
      if (price < rangeLow + rangeSize * bounceZone && price > prevPrice) {
        return { signal: 'LONG', strength: 1 - (price - rangeLow) / (rangeSize * bounceZone), range: { high: rangeHigh, low: rangeLow } };
      }
      // Near resistance and bouncing down
      if (price > rangeHigh - rangeSize * bounceZone && price < prevPrice) {
        return { signal: 'SHORT', strength: 1 - (rangeHigh - price) / (rangeSize * bounceZone), range: { high: rangeHigh, low: rangeLow } };
      }
      return null;
    }
  },
  
  breakout: {
    name: 'breakout',
    regimeAffinity: 'trend',
    check: (candles, params) => {
      const highs = candles.map(c => parseFloat(c.h));
      const lows = candles.map(c => parseFloat(c.l));
      const prices = candles.map(c => parseFloat(c.c));
      const volumes = candles.map(c => parseFloat(c.v));
      const window = params.breakoutWindow || 20;
      
      if (candles.length < window + 1) return null;
      
      const recentHighs = highs.slice(-window - 1, -1);
      const recentLows = lows.slice(-window - 1, -1);
      const high = Math.max(...recentHighs);
      const low = Math.min(...recentLows);
      const price = prices[prices.length - 1];
      
      // Volume confirmation
      const avgVolume = volumes.slice(-window).reduce((a, b) => a + b, 0) / window;
      const currentVolume = volumes[volumes.length - 1];
      const volumeMultiple = currentVolume / avgVolume;
      
      // Breakout with volume
      if (price > high && volumeMultiple > 1.2) {
        return { signal: 'LONG', strength: volumeMultiple - 1, breakLevel: high };
      }
      if (price < low && volumeMultiple > 1.2) {
        return { signal: 'SHORT', strength: volumeMultiple - 1, breakLevel: low };
      }
      return null;
    }
  },
  
  pivotBounce: {
    name: 'pivotBounce',
    regimeAffinity: 'range',
    check: (candles, params) => {
      const highs = candles.map(c => parseFloat(c.h));
      const lows = candles.map(c => parseFloat(c.l));
      const prices = candles.map(c => parseFloat(c.c));
      const lookback = params.pivotLookback || 24;
      const touchPct = params.pivotTouchPct || 0.002;
      
      if (candles.length < lookback + 1) return null;
      
      const periodHighs = highs.slice(-lookback - 1, -1);
      const periodLows = lows.slice(-lookback - 1, -1);
      const periodCloses = prices.slice(-lookback - 1, -1);
      const H = Math.max(...periodHighs);
      const L = Math.min(...periodLows);
      const C = periodCloses[periodCloses.length - 1];
      
      const pivot = (H + L + C) / 3;
      const s1 = 2 * pivot - H;
      const r1 = 2 * pivot - L;
      
      const price = prices[prices.length - 1];
      const prevPrice = prices[prices.length - 2];
      
      // Near S1 support
      if (Math.abs(price - s1) / s1 < touchPct && price > prevPrice) {
        return { signal: 'LONG', strength: 1 - Math.abs(price - s1) / s1 / touchPct, pivot: { s1, r1, pivot } };
      }
      // Near R1 resistance
      if (Math.abs(price - r1) / r1 < touchPct && price < prevPrice) {
        return { signal: 'SHORT', strength: 1 - Math.abs(price - r1) / r1 / touchPct, pivot: { s1, r1, pivot } };
      }
      return null;
    }
  },
  
  rsiMomentum: {
    name: 'rsiMomentum',
    regimeAffinity: 'trend',
    check: (candles, params) => {
      const prices = candles.map(c => parseFloat(c.c));
      const period = params.rsiPeriod || 14;
      const window = params.momentumWindow || 5;
      
      if (prices.length < Math.max(period, window) + 1) return null;
      
      // Calculate RSI
      let gains = 0, losses = 0;
      for (let i = prices.length - period; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses += Math.abs(change);
      }
      const rsi = losses === 0 ? 100 : 100 - (100 / (1 + (gains / period) / (losses / period)));
      
      // Calculate momentum
      const current = prices[prices.length - 1];
      const past = prices[prices.length - 1 - window];
      const change = (current - past) / past;
      
      const oversold = params.rsiOversold || 30;
      const overbought = params.rsiOverbought || 70;
      const threshold = params.momentumThreshold || 0.002;
      
      // RSI oversold + negative momentum = LONG
      if (rsi < oversold && change < -threshold) {
        return { signal: 'LONG', strength: (oversold - rsi) / oversold + Math.abs(change) / threshold, rsi, momentum: change };
      }
      // RSI overbought + positive momentum = SHORT
      if (rsi > overbought && change > threshold) {
        return { signal: 'SHORT', strength: (rsi - overbought) / (100 - overbought) + change / threshold, rsi, momentum: change };
      }
      return null;
    }
  },
  
  swingPoint: {
    name: 'swingPoint',
    regimeAffinity: 'range',
    check: (candles, params) => {
      const highs = candles.map(c => parseFloat(c.h));
      const lows = candles.map(c => parseFloat(c.l));
      const prices = candles.map(c => parseFloat(c.c));
      const lookback = params.swingLookback || 5;
      const threshold = params.swingBounceThreshold || 0.003;
      
      if (candles.length < lookback * 3 + 1) return null;
      
      const price = prices[prices.length - 1];
      const prevPrice = prices[prices.length - 2];
      
      // Find swing lows and highs
      let swingLows = [], swingHighs = [];
      for (let j = candles.length - lookback * 3; j < candles.length - lookback; j++) {
        if (j < lookback) continue;
        const leftLows = lows.slice(j - lookback, j);
        const rightLows = lows.slice(j + 1, j + lookback + 1);
        if (rightLows.length > 0 && lows[j] < Math.min(...leftLows) && lows[j] < Math.min(...rightLows)) {
          swingLows.push(lows[j]);
        }
        const leftHighs = highs.slice(j - lookback, j);
        const rightHighs = highs.slice(j + 1, j + lookback + 1);
        if (rightHighs.length > 0 && highs[j] > Math.max(...leftHighs) && highs[j] > Math.max(...rightHighs)) {
          swingHighs.push(highs[j]);
        }
      }
      
      // Check for bounce at swing point
      if (swingLows.length > 0) {
        const nearestLow = swingLows[swingLows.length - 1];
        if (Math.abs(price - nearestLow) / nearestLow < threshold && price > prevPrice) {
          return { signal: 'LONG', strength: 1 - Math.abs(price - nearestLow) / nearestLow / threshold, swingLow: nearestLow };
        }
      }
      if (swingHighs.length > 0) {
        const nearestHigh = swingHighs[swingHighs.length - 1];
        if (Math.abs(price - nearestHigh) / nearestHigh < threshold && price < prevPrice) {
          return { signal: 'SHORT', strength: 1 - Math.abs(price - nearestHigh) / nearestHigh / threshold, swingHigh: nearestHigh };
        }
      }
      return null;
    }
  },
  
  returnMove: {
    name: 'returnMove',
    regimeAffinity: 'trend',
    check: (candles, params) => {
      const highs = candles.map(c => parseFloat(c.h));
      const lows = candles.map(c => parseFloat(c.l));
      const prices = candles.map(c => parseFloat(c.c));
      const window = params.returnMoveWindow || 20;
      const retestBars = params.returnMoveRetestBars || 5;
      const touchPct = params.returnMoveTouchPct || 0.005;
      
      if (candles.length < window + retestBars + 1) return null;
      
      const price = prices[prices.length - 1];
      const prevPrice = prices[prices.length - 2];
      
      // Find breakout levels
      const lookbackHighs = highs.slice(-window - retestBars - 1, -retestBars - 1);
      const lookbackLows = lows.slice(-window - retestBars - 1, -retestBars - 1);
      const breakoutHigh = Math.max(...lookbackHighs);
      const breakoutLow = Math.min(...lookbackLows);
      
      // Check for recent breakout
      const maxRecentHigh = Math.max(...highs.slice(-retestBars - 1));
      const minRecentLow = Math.min(...lows.slice(-retestBars - 1));
      
      // Breakout above high, now retesting = LONG
      if (maxRecentHigh > breakoutHigh * 1.001 && 
          price >= breakoutHigh * (1 - touchPct) && price <= breakoutHigh * (1 + touchPct) &&
          price > prevPrice) {
        return { signal: 'LONG', strength: 1 - Math.abs(price - breakoutHigh) / breakoutHigh / touchPct, breakLevel: breakoutHigh };
      }
      // Breakdown below low, now retesting = SHORT
      if (minRecentLow < breakoutLow * 0.999 &&
          price >= breakoutLow * (1 - touchPct) && price <= breakoutLow * (1 + touchPct) &&
          price < prevPrice) {
        return { signal: 'SHORT', strength: 1 - Math.abs(price - breakoutLow) / breakoutLow / touchPct, breakLevel: breakoutLow };
      }
      return null;
    }
  }
};

// ===== Market Regime Detection =====
function detectRegime(candles) {
  const prices = candles.map(c => parseFloat(c.c));
  const highs = candles.map(c => parseFloat(c.h));
  const lows = candles.map(c => parseFloat(c.l));
  
  if (prices.length < 50) return { trend: 50, range: 50 };
  
  // ADX-like calculation (simplified)
  let plusDM = 0, minusDM = 0, tr = 0;
  for (let i = prices.length - 14; i < prices.length; i++) {
    const highDiff = highs[i] - highs[i - 1];
    const lowDiff = lows[i - 1] - lows[i];
    
    if (highDiff > lowDiff && highDiff > 0) plusDM += highDiff;
    if (lowDiff > highDiff && lowDiff > 0) minusDM += lowDiff;
    
    tr += Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - prices[i - 1]),
      Math.abs(lows[i] - prices[i - 1])
    );
  }
  
  const plusDI = (plusDM / tr) * 100;
  const minusDI = (minusDM / tr) * 100;
  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
  
  // Bollinger Band width (volatility)
  const sma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const variance = prices.slice(-20).reduce((sum, p) => sum + Math.pow(p - sma20, 2), 0) / 20;
  const stdDev = Math.sqrt(variance);
  const bbWidth = (stdDev * 2) / sma20 * 100;
  
  // Combine signals
  // High DX = trending, High BB width = volatile (could be trend or volatility)
  const trendScore = Math.min(100, dx * 2);
  const rangeScore = Math.max(0, 100 - trendScore);
  
  return {
    trend: trendScore,
    range: rangeScore,
    dx,
    bbWidth,
    direction: plusDI > minusDI ? 'up' : 'down'
  };
}

// ===== Signal Generation =====
function generateSignals(candles, recommendedStrategies, regime) {
  const signals = [];
  
  for (const rec of recommendedStrategies) {
    const strategy = STRATEGIES[rec.strategy];
    if (!strategy) continue;
    
    const result = strategy.check(candles, rec.params);
    if (!result) continue;
    
    // Calculate confidence based on:
    // 1. Strategy strength
    // 2. Regime affinity
    // 3. Historical win rate
    let confidence = Math.min(1, result.strength);
    
    // Regime affinity bonus/penalty
    if (strategy.regimeAffinity === 'trend' && regime.trend > 60) {
      confidence *= 1.2;
    } else if (strategy.regimeAffinity === 'range' && regime.range > 60) {
      confidence *= 1.2;
    } else if (strategy.regimeAffinity === 'trend' && regime.range > 70) {
      confidence *= 0.7; // Trend strategy in range market
    } else if (strategy.regimeAffinity === 'range' && regime.trend > 70) {
      confidence *= 0.7; // Range strategy in trending market
    }
    
    // Historical performance bonus
    if (rec.expectedPnl > 50) confidence *= 1.1;
    if (rec.expectedPnl > 100) confidence *= 1.1;
    
    signals.push({
      strategy: strategy.name,
      signal: result.signal,
      confidence: Math.min(1, confidence),
      details: result,
      params: rec.params
    });
  }
  
  return signals;
}

// ===== Confluence Check =====
function checkConfluence(signals) {
  if (signals.length === 0) return null;
  
  // Group by signal direction
  const longSignals = signals.filter(s => s.signal === 'LONG');
  const shortSignals = signals.filter(s => s.signal === 'SHORT');
  
  // Calculate confluence
  let bestGroup = longSignals.length >= shortSignals.length ? longSignals : shortSignals;
  if (bestGroup.length === 0) return null;
  
  // Confluence bonus: more strategies agreeing = higher confidence
  const confluenceBonus = CONFIG.confluenceBonus * (bestGroup.length - 1);
  
  // Average confidence with bonus
  const baseConfidence = bestGroup.reduce((sum, s) => sum + s.confidence, 0) / bestGroup.length;
  const finalConfidence = Math.min(1, baseConfidence + confluenceBonus);
  
  // Best signal is the one with highest individual confidence
  bestGroup.sort((a, b) => b.confidence - a.confidence);
  
  return {
    signal: bestGroup[0].signal,
    confidence: finalConfidence,
    primaryStrategy: bestGroup[0].strategy,
    agreeing: bestGroup.map(s => s.strategy),
    allSignals: signals
  };
}

// ===== Fetch Candles =====
async function fetchCandles(coin, interval, count = 100) {
  const now = Date.now();
  const intervalMs = {
    '1m': 60000,
    '5m': 300000,
    '15m': 900000,
    '1h': 3600000
  };
  const startTime = now - (count * intervalMs[interval]);
  
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'candleSnapshot',
      req: { coin, interval, startTime, endTime: now }
    })
  });
  
  return await response.json();
}

// ===== Load State =====
function loadState() {
  if (existsSync(STATE_PATH)) {
    try {
      return JSON.parse(readFileSync(STATE_PATH));
    } catch (e) {}
  }
  return { position: null, lastSignal: null, trades: [] };
}

// ===== Save State =====
function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// ===== Load Strategy Analysis =====
function loadStrategyAnalysis() {
  if (!existsSync(ANALYSIS_PATH)) {
    console.log('No strategy analysis found. Run backtest-explorer first.');
    return null;
  }
  return JSON.parse(readFileSync(ANALYSIS_PATH));
}

// ===== Log Trade =====
function logTrade(action, details) {
  const timestamp = new Date().toISOString();
  const line = `| ${timestamp} | ${action} | ${details.strategy} | ${details.signal} | ${details.confidence.toFixed(2)} | ${details.price} | ${details.agreeing?.join(', ') || '-'} |\n`;
  
  if (!existsSync(TRADES_PATH)) {
    const header = `# Multi-Strategy Bot Trades\n\n| Time | Action | Strategy | Signal | Confidence | Price | Confluence |\n|------|--------|----------|--------|------------|-------|------------|\n`;
    writeFileSync(TRADES_PATH, header);
  }
  
  const content = readFileSync(TRADES_PATH, 'utf8');
  writeFileSync(TRADES_PATH, content + line);
}

// ===== Main =====
async function main() {
  const args = process.argv.slice(2);
  const interval = args[0] || CONFIG.interval;
  const dryRun = args.includes('--dry-run');
  
  console.log(`\n🤖 Multi-Strategy Bot`);
  console.log(`   Interval: ${interval}`);
  console.log(`   Dry Run: ${dryRun}`);
  console.log('');
  
  // Load strategy analysis
  const analysis = loadStrategyAnalysis();
  if (!analysis) return;
  
  const recommended = analysis.recommended[interval];
  if (!recommended || recommended.length === 0) {
    console.log(`No recommended strategies for ${interval}`);
    return;
  }
  
  console.log(`📊 Recommended strategies for ${interval}:`);
  recommended.forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.strategy} (expected: ${r.expectedPnl?.toFixed(2) || 'N/A'}%)`);
  });
  
  // Fetch candles
  console.log(`\n📈 Fetching ${interval} candles...`);
  const candles = await fetchCandles(CONFIG.coin, interval, 100);
  if (!candles || candles.length < 50) {
    console.log('Insufficient candle data');
    return;
  }
  
  const currentPrice = parseFloat(candles[candles.length - 1].c);
  console.log(`   Current BTC: $${currentPrice.toLocaleString()}`);
  
  // Detect market regime
  const regime = detectRegime(candles);
  console.log(`\n🎯 Market Regime:`);
  console.log(`   Trend: ${regime.trend.toFixed(0)}% (${regime.direction})`);
  console.log(`   Range: ${regime.range.toFixed(0)}%`);
  console.log(`   DX: ${regime.dx?.toFixed(1)}, BB Width: ${regime.bbWidth?.toFixed(2)}%`);
  
  // Generate signals from all strategies
  console.log(`\n🔍 Checking strategies...`);
  const signals = generateSignals(candles, recommended, regime);
  
  if (signals.length === 0) {
    console.log('   No signals generated');
    return;
  }
  
  signals.forEach(s => {
    console.log(`   ${s.strategy}: ${s.signal} (conf: ${(s.confidence * 100).toFixed(0)}%)`);
  });
  
  // Check confluence
  const confluence = checkConfluence(signals);
  if (!confluence) {
    console.log('\n❌ No valid signal after confluence check');
    return;
  }
  
  console.log(`\n🎯 Confluence Result:`);
  console.log(`   Signal: ${confluence.signal}`);
  console.log(`   Confidence: ${(confluence.confidence * 100).toFixed(0)}%`);
  console.log(`   Primary: ${confluence.primaryStrategy}`);
  console.log(`   Agreeing: ${confluence.agreeing.join(', ')}`);
  
  // Check minimum confidence
  if (confluence.confidence < CONFIG.minConfidence) {
    console.log(`\n⚠️ Confidence below threshold (${CONFIG.minConfidence * 100}%)`);
    return;
  }
  
  // Load state
  const state = loadState();
  
  // Check if already in position
  if (state.position) {
    console.log(`\n📌 Already in position: ${state.position.signal} @ $${state.position.entry}`);
    
    // Check for reverse signal
    if (state.position.signal !== confluence.signal) {
      console.log(`   🔄 Opposite signal detected - consider closing`);
    }
    return;
  }
  
  // Execute trade
  console.log(`\n✅ Signal confirmed - executing ${confluence.signal}...`);
  
  if (dryRun) {
    console.log('   [DRY RUN] Would execute trade');
    console.log(`   Entry: $${currentPrice}`);
    console.log(`   Strategy: ${confluence.primaryStrategy}`);
  } else {
    // TODO: Implement actual execution via executor.js
    console.log('   [LIVE] Trade execution not yet implemented');
    console.log('   Run executor.js market_open BTC <size> <isLong>');
  }
  
  // Log trade
  logTrade('SIGNAL', {
    strategy: confluence.primaryStrategy,
    signal: confluence.signal,
    confidence: confluence.confidence,
    price: currentPrice,
    agreeing: confluence.agreeing
  });
  
  // Update state
  state.lastSignal = {
    signal: confluence.signal,
    confidence: confluence.confidence,
    strategy: confluence.primaryStrategy,
    price: currentPrice,
    timestamp: new Date().toISOString()
  };
  saveState(state);
  
  console.log('\n✨ Done');
}

main().catch(console.error);
