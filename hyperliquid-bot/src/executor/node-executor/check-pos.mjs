import { Hyperliquid } from 'hyperliquid';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const accountNum = process.argv[2] || '4';
const PRIVATE_KEY = process.env[+HYPERLIQUID_SECRET_${accountNum}+];
const WALLET_ADDRESS = process.env[+HYPERLIQUID_WALLET_${accountNum}+];

const sdk = new Hyperliquid({ privateKey: PRIVATE_KEY, walletAddress: WALLET_ADDRESS });
await sdk.connect();
const info = await sdk.info.perpetuals.getClearinghouseState(WALLET_ADDRESS);
console.log(=== Account  ===);
console.log('Balance:', info.marginSummary.accountValue, 'USDC');
const pos = info.assetPositions.filter(p => parseFloat(p.position.szi) !== 0);
if (pos.length) {
  pos.forEach(p => {
    const { coin, szi, entryPx, unrealizedPnl, leverage } = p.position;
    console.log(${coin}:  @  | PnL:  | Lev: x);
  });
} else {
  console.log('No positions');
}
