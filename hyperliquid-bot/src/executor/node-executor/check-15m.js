const { HyperliquidAPI } = require('./api');
const api = new HyperliquidAPI();

(async () => {
  const candles = await api.getCandles('BTC', '15m', 50);
  const recent = candles.slice(-20);
  recent.forEach(c => {
    const d = new Date(c.t);
    const h = (d.getUTCHours() + 9) % 24;
    const m = d.getUTCMinutes();
    const time = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    console.log(time, 'O:' + Number(c.o).toFixed(0), 'H:' + Number(c.h).toFixed(0), 'L:' + Number(c.l).toFixed(0), 'C:' + Number(c.c).toFixed(0));
  });
  
  // Calculate momentum (2-candle change)
  const last = candles.slice(-3);
  const cur = Number(last[2].c);
  const prev2 = Number(last[0].c);
  const momentumPct = ((cur - prev2) / prev2 * 100).toFixed(3);
  console.log('\n--- Signals ---');
  console.log('Current:', cur.toFixed(0));
  console.log('Momentum (2-candle):', momentumPct + '%');
  
  // Range (100 candles)
  const range100 = candles.slice(-100);
  const highs = range100.map(c => Number(c.h));
  const lows = range100.map(c => Number(c.l));
  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const rangeSize = ((rangeHigh - rangeLow) / rangeLow * 100).toFixed(2);
  const posInRange = ((cur - rangeLow) / (rangeHigh - rangeLow) * 100).toFixed(1);
  console.log('Range(100): ' + rangeLow.toFixed(0) + ' - ' + rangeHigh.toFixed(0) + ' (' + rangeSize + '%)');
  console.log('Position in range: ' + posInRange + '%');
  
  // MA cross (12/50)
  const closes50 = candles.slice(-50).map(c => Number(c.c));
  const ma12 = closes50.slice(-12).reduce((a,b) => a+b, 0) / 12;
  const ma50 = closes50.reduce((a,b) => a+b, 0) / 50;
  console.log('MA12:', ma12.toFixed(0), 'MA50:', ma50.toFixed(0), ma12 > ma50 ? 'BULLISH' : 'BEARISH');
})();
