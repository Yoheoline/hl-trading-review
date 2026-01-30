import { Hyperliquid } from 'hyperliquid';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const accounts = [
  { name: 'swing', num: 1 },
  { name: 'daytrade', num: 2 },
  { name: 'scalp', num: 3 },
  { name: 'ultrascalp', num: 4 },
  { name: 'account5', num: 5 },
  { name: 'account6', num: 6 }
];

async function check() {
  for (const acc of accounts) {
    const walletAddress = process.env[`HYPERLIQUID_WALLET_${acc.num}`];
    
    const body = JSON.stringify({ type: "clearinghouseState", user: walletAddress });
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    const data = await res.json();
    
    const positions = data.assetPositions?.filter(p => Math.abs(parseFloat(p.position.szi)) > 0.00001) || [];
    
    console.log(`\n=== ${acc.name} ===`);
    console.log(`Balance: $${parseFloat(data.marginSummary?.accountValue || 0).toFixed(2)}`);
    
    if (positions.length === 0) {
      console.log('No position');
    } else {
      positions.forEach(p => {
        const pos = p.position;
        console.log(`${pos.coin}: ${parseFloat(pos.szi) > 0 ? 'LONG' : 'SHORT'} ${Math.abs(parseFloat(pos.szi))} @ ${pos.entryPx}`);
        console.log(`  PnL: $${parseFloat(pos.unrealizedPnl).toFixed(2)}`);
      });
    }
  }
}

check().then(() => process.exit(0));
