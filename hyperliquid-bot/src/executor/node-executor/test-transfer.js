// Test which key can do transfers
import { Hyperliquid } from 'hyperliquid';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

// Try with the legacy API_SECRET key
const legacyKey = process.env.HYPERLIQUID_API_SECRET;
const wallet1 = process.env.HYPERLIQUID_WALLET_1;
const wallet3 = process.env.HYPERLIQUID_WALLET_3;

console.log('Using legacy HYPERLIQUID_API_SECRET');
console.log('Wallet 1:', wallet1);
console.log('Wallet 3:', wallet3);

const sdk = new Hyperliquid({ privateKey: legacyKey, walletAddress: wallet1 });
await sdk.connect();

try {
  const result = await sdk.exchange.usdClassTransfer(1.0, wallet3);
  console.log('usdClassTransfer result:', JSON.stringify(result));
} catch (e) {
  console.log('usdClassTransfer failed:', e.message);
  try {
    const result = await sdk.exchange.usdTransfer(wallet3, 1.0);
    console.log('usdTransfer result:', JSON.stringify(result));
  } catch (e2) {
    console.log('usdTransfer failed:', e2.message);
  }
}

sdk.disconnect();
