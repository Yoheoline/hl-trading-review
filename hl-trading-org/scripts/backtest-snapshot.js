// Snapshot strategy-analysis.json best pnl values
const d = require('C:/clawd/memory/hyperliquid/strategy-analysis.json');
const r = {};
for (const [s, tv] of Object.entries(d.strategies)) {
  for (const [t, c] of Object.entries(tv)) {
    if (c.variations && c.variations.length > 0) {
      r[s + '/' + t] = c.variations[0].pnl;
    }
  }
}
console.log(JSON.stringify(r));
