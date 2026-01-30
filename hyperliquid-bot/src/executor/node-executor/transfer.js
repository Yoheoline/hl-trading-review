/**
 * Sub-account transfer
 * Usage: node transfer.js --from <N> --to <N> --amount <USD>
 */
import { Hyperliquid } from 'hyperliquid';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

function parseArgs() {
  const args = process.argv.slice(2);
  let from = null, to = null, amount = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i+1]) from = parseInt(args[i+1]);
    if (args[i] === '--to' && args[i+1]) to = parseInt(args[i+1]);
    if (args[i] === '--amount' && args[i+1]) amount = parseFloat(args[i+1]);
  }
  if (!from || !to || !amount) {
    console.error('Usage: node transfer.js --from <account_num> --to <account_num> --amount <USD>');
    process.exit(1);
  }
  return { from, to, amount };
}

const { from, to, amount } = parseArgs();

const fromKey = process.env[`HYPERLIQUID_SECRET_${from}`];
const fromWallet = process.env[`HYPERLIQUID_WALLET_${from}`];
const toWallet = process.env[`HYPERLIQUID_WALLET_${to}`];

if (!fromKey || !fromWallet || !toWallet) {
  console.error(`Missing credentials for account ${from} or ${to}`);
  process.exit(1);
}

console.log(`Transfer: Account ${from} → Account ${to}, $${amount}`);
console.log(`From: ${fromWallet}`);
console.log(`To: ${toWallet}`);

const sdk = new Hyperliquid({ privateKey: fromKey, walletAddress: fromWallet });
await sdk.connect();

try {
  // Try subAccountTransfer first
  try {
    const result = await sdk.exchange.subAccountTransfer(toWallet, amount);
    console.log('subAccountTransfer result:', JSON.stringify(result));
  } catch (e) {
    console.log('subAccountTransfer failed, trying usdTransfer:', e.message);
    // Fallback to usdTransfer
    const result = await sdk.exchange.usdTransfer(toWallet, amount);
    console.log('usdTransfer result:', JSON.stringify(result));
  }
} catch (e) {
  console.error('Transfer failed:', e.message);
} finally {
  sdk.disconnect();
}
