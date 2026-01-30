const { HyperliquidWebSocket } = require('./hyperliquid-ws.js');
const ws = new HyperliquidWebSocket();
(async () => {
  await ws.connect();
  const c = await ws.getCandles('BTC', '5m', 50);
  const recent = c.slice(-20).map(x => ({
    t: new Date(x.t).toISOString().slice(11, 16),
    o: +x.o, h: +x.h, l: +x.l, c: +x.c
  }));
  console.log(JSON.stringify(recent, null, 2));
  ws.disconnect();
})();
