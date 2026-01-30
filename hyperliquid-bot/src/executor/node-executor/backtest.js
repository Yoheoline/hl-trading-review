/**
 * Hyperliquid Backtesting Script
 */
import { writeFileSync } from 'fs';

const API = 'https://api.hyperliquid.xyz/info';

async function fetchCandles(coin, days) {
  const now = Date.now();
  const startTime = now - (days * 24 * 60 * 60 * 1000);
  console.log('Fetching ' + days + ' days of candles for ' + coin + '...');
  
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval: '1m', startTime, endTime: now } })
  });
  
  const candles = await response.json();
  console.log('Fetched ' + candles.length + ' candles');
  return candles.map(c => ({ time: c.t, open: +c.o, high: +c.h, low: +c.l, close: +c.c, volume: +c.v }));
}

function calculateRSI(prices, period) {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change; else losses -= change;
  }
  const avgGain = gains / period, avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function calculateSMA(prices, period) {
  if (prices.length < period) return prices[prices.length - 1];
  return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function momentumSignal(candles, i, params) {
  if (i < params.windowMinutes) return null;
  const change = (candles[i].close - candles[i - params.windowMinutes].close) / candles[i - params.windowMinutes].close;
  if (change < -params.threshold) return 'long';
  if (change > params.threshold) return 'short';
  return null;
}

function breakoutSignal(candles, i, params) {
  if (i < params.windowMinutes) return null;
  const price = candles[i].close;
  let high = 0, low = Infinity;
  for (let j = i - params.windowMinutes; j < i; j++) { high = Math.max(high, candles[j].high); low = Math.min(low, candles[j].low); }
  if (price > high) return 'long';
  if (price < low) return 'short';
  return null;
}

function rsiSignal(candles, i, params) {
  if (i < params.period + 1) return null;
  const prices = candles.slice(0, i + 1).map(c => c.close);
  const rsi = calculateRSI(prices, params.period);
  if (rsi < params.oversold) return 'long';
  if (rsi > params.overbought) return 'short';
  return null;
}

function runBacktest(candles, name, fn, params, risk) {
  let position = null, trades = [], lastTrade = 0;
  for (let i = 0; i < candles.length; i++) {
    const price = candles[i].close;
    if (position) {
      const hold = i - position.idx;
      const pnl = position.long ? (price - position.entry) / position.entry : (position.entry - price) / position.entry;
      let exit = null;
      if (pnl >= risk.tp) exit = 'TP';
      else if (pnl <= -risk.sl) exit = 'SL';
      else if (hold >= risk.maxHold) exit = 'TIMEOUT';
      if (exit) { trades.push({ pnl, exit }); position = null; lastTrade = i; }
    }
    if (!position && (i - lastTrade) >= risk.cooldown) {
      const sig = fn(candles, i, params);
      if (sig) position = { entry: price, long: sig === 'long', idx: i };
    }
  }
  const wins = trades.filter(t => t.pnl > 0).length;
  const total = trades.reduce((s, t) => s + t.pnl, 0) * 100;
  return { name, params, risk, trades: trades.length, wins, winRate: trades.length ? (wins / trades.length * 100).toFixed(1) : '0', totalPnl: total.toFixed(2) };
}

async function main() {
  const days = parseInt(process.argv.find(a => a.startsWith('--days='))?.split('=')[1] || '7');
  console.log('Hyperliquid Backtesting');
  const candles = await fetchCandles('BTC', days);
  
  const risks = [
    { tp: 0.003, sl: 0.0015, maxHold: 30, cooldown: 2 },
    { tp: 0.005, sl: 0.0025, maxHold: 60, cooldown: 3 },
  ];
  
  const strats = [
    { name: 'Momentum', fn: momentumSignal, params: [{ windowMinutes: 5, threshold: 0.0005 }, { windowMinutes: 10, threshold: 0.001 }] },
    { name: 'Breakout', fn: breakoutSignal, params: [{ windowMinutes: 5 }, { windowMinutes: 10 }] },
    { name: 'RSI', fn: rsiSignal, params: [{ period: 14, oversold: 30, overbought: 70 }] },
  ];
  
  const results = [];
  for (const s of strats) for (const p of s.params) for (const r of risks) results.push(runBacktest(candles, s.name, s.fn, p, r));
  results.sort((a, b) => b.totalPnl - a.totalPnl);
  
  console.log('\nTOP STRATEGIES:');
  console.log('Strategy | Params | WinRate | Trades | PnL%');
  for (let i = 0; i < Math.min(10, results.length); i++) {
    const r = results[i];
    console.log(r.name + ' | ' + JSON.stringify(r.params) + ' | ' + r.winRate + '% | ' + r.trades + ' | ' + r.totalPnl + '%');
  }
  writeFileSync('./backtest-results.json', JSON.stringify(results, null, 2));
  console.log('\nSaved to backtest-results.json');
}
main();
