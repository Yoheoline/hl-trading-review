import { Hyperliquid } from 'hyperliquid';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const sdk = new Hyperliquid({
  privateKey: process.env.HYPERLIQUID_SECRET_2,
  walletAddress: process.env.HYPERLIQUID_WALLET_2
});

await sdk.connect();

// Check what methods are available
const exchangeMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(sdk.exchange));
console.log('Exchange methods:', exchangeMethods.filter(m => !m.startsWith('_')));

const customMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(sdk.custom));
console.log('Custom methods:', customMethods.filter(m => !m.startsWith('_')));

sdk.disconnect();
