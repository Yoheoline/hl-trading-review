import { Hyperliquid } from 'hyperliquid';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

// Account 4 = ultrascalp
const PRIVATE_KEY = process.env.HYPERLIQUID_SECRET_4;
const WALLET_ADDRESS = process.env.HYPERLIQUID_WALLET_4;

if (!PRIVATE_KEY || !WALLET_ADDRESS) {
  console.error('Missing HYPERLIQUID_SECRET_4 or HYPERLIQUID_WALLET_4');
  process.exit(1);
}

const sdk = new Hyperliquid({ privateKey: PRIVATE_KEY, walletAddress: WALLET_ADDRESS });

async function main() {
  try {
    await sdk.connect();
    console.log('Connected. Opening LONG BTC 0.0012...');
    const result = await sdk.custom.marketOpen('BTC', true, 0.0012, null, 0.01);
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    sdk.disconnect();
  }
}

main();
