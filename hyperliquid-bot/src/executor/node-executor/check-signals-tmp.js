import { HyperliquidWebSocket } from './hyperliquid-ws.js';

const ws = new HyperliquidWebSocket();

const candles = await ws.getCandles('BTC', '5m', 30);
await ws.disconnect();
const recent = candles.slice(-20);
recent.forEach(x => console.log(JSON.stringify({ t: x.t, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v })));
