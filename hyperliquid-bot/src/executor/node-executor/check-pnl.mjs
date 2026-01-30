import { Hyperliquid } from 'hyperliquid';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/yohei/Projects/hyperliquid-bot/.env' });

const sdk = new Hyperliquid({ enableWs: false });
await sdk.connect();

const wallets = [
  process.env.HYPERLIQUID_WALLET_1,
  process.env.HYPERLIQUID_WALLET_2,
  process.env.HYPERLIQUID_WALLET_3,
  process.env.HYPERLIQUID_WALLET_4
];

const names = ['Swing', 'Daytrade', 'Scalp', 'Ultrascalp'];
const principals = [49.43, 49.41, 49.41, 49.41];

console.log('=== Hyperliquid Results ===');

let totalEquity = 0;
let totalPrincipal = 0;

for (let i = 0; i < 4; i++) {
  try {
    const state = await sdk.info.perpetuals.getClearinghouseState(wallets[i]);
    const equity = parseFloat(state.marginSummary.accountValue);
    const pos = state.assetPositions.find(p => parseFloat(p.position.szi) !== 0);
    const realizedPnl = equity - principals[i];
    
    totalEquity += equity;
    totalPrincipal += principals[i];
    
    const posInfo = pos ? (parseFloat(pos.position.szi) > 0 ? 'LONG' : 'SHORT') : 'FLAT';
    const pnlStr = realizedPnl >= 0 ? '+' + realizedPnl.toFixed(2) : realizedPnl.toFixed(2);
    
    console.log(names[i] + ': $' + equity.toFixed(2) + ' (' + pnlStr + ') | ' + posInfo);
  } catch (e) {
    console.log(names[i] + ': Error');
  }
}

const totalPnl = totalEquity - totalPrincipal;
console.log('--- TOTAL: $' + totalEquity.toFixed(2) + ' (PnL: ' + (totalPnl >= 0 ? '+' : '') + totalPnl.toFixed(2) + ')');

process.exit(0);
