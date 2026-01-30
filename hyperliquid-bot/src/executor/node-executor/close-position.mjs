/**
 * Close position utility
 * Usage: node close-position.mjs <account_num> [coin]
 * Example: node close-position.mjs 4
 *          node close-position.mjs 4 BTC
 */
import { Hyperliquid } from 'hyperliquid';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const args = process.argv.slice(2);
const ACCOUNT_NUM = parseInt(args[0]) || 4;
const TARGET_COIN = args[1] || 'BTC';

const privateKey = process.env[`HYPERLIQUID_SECRET_${ACCOUNT_NUM}`];
const walletAddress = process.env[`HYPERLIQUID_WALLET_${ACCOUNT_NUM}`];

if (!privateKey || !walletAddress) {
  console.error(`Account ${ACCOUNT_NUM} not configured`);
  process.exit(1);
}

console.log(`Account: ${ACCOUNT_NUM}`);
console.log(`Wallet: ${walletAddress}`);
console.log(`Target: ${TARGET_COIN}`);

const sdk = new Hyperliquid({ privateKey, walletAddress });

async function getCurrentPrice(coin) {
  const res = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'allMids' })
  });
  const data = await res.json();
  return parseFloat(data[coin]);
}

async function closePosition() {
  await sdk.connect();
  
  // Get position
  const state = await sdk.info.perpetuals.getClearinghouseState(walletAddress);
  const position = state.assetPositions.find(p => 
    p.position.coin === TARGET_COIN || 
    p.position.coin === `${TARGET_COIN}-PERP`
  );
  
  if (!position) {
    console.log(`No ${TARGET_COIN} position found`);
    return;
  }
  
  const pos = position.position;
  const size = Math.abs(parseFloat(pos.szi));
  const isLong = parseFloat(pos.szi) > 0;
  const pnl = parseFloat(pos.unrealizedPnl);
  
  if (size < 0.00001) {
    console.log('Position size too small');
    return;
  }
  
  console.log(`\nCurrent position:`);
  console.log(`  Side: ${isLong ? 'LONG' : 'SHORT'}`);
  console.log(`  Size: ${size}`);
  console.log(`  Entry: $${pos.entryPx}`);
  console.log(`  PnL: $${pnl.toFixed(2)}`);
  
  // Get current price
  const currentPrice = await getCurrentPrice(TARGET_COIN);
  const slippage = 0.01; // 1%
  const closePrice = isLong 
    ? currentPrice * (1 - slippage) 
    : currentPrice * (1 + slippage);
  const closePriceRounded = Math.round(closePrice * 2) / 2;
  
  console.log(`\nClosing...`);
  console.log(`  Current price: $${currentPrice}`);
  console.log(`  Close price: $${closePriceRounded}`);
  
  try {
    // Use marketOpen with opposite side to close
    const result = await sdk.custom.marketOpen(
      TARGET_COIN, 
      !isLong,  // opposite side
      size, 
      closePriceRounded, 
      slippage
    );
    
    if (result?.response?.data?.statuses?.[0]?.filled) {
      const fill = result.response.data.statuses[0].filled;
      console.log(`\n✅ Closed!`);
      console.log(`  Filled: ${fill.totalSz} @ $${fill.avgPx}`);
      
      // Calculate realized PnL
      const avgPx = parseFloat(fill.avgPx);
      const realizedPnl = isLong 
        ? (avgPx - parseFloat(pos.entryPx)) * size
        : (parseFloat(pos.entryPx) - avgPx) * size;
      console.log(`  Realized PnL: $${realizedPnl.toFixed(2)}`);
    } else if (result?.response?.data?.statuses?.[0]?.error) {
      console.error(`\n❌ Error: ${result.response.data.statuses[0].error}`);
    } else {
      console.log('\nResult:', JSON.stringify(result, null, 2));
    }
  } catch (e) {
    console.error('\n❌ Error:', e.message);
  }
}

closePosition().then(() => process.exit(0)).catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
