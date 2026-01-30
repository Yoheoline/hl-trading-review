const now = Date.now();
const startTime = now - 3600000 * 4; // 4 hours of 5m candles

const res = await fetch('https://api.hyperliquid.xyz/info', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'candleSnapshot', req: { coin: 'BTC', interval: '5m', startTime, endTime: now } })
});
const candles = await res.json();

const last12 = candles.slice(-12);
console.log('=== Last 12 5m candles ===');
last12.forEach(c => {
  const t = new Date(c.t).toLocaleTimeString('ja-JP');
  console.log(`${t} O:${c.o} H:${c.h} L:${c.l} C:${c.c}`);
});

const closes = candles.map(c => parseFloat(c.c));
const currentPrice = closes[closes.length - 1];

// RSI(7)
const rsiPeriod = 7;
let gains = 0, losses = 0;
for (let i = closes.length - rsiPeriod; i < closes.length; i++) {
  const diff = closes[i] - closes[i-1];
  if (diff > 0) gains += diff;
  else losses -= diff;
}
const rs = losses === 0 ? 100 : (gains / rsiPeriod) / (losses / rsiPeriod);
const rsi = 100 - (100 / (1 + rs));

console.log(`\n=== Signals ===`);
console.log(`Current: $${currentPrice}`);
console.log(`RSI(7): ${rsi.toFixed(1)}`);
console.log(`RSI signal: ${rsi < 35 ? 'LONG (oversold)' : rsi > 75 ? 'SHORT (overbought)' : 'NEUTRAL'}`);

// Range(50)
const last50 = candles.slice(-50);
const highs50 = last50.map(c => parseFloat(c.h));
const lows50 = last50.map(c => parseFloat(c.l));
const rangeHigh = Math.max(...highs50);
const rangeLow = Math.min(...lows50);
const rangeSize = ((rangeHigh - rangeLow) / currentPrice * 100).toFixed(2);
const posInRange = ((currentPrice - rangeLow) / (rangeHigh - rangeLow) * 100).toFixed(1);

console.log(`\nRange(50): $${rangeLow} - $${rangeHigh} (${rangeSize}%)`);
console.log(`Price in range: ${posInRange}%`);
console.log(`rangeBounce signal: ${parseFloat(posInRange) < 15 ? 'LONG (near support)' : parseFloat(posInRange) > 85 ? 'SHORT (near resistance)' : 'NEUTRAL (mid-range)'}`);

// SwingPoint (lookback 3)
const last20 = candles.slice(-20);
let swingLows = [], swingHighs = [];
for (let i = 1; i < last20.length - 1; i++) {
  const l = parseFloat(last20[i].l);
  const h = parseFloat(last20[i].h);
  if (l < parseFloat(last20[i-1].l) && l < parseFloat(last20[i+1].l)) swingLows.push(l);
  if (h > parseFloat(last20[i-1].h) && h > parseFloat(last20[i+1].h)) swingHighs.push(h);
}
console.log(`\nSwing Lows: ${swingLows.join(', ') || 'none'}`);
console.log(`Swing Highs: ${swingHighs.join(', ') || 'none'}`);
const nearSwingLow = swingLows.some(sl => Math.abs(currentPrice - sl) / currentPrice < 0.005);
const nearSwingHigh = swingHighs.some(sh => Math.abs(currentPrice - sh) / currentPrice < 0.005);
console.log(`swingPoint signal: ${nearSwingLow ? 'LONG (near swing low)' : nearSwingHigh ? 'SHORT (near swing high)' : 'NEUTRAL'}`);

process.exit(0);
