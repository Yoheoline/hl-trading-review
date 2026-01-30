import { HyperliquidWebSocket } from './hyperliquid-ws.js';
const ws = new HyperliquidWebSocket();

try {
  await ws.connect();
  const now = Date.now();
  const resp = await ws.sendRequest({
    type: 'candleSnapshot',
    req: { coin: 'BTC', interval: '5m', startTime: now - 7200000, endTime: now }
  });
  const candles = resp.slice(-24);
  candles.forEach(c => {
    console.log(`${new Date(c.t).toISOString()} O:${c.o} H:${c.h} L:${c.l} C:${c.c} V:${c.v}`);
  });
  ws.disconnect();
} catch(e) {
  console.error(e);
  process.exit(1);
}
