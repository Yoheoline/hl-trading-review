// Scalper signal check - 5m candles
const now = Date.now();
const start = now - 55 * 5 * 60 * 1000;
const body = { type: 'candleSnapshot', req: { coin: 'BTC', interval: '5m', startTime: start, endTime: now } };
const res = await fetch('https://api.hyperliquid.xyz/info', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});
const candles = await res.json();
const last50 = candles.slice(-50);

console.log('=== Last 10 5m candles ===');
last50.slice(-10).forEach(c => {
  const t = new Date(c.t).toISOString().substr(11,5);
  console.log(t, 'O:'+Number(c.o).toFixed(0), 'H:'+Number(c.h).toFixed(0), 'L:'+Number(c.l).toFixed(0), 'C:'+Number(c.c).toFixed(0));
});

const closes = last50.map(c => Number(c.c));
const highs = last50.map(c => Number(c.h));
const lows = last50.map(c => Number(c.l));
const current = closes[closes.length - 1];

// === rangeBounce (w50, zone 0.2) ===
const rangeHigh = Math.max(...highs);
const rangeLow = Math.min(...lows);
const rangeSize = rangeHigh - rangeLow;
const bounceZone = rangeSize * 0.2;
const nearBottom = current <= rangeLow + bounceZone;
const nearTop = current >= rangeHigh - bounceZone;
const recentDir = closes[closes.length-1] - closes[closes.length-4];

console.log('\n=== rangeBounce (w50, zone 0.2) ===');
console.log('Range:', rangeLow.toFixed(0), '-', rangeHigh.toFixed(0), '(size:', rangeSize.toFixed(0) + ')');
console.log('BounceZone:', bounceZone.toFixed(0));
console.log('Current:', current.toFixed(0), '| Pos in range:', ((current - rangeLow) / rangeSize * 100).toFixed(1) + '%');
console.log('Near bottom:', nearBottom, '| Near top:', nearTop, '| Dir:', recentDir > 0 ? 'UP' : 'DOWN');
if (nearBottom && recentDir > 0) console.log('>>> SIGNAL: LONG');
else if (nearTop && recentDir < 0) console.log('>>> SIGNAL: SHORT');
else console.log('>>> SIGNAL: NONE');

// === pivotBounce (lb24, touch 0.2%) ===
const pivotCandles = last50.slice(-24);
let swingLows = [], swingHighs = [];
for (let i = 1; i < pivotCandles.length - 1; i++) {
  if (Number(pivotCandles[i].l) < Number(pivotCandles[i-1].l) && Number(pivotCandles[i].l) < Number(pivotCandles[i+1].l))
    swingLows.push(Number(pivotCandles[i].l));
  if (Number(pivotCandles[i].h) > Number(pivotCandles[i-1].h) && Number(pivotCandles[i].h) > Number(pivotCandles[i+1].h))
    swingHighs.push(Number(pivotCandles[i].h));
}
const touchDist = current * 0.002;
const nearPivotLow = swingLows.some(s => Math.abs(current - s) <= touchDist);
const nearPivotHigh = swingHighs.some(s => Math.abs(current - s) <= touchDist);

console.log('\n=== pivotBounce (lb24, touch 0.2%) ===');
console.log('Swing lows:', swingLows.map(v=>v.toFixed(0)).join(', ') || 'none');
console.log('Swing highs:', swingHighs.map(v=>v.toFixed(0)).join(', ') || 'none');
console.log('Touch dist:', touchDist.toFixed(0));
console.log('Near pivot low:', nearPivotLow, '| Near pivot high:', nearPivotHigh);
if (nearPivotLow && recentDir > 0) console.log('>>> SIGNAL: LONG');
else if (nearPivotHigh && recentDir < 0) console.log('>>> SIGNAL: SHORT');
else console.log('>>> SIGNAL: NONE');

// === maCross (12/26) ===
const ma = (arr, period) => arr.slice(-period).reduce((a,b) => a+b, 0) / period;
const maFast = ma(closes, 12);
const maSlow = ma(closes, 26);
const prevCloses = closes.slice(0, -1);
const prevMaFast = ma(prevCloses, 12);
const prevMaSlow = ma(prevCloses, 26);
const crossUp = prevMaFast <= prevMaSlow && maFast > maSlow;
const crossDown = prevMaFast >= prevMaSlow && maFast < maSlow;

console.log('\n=== maCross (12/26) ===');
console.log('MA12:', maFast.toFixed(0), '| MA26:', maSlow.toFixed(0), '| Diff:', (maFast - maSlow).toFixed(0));
console.log('Cross up:', crossUp, '| Cross down:', crossDown);
if (crossUp) console.log('>>> SIGNAL: LONG');
else if (crossDown) console.log('>>> SIGNAL: SHORT');
else console.log('>>> SIGNAL: NONE');

console.log('\n=== Summary ===');
const signals = [];
if (nearBottom && recentDir > 0) signals.push('rangeBounce: LONG');
if (nearTop && recentDir < 0) signals.push('rangeBounce: SHORT');
if (nearPivotLow && recentDir > 0) signals.push('pivotBounce: LONG');
if (nearPivotHigh && recentDir < 0) signals.push('pivotBounce: SHORT');
if (crossUp) signals.push('maCross: LONG');
if (crossDown) signals.push('maCross: SHORT');
console.log('Active signals:', signals.length ? signals.join(' | ') : 'NONE');
