import { HyperliquidWebSocket } from './hyperliquid-ws.js';
const ws = new HyperliquidWebSocket();

await ws.connect();
const c = await ws.getCandles('BTC', '5m', 50);
await ws.disconnect();

c.slice(-10).forEach(x => {
  const t = new Date(x.t).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo' });
  console.log(t, 'O:' + x.o, 'H:' + x.h, 'L:' + x.l, 'C:' + x.c);
});

const last = c[c.length - 1];
const p2 = c[c.length - 3];
const mom = (parseFloat(last.c) - parseFloat(p2.c)) / parseFloat(p2.c);
console.log('\nMom2:', (mom * 100).toFixed(4) + '%', mom < -0.002 ? 'LONG' : mom > 0.002 ? 'SHORT' : 'NEUTRAL');

const cls = c.slice(-8).map(x => +x.c);
let g = 0, l = 0;
for (let i = 1; i < cls.length; i++) {
  const d = cls[i] - cls[i - 1];
  d > 0 ? g += d : l -= d;
}
const rs = l === 0 ? 100 : (g / 7) / (l / 7);
const rsi = 100 - 100 / (1 + rs);
console.log('RSI7:', rsi.toFixed(1), rsi < 35 ? 'LONG' : rsi > 80 ? 'SHORT' : 'NEUTRAL');

const h = c.map(x => +x.h), lo = c.map(x => +x.l);
const rH = Math.max(...h), rL = Math.min(...lo), pr = +last.c;
const rangeSize = ((rH - rL) / pr * 100).toFixed(2);
const pos = ((pr - rL) / (rH - rL) * 100).toFixed(1);
console.log('Range:', rL + '-' + rH, 'size:' + rangeSize + '%', 'pos:' + pos + '%', +pos < 20 ? 'LONG zone' : +pos > 80 ? 'SHORT zone' : 'MID');
