// Move SL to breakeven (entry price) for a specific account
// Usage: node breakeven-sl.js --account 3
import { Hyperliquid } from 'hyperliquid';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const ALL_ACCOUNTS = [
  { name: 'swing', num: 1, strategy: 'strategy-swing.json' },
  { name: 'daytrade', num: 2, strategy: 'strategy-daytrade.json' },
  { name: 'scalp', num: 3, strategy: 'strategy-scalp.json' },
  { name: 'ultrascalp', num: 4, strategy: 'strategy-ultrascalp.json' }
];

function getTargetAccount() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--account');
  if (idx === -1 || !args[idx + 1]) {
    console.error('Usage: node breakeven-sl.js --account <N>');
    process.exit(1);
  }
  const num = parseInt(args[idx + 1]);
  const found = ALL_ACCOUNTS.find(a => a.num === num);
  if (!found) {
    console.error(`Account ${num} not found`);
    process.exit(1);
  }
  return found;
}

async function moveToBreakeven() {
  const acc = getTargetAccount();
  const privateKey = process.env[`HYPERLIQUID_SECRET_${acc.num}`];
  const walletAddress = process.env[`HYPERLIQUID_WALLET_${acc.num}`];
  
  if (!privateKey || !walletAddress) {
    console.error(`[${acc.name}] Missing credentials`);
    process.exit(1);
  }

  const strategy = JSON.parse(readFileSync(resolve(__dirname, acc.strategy), 'utf8'));
  
  const sdk = new Hyperliquid({ privateKey, walletAddress });
  await sdk.connect();
  
  try {
    const clearinghouse = await sdk.info.perpetuals.getClearinghouseState(walletAddress);
    const positions = clearinghouse.assetPositions.filter(p => Math.abs(parseFloat(p.position.szi)) > 0.00001);
    
    if (positions.length === 0) {
      console.log(`[${acc.name}] No position`);
      process.exit(0);
    }
    
    for (const pos of positions) {
      const coin = pos.position.coin;
      const size = Math.abs(parseFloat(pos.position.szi));
      const entryPx = parseFloat(pos.position.entryPx);
      const isLong = parseFloat(pos.position.szi) > 0;
      
      // TP stays at strategy target
      const tpPrice = isLong 
        ? entryPx * (1 + strategy.takeProfitPct) 
        : entryPx * (1 - strategy.takeProfitPct);
      
      // SL moves to entry (breakeven)
      const slPrice = entryPx;
      
      console.log(`[${acc.name}] ${coin} ${isLong ? 'LONG' : 'SHORT'} ${size} @ ${entryPx}`);
      console.log(`  TP target: ${Math.round(tpPrice)} | SL → BREAKEVEN: ${Math.round(slPrice)}`);
      
      // Cancel existing orders
      try { 
        await sdk.custom.cancelAllOrders(coin); 
        console.log('  Cancelled existing orders');
      } catch (e) { 
        console.log('  No orders to cancel'); 
      }
      
      const tpPriceRounded = Math.round(tpPrice);
      const slPriceRounded = Math.round(slPrice);
      
      // Place TP
      try {
        const tpOrder = {
          coin, is_buy: !isLong, sz: size, limit_px: tpPriceRounded,
          order_type: { trigger: { triggerPx: tpPriceRounded, isMarket: true, tpsl: 'tp' } },
          reduce_only: true
        };
        const tpResult = await sdk.exchange.placeOrder(tpOrder);
        console.log(`  ✅ TP:`, JSON.stringify(tpResult).substring(0, 150));
      } catch (e) {
        console.error(`  ❌ TP failed:`, e.message);
      }
      
      // Place SL at breakeven
      try {
        const slOrder = {
          coin, is_buy: !isLong, sz: size, limit_px: slPriceRounded,
          order_type: { trigger: { triggerPx: slPriceRounded, isMarket: true, tpsl: 'sl' } },
          reduce_only: true
        };
        const slResult = await sdk.exchange.placeOrder(slOrder);
        console.log(`  ✅ SL (breakeven):`, JSON.stringify(slResult).substring(0, 150));
      } catch (e) {
        console.error(`  ❌ SL failed:`, e.message);
      }
    }
  } catch (e) {
    console.error(`[${acc.name}] Error:`, e.message);
  }
  
  sdk.disconnect();
}

moveToBreakeven().then(() => process.exit(0));
