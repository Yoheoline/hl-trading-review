import https from 'https';

const body = JSON.stringify({
  type: 'candleSnapshot',
  req: { coin: 'BTC', interval: '15m', startTime: Date.now() - 50*15*60000, endTime: Date.now() }
});

const options = { hostname: 'api.hyperliquid.xyz', path: '/info', method: 'POST', headers: { 'Content-Type': 'application/json' } };

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const candles = JSON.parse(data);
    const recent = candles.slice(-20);
    recent.forEach(c => {
      const d = new Date(c.t);
      const h = (d.getUTCHours() + 9) % 24;
      const m = d.getUTCMinutes();
      const time = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
      console.log(time, 'O:' + Number(c.o).toFixed(0), 'H:' + Number(c.h).toFixed(0), 'L:' + Number(c.l).toFixed(0), 'C:' + Number(c.c).toFixed(0));
    });

    const closes = candles.map(c => Number(c.c));
    const cur = closes[closes.length - 1];
    const prev2 = closes[closes.length - 3];
    const momentumPct = ((cur - prev2) / prev2 * 100).toFixed(3);
    
    console.log('\n--- Signals ---');
    console.log('Current:', cur.toFixed(0));
    console.log('Momentum (2-candle):', momentumPct + '%');
    console.log('Momentum threshold: 0.5% needed for signal');
    
    const highs = candles.map(c => Number(c.h));
    const lows = candles.map(c => Number(c.l));
    const rangeHigh = Math.max(...highs);
    const rangeLow = Math.min(...lows);
    const posInRange = ((cur - rangeLow) / (rangeHigh - rangeLow) * 100).toFixed(1);
    console.log('Range(50x15m): ' + rangeLow.toFixed(0) + ' - ' + rangeHigh.toFixed(0));
    console.log('Position in range: ' + posInRange + '%');
    console.log('Bounce zone 20%: below ' + (rangeLow + (rangeHigh-rangeLow)*0.2).toFixed(0) + ' or above ' + (rangeHigh - (rangeHigh-rangeLow)*0.2).toFixed(0));
    
    const ma12 = closes.slice(-12).reduce((a,b) => a+b, 0) / 12;
    const ma50 = closes.reduce((a,b) => a+b, 0) / closes.length;
    console.log('MA12:', ma12.toFixed(0), 'MA50:', ma50.toFixed(0), ma12 > ma50 ? 'BULLISH' : 'BEARISH');
    
    // RSI calc
    const period = 14;
    const rsiCloses = closes.slice(-period-1);
    let gains = 0, losses = 0;
    for (let i = 1; i < rsiCloses.length; i++) {
      const diff = rsiCloses[i] - rsiCloses[i-1];
      if (diff > 0) gains += diff; else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    console.log('RSI(14):', rsi.toFixed(1));
  });
});
req.write(body);
req.end();
