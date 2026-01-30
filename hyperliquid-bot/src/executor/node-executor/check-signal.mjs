import { HyperliquidAPI } from './hyperliquid-api.js';
const api = new HyperliquidAPI();

const candles = await api.getCandles('BTC', '15m', 105);
const closes = candles.map(c => parseFloat(c.c));
const last = closes[closes.length - 1];
console.log('Price:', last);

candles.slice(-5).forEach(c => {
  const t = new Date(c.t).toISOString().slice(11, 16);
  console.log(t, 'O:' + c.o, 'H:' + c.h, 'L:' + c.l, 'C:' + c.c);
});

// RSI(21)
const period = 21;
let gains = 0, losses = 0;
for (let i = closes.length - period; i < closes.length; i++) {
  const diff = closes[i] - closes[i - 1];
  if (diff > 0) gains += diff; else losses -= diff;
}
const avgGain = gains / period;
const avgLoss = losses / period;
const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
console.log('RSI(21):', rsi.toFixed(1));

// Momentum(2)
const prev2 = closes[closes.length - 3];
const mom2 = ((last - prev2) / prev2 * 100);
console.log('Momentum(2):', mom2.toFixed(4) + '%');
console.log('Mom threshold 0.5%:', Math.abs(mom2) > 0.5 ? 'TRIGGERED' : 'no');
if (mom2 < -0.5) console.log('=> LONG signal (momentum reversal)');
if (mom2 > 0.5) console.log('=> SHORT signal (momentum reversal)');

// Range (100 candles)
const allH = candles.slice(-100).map(c => parseFloat(c.h));
const allL = candles.slice(-100).map(c => parseFloat(c.l));
const high = Math.max(...allH);
const low = Math.min(...allL);
console.log('Range100: L=' + low + ' H=' + high + ' W=' + ((high - low) / low * 100).toFixed(2) + '%');
const pos = (last - low) / (high - low);
console.log('PosInRange:', (pos * 100).toFixed(1) + '%');

if (pos < 0.2) console.log('=> Near range BOTTOM - potential LONG (rangeBounce)');
if (pos > 0.8) console.log('=> Near range TOP - potential SHORT (rangeBounce)');

// RSI signals
if (rsi < 30) console.log('=> RSI(21) OVERSOLD - LONG signal');
if (rsi > 70) console.log('=> RSI(21) OVERBOUGHT - SHORT signal');

console.log('\n--- Summary ---');
console.log('RSI(21):', rsi.toFixed(1), rsi < 30 ? 'LONG' : rsi > 70 ? 'SHORT' : 'neutral');
console.log('Momentum(2):', mom2.toFixed(4) + '%', mom2 < -0.5 ? 'LONG' : mom2 > 0.5 ? 'SHORT' : 'neutral');
console.log('RangeBounce:', (pos * 100).toFixed(1) + '%', pos < 0.2 ? 'LONG' : pos > 0.8 ? 'SHORT' : 'neutral');
