// List all exchange methods and try direct API call
import { Hyperliquid } from 'hyperliquid';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const key = process.env.HYPERLIQUID_SECRET_1;
const wallet1 = process.env.HYPERLIQUID_WALLET_1;

const sdk = new Hyperliquid({ privateKey: key, walletAddress: wallet1 });
await sdk.connect();

// List all exchange methods
const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(sdk.exchange))
  .filter(m => !m.startsWith('_') && m !== 'constructor');
console.log('Exchange methods:', methods.join(', '));

// Check if there's a transfer-related method
const transferMethods = methods.filter(m => m.toLowerCase().includes('transfer') || m.toLowerCase().includes('send') || m.toLowerCase().includes('usd'));
console.log('Transfer-related:', transferMethods);

sdk.disconnect();
