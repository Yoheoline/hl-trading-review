// Check what address each key derives to
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

for (let i = 1; i <= 6; i++) {
  const key = process.env[`HYPERLIQUID_SECRET_${i}`];
  const wallet = process.env[`HYPERLIQUID_WALLET_${i}`];
  if (key) {
    try {
      const w = new ethers.Wallet(key);
      console.log(`Account ${i}: Key derives to ${w.address} | Wallet set as ${wallet} | Match: ${w.address.toLowerCase() === wallet.toLowerCase()}`);
    } catch(e) {
      console.log(`Account ${i}: Error - ${e.message}`);
    }
  }
}

const legacyKey = process.env.HYPERLIQUID_API_SECRET;
if (legacyKey) {
  try {
    const w = new ethers.Wallet(legacyKey);
    console.log(`Legacy key derives to: ${w.address}`);
  } catch(e) {
    console.log(`Legacy key error: ${e.message}`);
  }
}
