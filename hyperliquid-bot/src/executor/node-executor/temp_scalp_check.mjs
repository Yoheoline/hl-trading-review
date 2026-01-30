// Use native fetch (Node 24)
const res = await fetch('https://api.hyperliquid.xyz/info', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'candleSnapshot',
    req: { coin: 'BTC', interval: '5m', startTime: Date.now() - 20 * 5 * 60 * 1000, endTime: Date.now() }
  })
});
const candles = await res.json();
candles.forEach(c => console.log(JSON.stringify({
  t: new Date(c.t).toISOString(),
  o: parseFloat(c.o), h: parseFloat(c.h), l: parseFloat(c.l), c: parseFloat(c.c), v: parseFloat(c.v)
})));
