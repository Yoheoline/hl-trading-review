import { HyperliquidAPI } from './api.js';
const api = new HyperliquidAPI();

const candles = await api.getCandles('BTC', '5m', 30);
const recent = candles.slice(-15);
recent.forEach(c => {
  const d = new Date(c.t);
  console.log(d.toISOString().slice(11,16), 'O:', c.o, 'H:', c.h, 'L:', c.l, 'C:', c.c);
});

const closes = candles.map(c => parseFloat(c.c));
const last = closes[closes.length - 1];

// Momentum (window=2, threshold=0.002)
const prev2 = closes[closes.length - 3];
const momChange = (last - prev2) / prev2;
console.log('\n--- Momentum (window=2, thresh=0.002) ---');
console.log('Current:', last, 'Prev2:', prev2, 'Change:', (momChange * 100).toFixed(3) + '%');
if (momChange < -0.002) console.log('SIGNAL: LONG');
else if (momChange > 0.002) console.log('SIGNAL: SHORT');
else console.log('NO SIGNAL');

// RSI
function calcRSI(prices, period) {
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i-1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

const rsi7 = calcRSI(closes, 7);
const rsi14 = calcRSI(closes, 14);
console.log('\n--- RSI ---');
console.log('RSI(7):', rsi7.toFixed(1), '| RSI(14):', rsi14.toFixed(1));
if (rsi7 < 35) console.log('RSI(7) SIGNAL: LONG (oversold)');
else if (rsi7 > 80) console.log('RSI(7) SIGNAL: SHORT (overbought)');
else console.log('RSI(7): NO SIGNAL');

// rsiMomentum: rsi14 <35/>75 + mom3 thresh=0.001
const prev3 = closes[closes.length - 4];
const momChange3 = (last - prev3) / prev3;
console.log('\n--- RSI Momentum ---');
console.log('RSI(14):', rsi14.toFixed(1), '| Mom3:', (momChange3 * 100).toFixed(3) + '%');
if (rsi14 < 35 && momChange3 < -0.001) console.log('SIGNAL: LONG');
else if (rsi14 > 75 && momChange3 > 0.001) console.log('SIGNAL: SHORT');
else console.log('NO SIGNAL');

// Range
const highs = candles.slice(-20).map(c => parseFloat(c.h));
const lows = candles.slice(-20).map(c => parseFloat(c.l));
console.log('\n--- Range (20x5m) ---');
console.log('High:', Math.max(...highs), 'Low:', Math.min(...lows), 'Width:', (((Math.max(...highs)-Math.min(...lows))/last)*100).toFixed(2)+'%');
