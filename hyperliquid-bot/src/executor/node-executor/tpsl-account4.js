import { Hyperliquid } from 'hyperliquid';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const privateKey = process.env.HYPERLIQUID_SECRET_4;
const walletAddress = process.env.HYPERLIQUID_WALLET_4;
const sdk = new Hyperliquid({ privateKey, walletAddress });

async function main() {
  await sdk.connect();
  
  const clearinghouse = await sdk.info.perpetuals.getClearinghouseState(walletAddress);
  const positions = clearinghouse.assetPositions.filter(p => Math.abs(parseFloat(p.position.szi)) > 0.00001);
  
  if (positions.length === 0) {
    console.log('No position found');
    sdk.disconnect();
    return;
  }
  
  for (const pos of positions) {
    const coin = pos.position.coin;
    const size = Math.abs(parseFloat(pos.position.szi));
    const entryPx = parseFloat(pos.position.entryPx);
    const isLong = parseFloat(pos.position.szi) > 0;
    
    const tpPct = 0.01; // 1%
    const slPct = 0.01; // 1%
    
    const tpPrice = isLong ? entryPx * (1 + tpPct) : entryPx * (1 - tpPct);
    const slPrice = isLong ? entryPx * (1 - slPct) : entryPx * (1 + slPct);
    const tpRound = Math.round(tpPrice);
    const slRound = Math.round(slPrice);
    
    console.log(`${coin} ${isLong ? 'LONG' : 'SHORT'} ${size} @ ${entryPx}`);
    console.log(`TP: ${tpRound} (+${tpPct*100}%) | SL: ${slRound} (-${slPct*100}%)`);
    
    try { await sdk.custom.cancelAllOrders(coin); console.log('Cancelled existing orders'); } catch(e) {}
    
    try {
      const tpResult = await sdk.exchange.placeOrder({
        coin, is_buy: !isLong, sz: size, limit_px: tpRound,
        order_type: { trigger: { triggerPx: tpRound, isMarket: true, tpsl: 'tp' } },
        reduce_only: true
      });
      console.log('✅ TP:', JSON.stringify(tpResult).substring(0, 200));
    } catch(e) { console.error('❌ TP:', e.message); }
    
    try {
      const slResult = await sdk.exchange.placeOrder({
        coin, is_buy: !isLong, sz: size, limit_px: slRound,
        order_type: { trigger: { triggerPx: slRound, isMarket: true, tpsl: 'sl' } },
        reduce_only: true
      });
      console.log('✅ SL:', JSON.stringify(slResult).substring(0, 200));
    } catch(e) { console.error('❌ SL:', e.message); }
  }
  
  sdk.disconnect();
}

main().then(() => process.exit(0));
