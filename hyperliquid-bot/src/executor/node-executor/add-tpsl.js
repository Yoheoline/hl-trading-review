// Add TP/SL to existing positions
import { Hyperliquid } from 'hyperliquid';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const accounts = [
  { name: 'swing', num: 1, strategy: 'strategy-swing.json' },
  { name: 'daytrade', num: 2, strategy: 'strategy-daytrade.json' },
  { name: 'scalp', num: 3, strategy: 'strategy-scalp.json' }
];

async function addTPSL() {
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
        console.log(`  TP: ${tpPrice.toFixed(1)} | SL: ${slPrice.toFixed(1)}`);
        
        // Cancel existing orders first
        try { await sdk.custom.cancelAllOrders(coin); } catch (e) { console.log('  No orders to cancel'); }
        
        // Place TP order
        const tpOrder = {
          coin,
          is_buy: !isLong,
          sz: size,
          order_type: { trigger: { triggerPx: tpPrice.toString(), isMarket: true, tpsl: 'tp' } },
          reduce_only: true
        };
        
        // Place SL order  
        const slOrder = {
          coin,
          is_buy: !isLong,
          sz: size,
          order_type: { trigger: { triggerPx: slPrice.toString(), isMarket: true, tpsl: 'sl' } },
          reduce_only: true
        };
        
        try {
          const tpResult = await sdk.exchange.placeOrder(tpOrder);
          console.log(`  ✅ TP order placed`, tpResult?.response?.data?.statuses?.[0] || 'OK');
        } catch (e) {
          console.error(`  ❌ TP order failed:`, e.message);
        }
        
        try {
          const slResult = await sdk.exchange.placeOrder(slOrder);
          console.log(`  ✅ SL order placed`, slResult?.response?.data?.statuses?.[0] || 'OK');
        } catch (e) {
          console.error(`  ❌ SL order failed:`, e.message);
        }
      }
    } catch (e) {
      console.error(`[${acc.name}] Error:`, e.message);
    }
    
    sdk.disconnect();
    await new Promise(r => setTimeout(r, 1000)); // Wait between accounts
  }
  
  console.log('\nDone!');
}

addTPSL().then(() => process.exit(0));
