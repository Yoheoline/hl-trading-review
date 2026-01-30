import { Hyperliquid } from 'hyperliquid';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const sdk = new Hyperliquid({
  privateKey: process.env.HYPERLIQUID_SECRET_1,
  walletAddress: process.env.HYPERLIQUID_WALLET_1
});

async function check() {
  await sdk.connect();
  
  console.log('=== SDK Exchange Methods ===');
  const exchangeMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(sdk.exchange)).filter(k => k !== 'constructor');
  console.log(exchangeMethods);
  
  console.log('\n=== SDK Custom Methods ===');
  const customMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(sdk.custom)).filter(k => k !== 'constructor');
  console.log(customMethods);
  
  sdk.disconnect();
}

check().then(() => process.exit(0));
