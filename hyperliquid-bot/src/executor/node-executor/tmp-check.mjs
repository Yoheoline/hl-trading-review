import { HyperliquidWebSocket } from './hyperliquid-ws.js';
const ws = new HyperliquidWebSocket();
await ws.connect();
const c = await ws.getCandles('BTC', '5m', 30);
ws.disconnect();
c.slice(-15).forEach((x, i) => console.log(JSON.stringify({
  i, t: new Date(x.t).toISOString(), o: x.o, h: x.h, l: x.l, c: x.c, v: x.v
})));
