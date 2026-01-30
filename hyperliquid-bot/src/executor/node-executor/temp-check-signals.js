const { HyperliquidInfoAPI } = require('./hyperliquid-api.js');
const api = new HyperliquidInfoAPI();

function calcRSI(closes, period) {
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

(async () => {
  const candles = await api.getCandleData('BTC', '15m', 120);
  const closes = candles.map(c => parseFloat(c.c));
  const currentPrice = closes[closes.length - 1];
  
  // RSI calculations
  const rsi7 = calcRSI(closes, 7);
  const rsi14 = calcRSI(closes, 14);
  const rsi21 = calcRSI(closes, 21);
  
  // Momentum (5-bar)
  const mom5 = (currentPrice - closes[closes.length - 6]) / closes[closes.length - 6];
  const mom3 = (currentPrice - closes[closes.length - 4]) / closes[closes.length - 4];
  
  // Range (last 100 bars)
  const last100 = closes.slice(-100);
  const rangeHigh = Math.max(...last100);
  const rangeLow = Math.min(...last100);
  const rangeWidth = (rangeHigh - rangeLow) / currentPrice;
  const posInRange = (currentPrice - rangeLow) / (rangeHigh - rangeLow);
  
  // MA
  const ma12 = closes.slice(-12).reduce((a,b)=>a+b,0)/12;
  const ma50 = closes.slice(-50).reduce((a,b)=>a+b,0)/50;
  
  console.log('=== 15m Signal Check ===');
  console.log('Price:', currentPrice);
  console.log('RSI(7):', rsi7.toFixed(1));
  console.log('RSI(14):', rsi14.toFixed(1));
  console.log('RSI(21):', rsi21.toFixed(1));
  console.log('Momentum(3):', (mom3*100).toFixed(3) + '%');
  console.log('Momentum(5):', (mom5*100).toFixed(3) + '%');
  console.log('Range:', rangeLow.toFixed(0), '-', rangeHigh.toFixed(0), '(width:', (rangeWidth*100).toFixed(2) + '%)');
  console.log('Position in range:', (posInRange*100).toFixed(1) + '%');
  console.log('MA12:', ma12.toFixed(0), 'MA50:', ma50.toFixed(0));
  
  // Strategy signals
  console.log('\n=== Strategy Signals ===');
  
  // 1. RSI (best: period=21, oversold=30, overbought=70)
  if (rsi21 < 30) console.log('RSI(21): LONG signal (RSI=' + rsi21.toFixed(1) + ' < 30)');
  else if (rsi21 > 70) console.log('RSI(21): SHORT signal (RSI=' + rsi21.toFixed(1) + ' > 70)');
  else console.log('RSI(21): No signal (RSI=' + rsi21.toFixed(1) + ')');
  
  // 2. rsiMomentum (best: rsi14<20, mom5>0.5%)
  const rsiMomLong = rsi14 < 20 && mom5 < -0.005;
  const rsiMomShort = rsi14 > 80 && mom5 > 0.005;
  if (rsiMomLong) console.log('rsiMomentum: LONG signal');
  else if (rsiMomShort) console.log('rsiMomentum: SHORT signal');
  else console.log('rsiMomentum: No signal (RSI14=' + rsi14.toFixed(1) + ', mom5=' + (mom5*100).toFixed(3) + '%)');
  
  // 3. rangeBounce (best: window=100, zone=0.2)
  const bounceZone = 0.2;
  const nearLow = posInRange < bounceZone;
  const nearHigh = posInRange > (1 - bounceZone);
  if (nearLow && mom3 > 0) console.log('rangeBounce: LONG signal (near range low + rising)');
  else if (nearHigh && mom3 < 0) console.log('rangeBounce: SHORT signal (near range high + falling)');
  else console.log('rangeBounce: No signal (pos=' + (posInRange*100).toFixed(1) + '%, mom3=' + (mom3*100).toFixed(3) + '%)');
  
  process.exit(0);
})();
