// One-off: Set TP + breakeven SL for account 3 scalp SHORT
import { Hyperliquid } from 'hyperliquid';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const accNum = parseInt(process.argv[2] || '3');
const tpPrice = parseInt(process.argv[3] || '81053');
const slPrice = parseInt(process.argv[4] || '82707');

const privateKey = process.env[`HYPERLIQUID_SECRET_${accNum}`];
const walletAddress = process.env[`HYPERLIQUID_WALLET_${accNum}`];

const sdk = new Hyperliquid({ privateKey, walletAddress });
await sdk.connect();

try {
  const cs = await sdk.info.perpetuals.getClearinghouseState(walletAddress);
  const pos = cs.assetPositions.find(p => Math.abs(parseFloat(p.position.szi)) > 0.00001);
  if (!pos) { console.log('No position'); process.exit(0); }

  const coin = pos.position.coin;
  const size = Math.abs(parseFloat(pos.position.szi));
  const isLong = parseFloat(pos.position.szi) > 0;
  console.log(`${coin} ${isLong ? 'LONG' : 'SHORT'} ${size} | TP=${tpPrice} SL=${slPrice}`);

  // TP
  const tpResult = await sdk.exchange.placeOrder({
    coin, is_buy: !isLong, sz: size, limit_px: tpPrice,
    order_type: { trigger: { triggerPx: tpPrice, isMarket: true, tpsl: 'tp' } },
    reduce_only: true
  });
  console.log('✅ TP:', JSON.stringify(tpResult).substring(0, 200));

  // SL at breakeven
  const slResult = await sdk.exchange.placeOrder({
    coin, is_buy: !isLong, sz: size, limit_px: slPrice,
    order_type: { trigger: { triggerPx: slPrice, isMarket: true, tpsl: 'sl' } },
    reduce_only: true
  });
  console.log('✅ SL:', JSON.stringify(slResult).substring(0, 200));

} catch (e) {
  console.error('Error:', e.message);
}
sdk.disconnect();
process.exit(0);
