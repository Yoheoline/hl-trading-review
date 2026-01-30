const { HyperliquidAPI } = require('./api');
const api = new HyperliquidAPI();

(async () => {
  const candles = await api.getCandles('BTC', '5m', 60);
  const recent = candles.slice(-15);
  
  console.log('=== Recent 5m candles ===');
  recent.forEach(c => {
    const d = new Date(c.t);
    console.log(d.toISOString().slice(11,16), 'O:'+c.o, 'H:'+c.h, 'L:'+c.l, 'C:'+c.c);
  });
  
  // Momentum check (window=2, threshold=0.002)
  const last = recent[recent.length - 1];
  const prev2 = recent[recent.length - 3]; // 2 candles back
  const momChange = (parseFloat(last.c) - parseFloat(prev2.c)) / parseFloat(prev2.c);
  console.log('\n=== Momentum (window=2) ===');
  console.log('Change:', (momChange * 100).toFixed(4) + '%', 'Threshold: 0.2%');
  if (momChange < -0.002) console.log('Signal: LONG');
  else if (momChange > 0.002) console.log('Signal: SHORT');
  else console.log('Signal: NONE');
  
  // RSI check (period=7)
  const closes = candles.slice(-20).map(c => parseFloat(c.c));
  let gains = 0, losses = 0;
  for (let i = closes.length - 7; i < closes.length; i++) {
    const diff = closes[i] - closes[i-1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / 7;
  const avgLoss = losses / 7;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  console.log('\n=== RSI (period=7) ===');
  console.log('RSI:', rsi.toFixed(1), 'Oversold: 35, Overbought: 80');
  if (rsi < 35) console.log('Signal: LONG');
  else if (rsi > 80) console.log('Signal: SHORT');
  else console.log('Signal: NONE');
  
  // Range Bounce check (window=50, bounceZone=0.2)
  const all50 = candles.slice(-50);
  const highs = all50.map(c => parseFloat(c.h));
  const lows = all50.map(c => parseFloat(c.l));
  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const rangeSize = rangeHigh - rangeLow;
  const price = parseFloat(last.c);
  const bounceZonePct = 0.2;
  const lowerBound = rangeLow + rangeSize * bounceZonePct;
  const upperBound = rangeHigh - rangeSize * bounceZonePct;
  console.log('\n=== Range Bounce (window=50) ===');
  console.log('Range:', rangeLow.toFixed(1), '-', rangeHigh.toFixed(1), '(size:', rangeSize.toFixed(1) + ')');
  console.log('Price:', price, 'Lower zone:', lowerBound.toFixed(1), 'Upper zone:', upperBound.toFixed(1));
  if (price < lowerBound) console.log('Signal: LONG (near range low)');
  else if (price > upperBound) console.log('Signal: SHORT (near range high)');
  else console.log('Signal: NONE (mid-range)');
  
  // Range as % of price
  console.log('Range/Price:', ((rangeSize/price)*100).toFixed(2) + '%');
})();
