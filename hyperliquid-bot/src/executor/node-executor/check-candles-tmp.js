const { HyperliquidInfoAPI } = require('./api');
const api = new HyperliquidInfoAPI();
(async () => {
  const now = Date.now();
  const candles = await api.getCandleSnapshot('BTC', '5m', now - 30*5*60*1000, now);
  const recent = candles.slice(-30);
  
  // Calculate RSI(7)
  const closes = recent.map(c => parseFloat(c.c));
  function calcRSI(data, period) {
    let gains = 0, losses = 0;
    for (let i = data.length - period; i < data.length; i++) {
      const diff = data[i] - data[i-1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
  
  const rsi7 = calcRSI(closes, 7);
  const rsi14 = calcRSI(closes, 14);
  
  // Momentum (3-bar change rate)
  const current = closes[closes.length - 1];
  const prev3 = closes[closes.length - 4];
  const momentum3 = (current - prev3) / prev3;
  
  // Range detection (last 20 candles)
  const last20 = recent.slice(-20);
  const highs = last20.map(c => parseFloat(c.h));
  const lows = last20.map(c => parseFloat(c.l));
  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const rangeSize = (rangeHigh - rangeLow) / current;
  const posInRange = (current - rangeLow) / (rangeHigh - rangeLow);
  
  // Last 50 candles for rangeBounce window=50
  const last5 = recent.slice(-5);
  const recentTrend = (closes[closes.length-1] - closes[closes.length-3]) / closes[closes.length-3];
  
  console.log('=== BTC 5m Analysis ===');
  console.log('Current:', current);
  console.log('RSI(7):', rsi7.toFixed(1));
  console.log('RSI(14):', rsi14.toFixed(1));
  console.log('Momentum(3):', (momentum3 * 100).toFixed(3) + '%');
  console.log('Range:', rangeLow, '-', rangeHigh, '(' + (rangeSize*100).toFixed(2) + '%)');
  console.log('Position in range:', (posInRange*100).toFixed(1) + '%');
  console.log('Recent trend (2bar):', (recentTrend*100).toFixed(3) + '%');
  console.log('');
  console.log('Last 10 candles:');
  recent.slice(-10).forEach(c => {
    const t = new Date(c.t).toISOString().slice(11,16);
    console.log(t, 'O:'+c.o, 'H:'+c.h, 'L:'+c.l, 'C:'+c.c);
  });
})();
