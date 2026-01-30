// Direct HTTP candle fetch from Hyperliquid
const now = Date.now();
const start = now - 25 * 5 * 60 * 1000;
const body = { type: 'candleSnapshot', req: { coin: 'BTC', interval: '5m', startTime: start, endTime: now } };
const res = await fetch('https://api.hyperliquid.xyz/info', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});
const data = await res.json();
const recent = data.slice(-20);

recent.forEach(c => {
  const t = new Date(parseInt(c.t)).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo' });
  console.log(t, 'O:' + c.o, 'H:' + c.h, 'L:' + c.l, 'C:' + c.c);
});

const closes = recent.map(c => parseFloat(c.c));
const last = closes[closes.length - 1];

const mom2 = (last - closes[closes.length - 3]) / closes[closes.length - 3];
console.log('\n--- Momentum 2-bar:', (mom2 * 100).toFixed(4) + '%', '→', mom2 < -0.002 ? 'LONG' : mom2 > 0.002 ? 'SHORT' : 'NONE');

const period = 14;
let gains = 0, losses = 0;
for (let i = closes.length - period; i < closes.length; i++) {
  const d = closes[i] - closes[i - 1];
  if (d > 0) gains += d; else losses -= d;
}
const rsi = 100 - 100 / (1 + (gains / period) / ((losses / period) || 0.001));
console.log('--- RSI(14):', rsi.toFixed(2), '→', rsi < 35 ? 'OVERSOLD' : rsi > 75 ? 'OVERBOUGHT' : 'NEUTRAL');

const mom3 = (last - closes[closes.length - 4]) / closes[closes.length - 4];
console.log('--- rsiMomentum: RSI=' + rsi.toFixed(2) + ' mom3=' + (mom3 * 100).toFixed(4) + '%', '→',
  (rsi < 35 && mom3 < -0.001) ? 'LONG' : (rsi > 75 && mom3 > 0.001) ? 'SHORT' : 'NONE');

const highs = recent.map(c => parseFloat(c.h));
const lows = recent.map(c => parseFloat(c.l));
const rH = Math.max(...highs), rL = Math.min(...lows);
const lBound = rL + (rH - rL) * 0.2, uBound = rH - (rH - rL) * 0.2;
console.log('--- rangeBounce: range', rL, '-', rH, '| price', last, '→',
  last < lBound ? 'LONG (near low)' : last > uBound ? 'SHORT (near high)' : 'NONE (mid-range)');

console.log('\n=== VERDICT ===');
const signals = [];
if (mom2 < -0.002) signals.push('momentum:LONG');
if (mom2 > 0.002) signals.push('momentum:SHORT');
if (rsi < 35 && mom3 < -0.001) signals.push('rsiMomentum:LONG');
if (rsi > 75 && mom3 > 0.001) signals.push('rsiMomentum:SHORT');
if (last < lBound) signals.push('rangeBounce:LONG');
if (last > uBound) signals.push('rangeBounce:SHORT');
console.log('Signals:', signals.length ? signals.join(', ') : 'NONE');
console.log('Confluence:', signals.length >= 2 ? 'YES' : 'NO');
