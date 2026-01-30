const { HyperliquidWebSocket } = require('./hyperliquid-ws.js');
const ws = new HyperliquidWebSocket();
(async () => {
  await ws.connect();
  const c = await ws.getCandles('BTC', '5m', 60);
  await ws.disconnect();
  c.slice(-60).forEach(x => console.log(JSON.stringify({t:x.t,o:x.o,h:x.h,l:x.l,c:x.c,v:x.v})));
})().catch(e => { console.error(e); process.exit(1); });
