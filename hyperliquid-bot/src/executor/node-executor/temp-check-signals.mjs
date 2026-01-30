import https from 'https';

function fetchCandles(interval, count) {
  const msPerBar = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000 };
  const body = JSON.stringify({
    type: 'candleSnapshot',
    req: { coin: 'BTC', interval, startTime: Date.now() - count * msPerBar[interval], endTime: Date.now() }
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.hyperliquid.xyz', path: '/info', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function calcRSI(data, period) {
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

const candles = await fetchCandles('15m', 120);
const closes = candles.map(c => parseFloat(c.c));
const currentPrice = closes[closes.length - 1];

const rsi7 = calcRSI(closes, 7);
const rsi14 = calcRSI(closes, 14);
const rsi21 = calcRSI(closes, 21);

const mom5 = (currentPrice - closes[closes.length - 6]) / closes[closes.length - 6];
const mom3 = (currentPrice - closes[closes.length - 4]) / closes[closes.length - 4];

const last100 = closes.slice(-100);
const rangeHigh = Math.max(...last100);
const rangeLow = Math.min(...last100);
const posInRange = (currentPrice - rangeLow) / (rangeHigh - rangeLow);

// Last 5 candles for context
console.log('=== Last 5 candles (15m) ===');
candles.slice(-5).forEach(c => {
  const t = new Date(c.t).toLocaleString('ja-JP', {timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'});
  console.log(t, 'O:'+parseFloat(c.o).toFixed(0), 'H:'+parseFloat(c.h).toFixed(0), 'L:'+parseFloat(c.l).toFixed(0), 'C:'+parseFloat(c.c).toFixed(0));
});

console.log('\n=== 15m Indicators ===');
console.log('Price:', currentPrice);
console.log('RSI(7):', rsi7.toFixed(1), '| RSI(14):', rsi14.toFixed(1), '| RSI(21):', rsi21.toFixed(1));
console.log('Mom(3):', (mom3*100).toFixed(3)+'%', '| Mom(5):', (mom5*100).toFixed(3)+'%');
console.log('Range(100):', rangeLow.toFixed(0), '-', rangeHigh.toFixed(0));
console.log('Pos in range:', (posInRange*100).toFixed(1)+'%');

console.log('\n=== Top 3 Strategy Signals (15m) ===');
// 1. RSI (pnl 17.71) - period=21, os=30, ob=70
const rsiSig = rsi21 < 30 ? 'LONG' : rsi21 > 70 ? 'SHORT' : 'NONE';
console.log('1. RSI:', rsiSig, '(RSI21=' + rsi21.toFixed(1) + ', threshold: <30/>70)');

// 2. rsiMomentum (pnl 16.63) - rsi14<20, mom5<-0.5%
const rmSig = (rsi14 < 20 && mom5 < -0.005) ? 'LONG' : (rsi14 > 80 && mom5 > 0.005) ? 'SHORT' : 'NONE';
console.log('2. rsiMomentum:', rmSig, '(RSI14=' + rsi14.toFixed(1) + ', mom5=' + (mom5*100).toFixed(3) + '%)');

// 3. rangeBounce (pnl 11.82) - window=100, zone=0.2
const rbSig = (posInRange < 0.2 && mom3 > 0) ? 'LONG' : (posInRange > 0.8 && mom3 < 0) ? 'SHORT' : 'NONE';
console.log('3. rangeBounce:', rbSig, '(pos=' + (posInRange*100).toFixed(1) + '%, mom3=' + (mom3*100).toFixed(3) + '%)');

// Confluence
const signals = [rsiSig, rmSig, rbSig].filter(s => s !== 'NONE');
const longs = signals.filter(s => s === 'LONG').length;
const shorts = signals.filter(s => s === 'SHORT').length;
console.log('\nConfluence: LONG=' + longs + ', SHORT=' + shorts + ', NONE=' + (3-signals.length));

process.exit(0);
