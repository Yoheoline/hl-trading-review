// Add TP/SL - correct format
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

// Parse --account N from args
function getTargetAccounts() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--account');
  if (idx !== -1 && args[idx + 1]) {
    const num = parseInt(args[idx + 1]);
    const found = ALL_ACCOUNTS.find(a => a.num === num);
    if (found) return [found];
    console.error(`Account ${num} not found. Available: ${ALL_ACCOUNTS.map(a => `${a.num}(${a.name})`).join(', ')}`);
    process.exit(1);
  }
  return ALL_ACCOUNTS; // no --account = check all
}

async function addTPSL() {
  const accounts = getTargetAccounts();
  for (const acc of accounts) {
    const privateKey = process.env[`HYPERLIQUID_SECRET_${acc.num}`];
    const walletAddress = process.env[`HYPERLIQUID_WALLET_${acc.num}`];
    
    if (!privateKey || !walletAddress) {
      console.log(`[${acc.name}] Missing credentials, skipping`);
      continue;
    }
    
    const strategy = JSON.parse(readFileSync(resolve(__dirname, acc.strategy), 'utf8'));
    
    const sdk = new Hyperliquid({ privateKey, walletAddress });
    await sdk.connect();
    
    try {
      const clearinghouse = await sdk.info.perpetuals.getClearinghouseState(walletAddress);
      const positions = clearinghouse.assetPositions.filter(p => Math.abs(parseFloat(p.position.szi)) > 0.00001);
      
      if (positions.length === 0) {
        console.log(`[${acc.name}] No position`);
        sdk.disconnect();
        continue;
      }
      
      for (const pos of positions) {
        const coin = pos.position.coin;
        const size = Math.abs(parseFloat(pos.position.szi));
        const entryPx = parseFloat(pos.position.entryPx);
        const isLong = parseFloat(pos.position.szi) > 0;
        
        const tpPrice = isLong 
          ? entryPx * (1 + strategy.takeProfitPct) 
          : entryPx * (1 - strategy.takeProfitPct);
        const slPrice = isLong 
          ? entryPx * (1 - strategy.stopLossPct) 
          : entryPx * (1 + strategy.stopLossPct);
        
        console.log(`[${acc.name}] ${coin} ${isLong ? 'LONG' : 'SHORT'} ${size} @ ${entryPx}`);
        console.log(`  TP target: ${tpPrice.toFixed(1)} | SL target: ${slPrice.toFixed(1)}`);
        
        // Cancel existing orders
        try { 
          await sdk.custom.cancelAllOrders(coin); 
          console.log('  Cancelled existing orders');
        } catch (e) { 
          console.log('  No orders to cancel'); 
        }
        
        // Round to valid price precision (whole number for BTC)
        const tpPriceRounded = Math.round(tpPrice);
        const slPriceRounded = Math.round(slPrice);
        
        // Place TP order - trigger market order when price reaches target
        try {
          const tpOrder = {
            coin: coin,
            is_buy: !isLong,
            sz: size,
            limit_px: tpPriceRounded,
            order_type: {
              trigger: {
                triggerPx: tpPriceRounded,
                isMarket: true,
                tpsl: 'tp'
              }
            },
            reduce_only: true
          };
          console.log('  TP order:', JSON.stringify(tpOrder));
          const tpResult = await sdk.exchange.placeOrder(tpOrder);
          console.log(`  ✅ TP result:`, JSON.stringify(tpResult).substring(0, 200));
        } catch (e) {
          console.error(`  ❌ TP failed:`, e.message, e.stack?.substring(0, 200));
        }
        
        // Place SL order (CRITICAL: if SL fails, close position immediately)
        try {
          const slOrder = {
            coin: coin,
            is_buy: !isLong,
            sz: size,
            limit_px: slPriceRounded,
            order_type: {
              trigger: {
                triggerPx: slPriceRounded,
                isMarket: true,
                tpsl: 'sl'
              }
            },
            reduce_only: true
          };
          console.log('  SL order:', JSON.stringify(slOrder));
          const slResult = await sdk.exchange.placeOrder(slOrder);
          console.log(`  ✅ SL result:`, JSON.stringify(slResult).substring(0, 200));
        } catch (e) {
          console.error(`  ❌ SL failed:`, e.message, e.stack?.substring(0, 200));
          // CRITICAL FALLBACK: Position has no stop-loss protection
          // Immediately close the position to prevent unlimited loss
          console.error(`  🚨 EMERGENCY: SL failed — closing position to prevent unprotected exposure`);
          try {
            const closeResult = await sdk.custom.marketClose(coin, null, 0.02);
            console.error(`  🚨 Emergency close result:`, JSON.stringify(closeResult).substring(0, 200));
          } catch (closeErr) {
            console.error(`  🚨🚨 CRITICAL: Emergency close ALSO failed:`, closeErr.message);
            // At this point, Position Monitor (CRO) will catch the unprotected position
          }
        }
      }
    } catch (e) {
      console.error(`[${acc.name}] Error:`, e.message);
    }
    
    sdk.disconnect();
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('\nDone!');
}

addTPSL().then(() => process.exit(0));
