const { HyperliquidAPI } = require('./hyperliquid-api.js');
const api = new HyperliquidAPI();
(async () => {
  const candles = await api.getCandles('BTC', '5m', 25);
  const recent = candles.slice(-20);
  recent.forEach(c => {
    const t = new Date(c.t).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo' });
    console.log(t, 'O:' + c.o, 'H:' + c.h, 'L:' + c.l, 'C:' + c.c, 'V:' + Math.round(c.v));
  });

  // Calculate momentum (2-candle)
  const last = recent[recent.length - 1];
  const prev2 = recent[recent.length - 3];
  const momentum2 = (parseFloat(last.c) - parseFloat(prev2.c)) / parseFloat(prev2.c);
  console.log('\n--- Momentum (2-bar) ---');
  console.log('Change:', (momentum2 * 100).toFixed(4) + '%');
  console.log('Threshold: 0.2%');
  console.log('Signal:', momentum2 < -0.002 ? 'LONG' : momentum2 > 0.002 ? 'SHORT' : 'NONE');

  // RSI calculation
  const closes = recent.map(c => parseFloat(c.c));
  const period = 14;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  console.log('\n--- RSI (14) ---');
  console.log('RSI:', rsi.toFixed(2));
  console.log('Oversold(<35)/Overbought(>75)');

  // Momentum (3-bar for rsiMomentum)
  const prev3 = recent[recent.length - 4];
  const momentum3 = (parseFloat(last.c) - parseFloat(prev3.c)) / parseFloat(prev3.c);
  console.log('\n--- rsiMomentum (3-bar, threshold 0.1%) ---');
  console.log('Momentum3:', (momentum3 * 100).toFixed(4) + '%');
  console.log('RSI:', rsi.toFixed(2), '(oversold<35, overbought>75)');
  const rsiMomSignal = (rsi < 35 && momentum3 < -0.001) ? 'LONG' : (rsi > 75 && momentum3 > 0.001) ? 'SHORT' : 'NONE';
  console.log('Signal:', rsiMomSignal);

  // Range detection (50 bars)
  const highs = recent.map(c => parseFloat(c.h));
  const lows = recent.map(c => parseFloat(c.l));
  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const price = parseFloat(last.c);
  const rangeWidth = (rangeHigh - rangeLow) / price * 100;
  const bounceZone = 0.2;
  const lowerBound = rangeLow + (rangeHigh - rangeLow) * bounceZone;
  const upperBound = rangeHigh - (rangeHigh - rangeLow) * bounceZone;
  console.log('\n--- rangeBounce (window 50/20 approx) ---');
  console.log('Range:', rangeLow, '-', rangeHigh, '(' + rangeWidth.toFixed(2) + '%)');
  console.log('Price:', price);
  console.log('Lower bounce zone (<' + lowerBound.toFixed(0) + '):', price < lowerBound ? 'YES' : 'NO');
  console.log('Upper bounce zone (>' + upperBound.toFixed(0) + '):', price > upperBound ? 'YES' : 'NO');

  console.log('\n=== SUMMARY ===');
  console.log('BTC:', price);
  console.log('Momentum(2):', momentum2 > 0.002 ? 'SHORT' : momentum2 < -0.002 ? 'LONG' : 'NEUTRAL');
  console.log('rsiMomentum:', rsiMomSignal);
  console.log('rangeBounce:', price < lowerBound ? 'LONG' : price > upperBound ? 'SHORT' : 'NEUTRAL');
})();
