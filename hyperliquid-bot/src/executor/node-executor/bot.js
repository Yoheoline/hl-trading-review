/**
 * Hyperliquid Trading Bot v6
 * Features: Multi-timeframe, Multi-strategy, PAPER/LIVE mode, Robust TP/SL
 */
import { Hyperliquid } from 'hyperliquid';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const args = process.argv.slice(2);
const strategyArg = args.find(a => a.startsWith('--strategy='));
const STRATEGY_FILE = strategyArg ? strategyArg.split('=')[1] : 'strategy.json';
const BOT_NAME = STRATEGY_FILE.replace('.json', '');

const STRATEGY_PATH_INIT = resolve(__dirname, STRATEGY_FILE);
const strategyInit = JSON.parse(readFileSync(STRATEGY_PATH_INIT, 'utf8'));
const ACCOUNT_NUM = strategyInit.account || 1;

const PRIVATE_KEY = process.env[`HYPERLIQUID_SECRET_${ACCOUNT_NUM}`] || process.env.HYPERLIQUID_API_SECRET;
const WALLET_ADDRESS = process.env[`HYPERLIQUID_WALLET_${ACCOUNT_NUM}`] || process.env.HYPERLIQUID_WALLET_ADDRESS;

const STRATEGY_PATH = resolve(__dirname, STRATEGY_FILE);
const CLAWD_PATH = 'C:/clawd';
const TRADES_PATH = `${CLAWD_PATH}/memory/hyperliquid/trades-${BOT_NAME}.md`;
const STATE_PATH = resolve(__dirname, `state-${BOT_NAME}.json`);

let sdk;
let priceHistory = [];
let state = { inPosition: false, entryPrice: 0, isLong: true, entryTime: null, entries: [] };
let consecutiveErrors = 0;
const MAX_ERRORS = 10;

function loadState() {
  if (existsSync(STATE_PATH)) {
    try { state = JSON.parse(readFileSync(STATE_PATH, 'utf8')); } catch (e) {}
  }
}

function saveState() {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function loadStrategy() {
  try {
    return JSON.parse(readFileSync(STRATEGY_PATH, 'utf8'));
  } catch (e) {
    console.error(`[${BOT_NAME}] Failed to load strategy:`, e.message);
    process.exit(1);
  }
}

function logTrade(action, details, strategy) {
  const timestamp = new Date().toISOString();
  const mode = strategy.mode || 'LIVE';
  const line = `| ${timestamp} | ${mode} | ${action} | ${details.coin} | ${details.size} | ${details.price} | ${details.pnl || '-'} | ${details.reason} |\n`;
  try {
    if (!existsSync(TRADES_PATH)) {
      appendFileSync(TRADES_PATH, `# Trade Log - ${BOT_NAME}\n\n| Time | Mode | Action | Coin | Size | Price | PnL | Reason |\n|------|------|--------|------|------|-------|-----|--------|\n`);
    }
    appendFileSync(TRADES_PATH, line);
  } catch (e) {
    console.error(`[${BOT_NAME}] Failed to write trade log:`, e.message);
  }
  console.log(`[${BOT_NAME}] [${mode}] ${action}`, details);
}

// Retry wrapper for API calls
async function withRetry(fn, maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      console.log(`[${BOT_NAME}] Retry ${i + 1}/${maxRetries}: ${e.message}`);
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
}

async function getPrice(coin) {
  return withRetry(async () => {
    const mids = await sdk.info.getAllMids();
    return parseFloat(mids[coin] || mids[coin + '-PERP']);
  });
}

async function getPosition(coin) {
  return withRetry(async () => {
    const clearinghouse = await sdk.info.perpetuals.getClearinghouseState(WALLET_ADDRESS);
    const pos = clearinghouse.assetPositions.find(p => p.position.coin === coin || p.position.coin === coin + '-PERP');
    return pos ? parseFloat(pos.position.szi) : 0;
  });
}

async function getBalance() {
  return withRetry(async () => {
    const clearinghouse = await sdk.info.perpetuals.getClearinghouseState(WALLET_ADDRESS);
    return parseFloat(clearinghouse.marginSummary?.accountValue || 0);
  });
}

function calculatePositionSize(balance, currentPrice, stopLossPct, riskPerTrade = 0.05) {
  // Risk amount = Balance × Risk percentage
  const riskAmount = balance * riskPerTrade;
  // SL width in dollars per unit
  const slWidthPerUnit = currentPrice * stopLossPct;
  // Position size = Risk amount / SL width
  const size = riskAmount / slWidthPerUnit;
  // Round to 5 decimal places (BTC minimum)
  return Math.floor(size * 100000) / 100000;
}


async function loadHistoricalPrices(coin, windowMinutes, interval = '1m') {
  try {
    const now = Date.now();
    const startTime = now - (windowMinutes * 60 * 1000);
    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval, startTime, endTime: now } })
    });
    const candles = await response.json();
    if (candles && candles.length > 0) {
      priceHistory = candles.map(c => ({ time: c.t, price: parseFloat(c.c), high: parseFloat(c.h), low: parseFloat(c.l) }));
      console.log(`[${BOT_NAME}] Loaded ${priceHistory.length} ${interval} candles`);
    }
  } catch (e) {
    console.log(`[${BOT_NAME}] Failed to load history:`, e.message);
  }
}

// Place TP/SL with retry and verification

async function cancelTPSL(coin) {
  try {
    const openOrders = await sdk.info.getUserOpenOrders(WALLET_ADDRESS);
    const tpslOrders = openOrders.filter(o => o.coin === coin || o.coin === coin + '-PERP');
    for (const order of tpslOrders) {
      await sdk.exchange.cancelOrder({ coin: order.coin, o: order.oid });
      console.log(`[${BOT_NAME}] Cancelled order ${order.oid}`);
    }
  } catch (e) {
    console.error(`[${BOT_NAME}] Cancel TP/SL error:`, e.message);
  }
}

async function placeTPSL(coin, size, isLong, tpPrice, slPrice) {
  const perpCoin = coin.includes('-') ? coin : coin + '-PERP';
  const tpPriceRounded = Math.round(tpPrice);
  const slPriceRounded = Math.round(slPrice);
  
  let tpSuccess = false;
  let slSuccess = false;
  
  // Place TP order with retry
  for (let i = 0; i < 3; i++) {
    try {
      const tpOrder = {
        coin: perpCoin,
        is_buy: !isLong,
        sz: size,
        limit_px: tpPriceRounded,
        order_type: { trigger: { triggerPx: tpPriceRounded, isMarket: true, tpsl: 'tp' } },
        reduce_only: true
      };
      const result = await sdk.exchange.placeOrder(tpOrder);
      if (result?.status === 'ok') {
        console.log(`[${BOT_NAME}] ✅ TP set @ ${tpPriceRounded}`);
        tpSuccess = true;
        break;
      }
    } catch (e) {
      console.error(`[${BOT_NAME}] TP attempt ${i + 1} failed:`, e.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  // Place SL order with retry
  for (let i = 0; i < 3; i++) {
    try {
      const slOrder = {
        coin: perpCoin,
        is_buy: !isLong,
        sz: size,
        limit_px: slPriceRounded,
        order_type: { trigger: { triggerPx: slPriceRounded, isMarket: true, tpsl: 'sl' } },
        reduce_only: true
      };
      const result = await sdk.exchange.placeOrder(slOrder);
      if (result?.status === 'ok') {
        console.log(`[${BOT_NAME}] ✅ SL set @ ${slPriceRounded}`);
        slSuccess = true;
        break;
      }
    } catch (e) {
      console.error(`[${BOT_NAME}] SL attempt ${i + 1} failed:`, e.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  if (!tpSuccess || !slSuccess) {
    console.error(`[${BOT_NAME}] ⚠️ TP/SL incomplete! TP:${tpSuccess} SL:${slSuccess}`);
  }
  
  return { tpSuccess, slSuccess };
}


async function openPositionNoPTSL(coin, size, isLong, price, reason, strategy) {
  if (strategy.mode === 'PAPER') {
    logTrade('PYRAMID', { coin, size, price, reason }, strategy);
    return { paper: true };
  }
  
  try {
    const result = await withRetry(() => sdk.custom.marketOpen(coin, isLong, size, null, 0.01));
    console.log(`[${BOT_NAME}] Pyramid added: ${isLong ? 'LONG' : 'SHORT'} ${size} @ ${price}`);
    logTrade('PYRAMID', { coin, size, price, reason }, strategy);
    return result;
  } catch (e) {
    console.error(`[${BOT_NAME}] Pyramid Error:`, e.message);
    return null;
  }
}

async function openPosition(coin, size, isLong, price, reason, strategy) {
  const tpPrice = isLong ? price * (1 + strategy.takeProfitPct) : price * (1 - strategy.takeProfitPct);
  const slPrice = isLong ? price * (1 - strategy.stopLossPct) : price * (1 + strategy.stopLossPct);
  
  if (strategy.mode === 'PAPER') {
    state = { inPosition: true, entryPrice: price, isLong, entryTime: Date.now(), tpPrice, slPrice };
    saveState();
    logTrade('OPEN', { coin, size, price, reason: `${reason} | TP:${tpPrice.toFixed(0)} SL:${slPrice.toFixed(0)}` }, strategy);
    return { paper: true };
  }
  
  try {
    // Open position
    const result = await withRetry(() => sdk.custom.marketOpen(coin, isLong, size, null, 0.01));
    console.log(`[${BOT_NAME}] Position opened: ${isLong ? 'LONG' : 'SHORT'} ${size} @ ${price}`);
    
    // Wait a moment for position to settle
    await new Promise(r => setTimeout(r, 500));
    
    // Place TP/SL
    const tpslResult = await placeTPSL(coin, size, isLong, tpPrice, slPrice);
    
    state = { inPosition: true, entryPrice: price, isLong, entryTime: Date.now(), tpSet: tpslResult.tpSuccess, slSet: tpslResult.slSuccess };
    saveState();
    logTrade('OPEN', { coin, size, price, reason: `${reason} | TP:${Math.round(tpPrice)} SL:${Math.round(slPrice)} (TP:${tpslResult.tpSuccess} SL:${tpslResult.slSuccess})` }, strategy);
    return result;
  } catch (e) {
    console.error(`[${BOT_NAME}] Open Error:`, e.message);
    return null;
  }
}

async function closePosition(coin, reason, currentPrice, strategy) {
  const pnl = state.isLong 
    ? ((currentPrice - state.entryPrice) / state.entryPrice * 100).toFixed(3)
    : ((state.entryPrice - currentPrice) / state.entryPrice * 100).toFixed(3);
  
  if (strategy.mode === 'PAPER') {
    logTrade('CLOSE', { coin, size: '-', price: currentPrice, pnl: pnl + '%', reason }, strategy);
    state = { inPosition: false, entryPrice: 0, isLong: true, entryTime: null };
    saveState();
    return { paper: true };
  }
  
  try {
    try { await sdk.custom.cancelAllOrders(coin); } catch (e) {}
    const result = await withRetry(() => sdk.custom.marketClose(coin, null, 0.01));
    logTrade('CLOSE', { coin, size: '-', price: currentPrice, pnl: pnl + '%', reason }, strategy);
    state = { inPosition: false, entryPrice: 0, isLong: true, entryTime: null };
    saveState();
    return result;
  } catch (e) {
    console.error(`[${BOT_NAME}] Close Error:`, e.message);
    return null;
  }
}

// Indicators
function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  if (losses === 0) return 100;
  return 100 - (100 / (1 + (gains / period) / (losses / period)));
}

function calculateSMA(prices, period) {
  if (prices.length < period) return null;
  return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function checkRSISignal(strategy, prices) {
  if (!strategy.signals?.rsi && !strategy.signals?.rsiMomentum) return null;
  const rsi = calculateRSI(prices, strategy.rsiPeriod || 14);
  if (rsi === null) return null;
  if (rsi < (strategy.rsiOversold || 30)) return { signal: 'LONG', reason: 'RSI: ' + rsi.toFixed(1) };
  if (rsi > (strategy.rsiOverbought || 70)) return { signal: 'SHORT', reason: 'RSI: ' + rsi.toFixed(1) };
  return null;
}

function checkMomentumSignal(strategy, currentPrice) {
  if (strategy.signals?.momentum === false && !strategy.signals?.rsiMomentum) return null;
  const windowMs = (strategy.priceWindowMinutes || 5) * 60 * 1000;
  const now = Date.now();
  const recentPrices = priceHistory.filter(p => now - p.time < windowMs);
  if (recentPrices.length < 3) return null;
  const priceChange = (currentPrice - recentPrices[0].price) / recentPrices[0].price;
  const threshold = strategy.entryThreshold || 0.003;
  if (priceChange < -threshold) return { signal: 'LONG', reason: `Mom: ${(priceChange*100).toFixed(2)}%` };
  if (priceChange > threshold) return { signal: 'SHORT', reason: `Mom: ${(priceChange*100).toFixed(2)}%` };
  return null;
}

function checkMACrossSignal(strategy, prices) {
  if (!strategy.signals?.maCross) return null;
  const fast = strategy.maFast || 5;
  const slow = strategy.maSlow || 20;
  if (prices.length < slow + 1) return null;
  const fastMA = calculateSMA(prices, fast);
  const slowMA = calculateSMA(prices, slow);
  const prevFast = calculateSMA(prices.slice(0, -1), fast);
  const prevSlow = calculateSMA(prices.slice(0, -1), slow);
  if (prevFast <= prevSlow && fastMA > slowMA) return { signal: 'LONG', reason: `MA: ${fast}>${slow}` };
  if (prevFast >= prevSlow && fastMA < slowMA) return { signal: 'SHORT', reason: `MA: ${fast}<${slow}` };
  return null;
}

function checkRangeBounceSignal(strategy) {
  if (!strategy.signals?.rangeBounce) return null;
  const window = strategy.rangeWindow || 50;
  const bounceZone = strategy.rangeBounceZone || 0.15;
  
  if (priceHistory.length < window + 1) return null;
  
  const recentHistory = priceHistory.slice(-window - 1);
  const prices = recentHistory.map(p => p.price);
  const highs = recentHistory.map(p => p.high);
  const lows = recentHistory.map(p => p.low);
  
  const rangeHigh = Math.max(...highs.slice(0, -1));
  const rangeLow = Math.min(...lows.slice(0, -1));
  const rangeSize = rangeHigh - rangeLow;
  
  const currentPrice = prices[prices.length - 1];
  const prevPrice = prices[prices.length - 2];
  
  // 下端ゾーンで反発 → LONG
  if (currentPrice < rangeLow + rangeSize * bounceZone && currentPrice > prevPrice) {
    return { signal: 'LONG', reason: `RangeBounce: near low ${rangeLow.toFixed(0)}` };
  }
  // 上端ゾーンで反落 → SHORT
  if (currentPrice > rangeHigh - rangeSize * bounceZone && currentPrice < prevPrice) {
    return { signal: 'SHORT', reason: `RangeBounce: near high ${rangeHigh.toFixed(0)}` };
  }
  return null;
}

function checkBreakoutSignal(strategy) {
  if (!strategy.signals?.breakout) return null;
  const window = strategy.breakoutWindow || 10;
  
  if (priceHistory.length < window + 1) return null;
  
  const recentHistory = priceHistory.slice(-window - 1);
  const highs = recentHistory.map(p => p.high);
  const lows = recentHistory.map(p => p.low);
  const currentPrice = recentHistory[recentHistory.length - 1].price;
  const prevPrice = recentHistory[recentHistory.length - 2].price;
  
  const rangeHigh = Math.max(...highs.slice(0, -1));
  const rangeLow = Math.min(...lows.slice(0, -1));
  
  if (currentPrice > rangeHigh && currentPrice > prevPrice) {
    return { signal: 'LONG', reason: `Breakout: above ${rangeHigh.toFixed(0)}` };
  }
  if (currentPrice < rangeLow && currentPrice < prevPrice) {
    return { signal: 'SHORT', reason: `Breakout: below ${rangeLow.toFixed(0)}` };
  }
  return null;
}

function checkReturnMoveSignal(strategy) {
  if (!strategy.signals?.returnMove) return null;
  const lookback = strategy.returnMoveLookback || 20;
  const threshold = strategy.returnMoveThreshold || 0.01;
  
  if (priceHistory.length < lookback + 1) return null;
  
  const prices = priceHistory.slice(-lookback - 1).map(p => p.price);
  const currentPrice = prices[prices.length - 1];
  const prevPrice = prices[prices.length - 2];
  
  const recentHigh = Math.max(...prices.slice(0, -1));
  const recentLow = Math.min(...prices.slice(0, -1));
  
  const returnFromHigh = (recentHigh - currentPrice) / recentHigh;
  const returnFromLow = (currentPrice - recentLow) / recentLow;
  
  if (returnFromHigh > threshold && currentPrice > prevPrice) {
    return { signal: 'LONG', reason: `ReturnMove: ${(returnFromHigh * 100).toFixed(1)}% from high` };
  }
  if (returnFromLow > threshold && currentPrice < prevPrice) {
    return { signal: 'SHORT', reason: `ReturnMove: ${(returnFromLow * 100).toFixed(1)}% from low` };
  }
  return null;
}

function checkSignals(strategy, currentPrice) {
  const prices = priceHistory.map(p => p.price);
  
  // RSI+Momentum combo (AND logic)
  if (strategy.signals?.rsiMomentum) {
    const rsi = checkRSISignal(strategy, prices);
    const momentum = checkMomentumSignal(strategy, currentPrice);
    if (rsi && momentum && rsi.signal === momentum.signal) {
      return { signal: rsi.signal, reason: `${rsi.reason} & ${momentum.reason}` };
    }
    return null;
  }
  
  // MA Cross
  if (strategy.signals?.maCross) {
    return checkMACrossSignal(strategy, prices);
  }
  
  // Range Bounce
    if (strategy.signals?.rangeBounce) {
      return checkRangeBounceSignal(strategy);
    }
    
    // Breakout
    if (strategy.signals?.breakout) {
      return checkBreakoutSignal(strategy);
    }
    
    // Return Move
    if (strategy.signals?.returnMove) {
      return checkReturnMoveSignal(strategy);
    }
    
    // Single signals
  const rsi = checkRSISignal(strategy, prices);
  if (rsi) return rsi;
  
  const momentum = checkMomentumSignal(strategy, currentPrice);
  if (momentum) return momentum;
  
  return null;
}

async function loop() {
  const strategy = loadStrategy();
  if (!strategy.enabled) return;
  
  const interval = strategy.interval || '1m';
  const intervalMs = interval === '1h' ? 3600000 : interval === '15m' ? 900000 : interval === '5m' ? 300000 : 60000;
  
  try {
    const price = await getPrice(strategy.coin);
    consecutiveErrors = 0; // Reset on success
    
    const now = Date.now();
    const maxWindow = Math.max(strategy.priceWindowMinutes || 5, (strategy.maSlow || 20) * 5) * 60 * 1000;
    priceHistory = priceHistory.filter(p => now - p.time < maxWindow);
    
    const lastCandle = priceHistory[priceHistory.length - 1];
    if (!lastCandle || now - lastCandle.time >= intervalMs * 0.8) {
      priceHistory.push({ time: now, price, high: price, low: price });
    }
    
    // PAPER mode position management
    if (strategy.mode === 'PAPER' && state.inPosition) {
      const pnlPct = state.isLong ? (price - state.entryPrice) / state.entryPrice : (state.entryPrice - price) / state.entryPrice;
      const holdingMinutes = (now - state.entryTime) / 60000;
      
      if (pnlPct >= strategy.takeProfitPct) await closePosition(strategy.coin, 'TAKE_PROFIT', price, strategy);
      else if (pnlPct <= -strategy.stopLossPct) await closePosition(strategy.coin, 'STOP_LOSS', price, strategy);
      else if (holdingMinutes > strategy.maxPositionMinutes) await closePosition(strategy.coin, 'TIMEOUT', price, strategy);
    }
    
    // LIVE mode - sync position state
    if (strategy.mode === 'LIVE') {
      const position = await getPosition(strategy.coin);
      if (Math.abs(position) > 0.00001 && !state.inPosition) {
        // Position exists but state says no - sync
        state = { inPosition: true, isLong: position > 0, entryPrice: price, entryTime: Date.now() };
        saveState();
        console.log(`[${BOT_NAME}] Synced existing position: ${position > 0 ? 'LONG' : 'SHORT'}`);
      } else if (Math.abs(position) < 0.00001 && state.inPosition) {
        // No position but state says yes - closed externally (TP/SL hit)
        console.log(`[${BOT_NAME}] Position closed externally (TP/SL triggered)`);
        state = { inPosition: false, entryPrice: 0, isLong: true, entryTime: null };
        saveState();
      }
      
      // Timeout check
      if (state.inPosition && state.entryTime && (now - state.entryTime) / 60000 > strategy.maxPositionMinutes) {
        await closePosition(strategy.coin, 'TIMEOUT', price, strategy);
      }
    }
    
    // Position mode handling (basic/doten/pyramid/full)
    const positionMode = strategy.positionMode || 'basic';
    const maxPyramid = strategy.maxPyramid || 3;
    
    // Check signals
    const signalResult = checkSignals(strategy, price);
    
    if (!state.inPosition) {
      // New entry
      if (signalResult) {
        let positionSize = strategy.size;
        if (strategy.riskPerTrade) {
          const balance = await getBalance();
          positionSize = calculatePositionSize(balance, price, strategy.stopLossPct, strategy.riskPerTrade);
          console.log(`[${BOT_NAME}] Calculated size: ${positionSize} (balance: ${balance.toFixed(2)}, risk: ${strategy.riskPerTrade * 100}%)`);
        }
        state.pyramidCount = 1;
        state.totalSize = positionSize;
        state.entries = [{ price, size: positionSize }];
        state.avgEntry = price;
        await openPosition(strategy.coin, positionSize, signalResult.signal === 'LONG', price, signalResult.reason, strategy);
      }
    } else if (signalResult && positionMode !== 'basic') {
      // Position exists and signal detected - check for doten/pyramid
      const isOpposite = (state.isLong && signalResult.signal === 'SHORT') || (!state.isLong && signalResult.signal === 'LONG');
      const isSame = (state.isLong && signalResult.signal === 'LONG') || (!state.isLong && signalResult.signal === 'SHORT');
      
      // Doten (reverse position)
      if (isOpposite && (positionMode === 'doten' || positionMode === 'full')) {
        console.log(`[${BOT_NAME}] 🔄 DOTEN: ${state.isLong ? 'LONG→SHORT' : 'SHORT→LONG'}`);
        // Close current position
        await closePosition(strategy.coin, 'DOTEN', price, strategy);
        // Open opposite position
        let positionSize = strategy.size;
        if (strategy.riskPerTrade) {
          const balance = await getBalance();
          positionSize = calculatePositionSize(balance, price, strategy.stopLossPct, strategy.riskPerTrade);
        }
        state.pyramidCount = 1;
        state.totalSize = positionSize;
        state.entries = [{ price, size: positionSize }];
        state.avgEntry = price;
        await openPosition(strategy.coin, positionSize, signalResult.signal === 'LONG', price, `DOTEN: ${signalResult.reason}`, strategy);
      }
      
      // Pyramid (add to position)
      if (isSame && (positionMode === 'pyramid' || positionMode === 'full')) {
        const currentPyramid = state.pyramidCount || 1;
        if (currentPyramid < maxPyramid) {
          console.log(`[${BOT_NAME}] 📈 PYRAMID: Adding to ${state.isLong ? 'LONG' : 'SHORT'} (${currentPyramid + 1}/${maxPyramid})`);
          let addSize = strategy.size;
          if (strategy.riskPerTrade) {
            const balance = await getBalance();
            addSize = calculatePositionSize(balance, price, strategy.stopLossPct, strategy.riskPerTrade);
          }
          // Add to position (same direction order adds to existing position on Hyperliquid)
          // First, cancel existing TP/SL orders
          await cancelTPSL(strategy.coin);
          
          // Add new entry to entries array
          if (!state.entries) state.entries = [{ price: state.entryPrice, size: state.totalSize || strategy.size }];
          state.entries.push({ price, size: addSize });
          
          // Calculate average entry price
          const totalSize = state.entries.reduce((sum, e) => sum + e.size, 0);
          const avgEntry = state.entries.reduce((sum, e) => sum + e.price * e.size, 0) / totalSize;
          
          // Place order
          await openPositionNoPTSL(strategy.coin, addSize, state.isLong, price, `PYRAMID ${currentPyramid + 1}: ${signalResult.reason}`, strategy);
          
          // Place new TP/SL based on average entry and total size
          const tpPrice = state.isLong ? avgEntry * (1 + strategy.takeProfitPct) : avgEntry * (1 - strategy.takeProfitPct);
          const slPrice = state.isLong ? avgEntry * (1 - strategy.stopLossPct) : avgEntry * (1 + strategy.stopLossPct);
          await placeTPSL(strategy.coin, totalSize, state.isLong, tpPrice, slPrice);
          
          state.pyramidCount = currentPyramid + 1;
          state.totalSize = totalSize;
          state.avgEntry = avgEntry;
          console.log(`[${BOT_NAME}] Pyramid ${state.pyramidCount}: avgEntry=${avgEntry.toFixed(2)}, totalSize=${totalSize}`);
          saveState();
        }
      }
    }
    
    console.log(`[${BOT_NAME}] ${interval} ${strategy.coin}: $${price.toFixed(2)} | ${state.inPosition ? (state.isLong ? 'LONG' : 'SHORT') : 'FLAT'} | ${strategy.mode}`);
    
  } catch (e) {
    consecutiveErrors++;
    console.error(`[${BOT_NAME}] Error (${consecutiveErrors}/${MAX_ERRORS}):`, e.message);
    
    if (consecutiveErrors >= MAX_ERRORS) {
      console.error(`[${BOT_NAME}] Too many errors, reconnecting...`);
      try {
        sdk.disconnect();
        await new Promise(r => setTimeout(r, 5000));
        sdk = new Hyperliquid({ privateKey: PRIVATE_KEY, walletAddress: WALLET_ADDRESS });
        await sdk.connect();
        consecutiveErrors = 0;
        console.log(`[${BOT_NAME}] Reconnected successfully`);
      } catch (reconnectError) {
        console.error(`[${BOT_NAME}] Reconnect failed:`, reconnectError.message);
      }
    }
  }
}

async function main() {
  const strategy = loadStrategy();
  const interval = strategy.interval || '1m';
  console.log(`[${BOT_NAME}] v6 Starting in ${strategy.mode} mode with ${interval} candles`);
  
  loadState();
  
  sdk = new Hyperliquid({ privateKey: PRIVATE_KEY, walletAddress: WALLET_ADDRESS });
  await sdk.connect();
  
  // Calculate maxWindow in minutes based on interval
  const intervalMinutes = interval === '1h' ? 60 : interval === '15m' ? 15 : interval === '5m' ? 5 : 1;
  const maxCandlesNeeded = Math.max(
    Math.ceil((strategy.priceWindowMinutes || 5) / intervalMinutes),
    (strategy.maSlow || 20) + 5,
    (strategy.rangeWindow || 0) + 5
  );
  const maxWindow = maxCandlesNeeded * intervalMinutes + 60; // extra buffer
  await loadHistoricalPrices(strategy.coin, maxWindow, interval);
  
  let checkMs = strategy.checkInterval || 60000;
  if (interval === '1h') checkMs = Math.max(checkMs, 60000);
  if (interval === '15m') checkMs = Math.max(checkMs, 30000);
  if (interval === '5m') checkMs = Math.max(checkMs, 15000);
  
  setInterval(loop, checkMs);
  loop();
}

main().catch(console.error);
