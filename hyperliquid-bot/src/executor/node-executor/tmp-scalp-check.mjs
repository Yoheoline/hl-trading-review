import { Hyperliquid } from 'hyperliquid';

async function main() {
  const sdk = new Hyperliquid();
  await sdk.connect();
  
  const now = Date.now();
  const candles = await sdk.info.getCandleSnapshot('BTC', '5m', now - 25 * 5 * 60 * 1000, now);
  
  const closes = candles.map(c => parseFloat(c.c));
  const highs = candles.map(c => parseFloat(c.h));
  const lows = candles.map(c => parseFloat(c.l));
  
  function calcRSI(data, period) {
    let gains = [], losses = [];
    for (let i = 1; i < data.length; i++) {
      const diff = data[i] - data[i-1];
      gains.push(diff > 0 ? diff : 0);
      losses.push(diff < 0 ? -diff : 0);
    }
    let avgGain = gains.slice(0, period).reduce((a,b) => a+b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a,b) => a+b, 0) / period;
    for (let i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period-1) + gains[i]) / period;
      avgLoss = (avgLoss * (period-1) + losses[i]) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
  
  const price = closes[closes.length - 1];
  const rsi7 = calcRSI(closes, 7);
  const rsi14 = calcRSI(closes, 14);
  
  const mom3 = (price - closes[closes.length - 4]) / closes[closes.length - 4] * 100;
  
  const recentHigh = Math.max(...highs.slice(-10));
  const recentLow = Math.min(...lows.slice(-10));
  const rangePct = (recentHigh - recentLow) / price * 100;
  
  const isRising = closes[closes.length-1] > closes[closes.length-2];
  
  console.log(JSON.stringify({
    price, rsi7: +rsi7.toFixed(1), rsi14: +rsi14.toFixed(1),
    mom3pct: +mom3.toFixed(3), recentHigh, recentLow, rangePct: +rangePct.toFixed(2),
    isRising, last5: closes.slice(-5).map(c => +c.toFixed(1)), n: candles.length
  }, null, 2));
  
  await sdk.disconnect();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
