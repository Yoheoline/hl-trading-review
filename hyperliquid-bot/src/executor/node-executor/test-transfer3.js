// Test subAccountTransfer with different argument styles
import { Hyperliquid } from 'hyperliquid';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const key = process.env.HYPERLIQUID_SECRET_1;
const wallet1 = process.env.HYPERLIQUID_WALLET_1;
const wallet3 = process.env.HYPERLIQUID_WALLET_3;

console.log('Key 1 → Wallet 3');
console.log('From:', wallet1);
console.log('To:', wallet3);

const sdk = new Hyperliquid({ privateKey: key, walletAddress: wallet1 });
await sdk.connect();

// Check subAccountTransfer signature
console.log('\nsubAccountTransfer toString:', sdk.exchange.subAccountTransfer.toString().slice(0, 200));

// Try different argument formats
try {
  // Format 1: (subAccountUser, isDeposit, usd)
  console.log('\nTrying format 1: (wallet, true, 1)');
  const r1 = await sdk.exchange.subAccountTransfer(wallet3, true, 1);
  console.log('Result:', JSON.stringify(r1));
} catch(e) {
  console.log('Failed:', e.message);
}

try {
  // Format 2: (subAccountUser, isDeposit, amount) with false
  console.log('\nTrying format 2: (wallet, false, 1)');
  const r2 = await sdk.exchange.subAccountTransfer(wallet3, false, 1);
  console.log('Result:', JSON.stringify(r2));
} catch(e) {
  console.log('Failed:', e.message);
}

sdk.disconnect();
