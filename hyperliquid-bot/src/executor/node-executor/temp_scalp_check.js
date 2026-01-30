const { HyperliquidWebSocket } = require('./websocket-client.js');

async function main() {
  let ws;
  try {
    ws = new HyperliquidWebSocket();
  } catch(e) {
    // Try alternative
    const mod = require('./check-candles.js');
    console.log('No websocket module found');
    return;
  }
  await ws.connect();
  const c = await ws.getCandles('BTC', '5m', 60);
  await ws.disconnect();
  c.slice(-20).forEach(x => console.log(JSON.stringify({
    t: new Date(x.t).toISOString(),
    o: x.o, h: x.h, l: x.l, c: x.c, v: x.v
  })));
}
main().catch(e => console.error(e.message));
