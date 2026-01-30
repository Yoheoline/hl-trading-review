/**
 * Market Entry with TP/SL
 * Usage: node entry-with-tpsl.js <coin> <buy|sell> <size> <tpPct> <slPct>
 * Example: node entry-with-tpsl.js BTC buy 0.0015 0.03 0.02
 */
import { Hyperliquid } from 'hyperliquid';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const PRIVATE_KEY = process.env.HYPERLIQUID_API_SECRET;
const WALLET_ADDRESS = process.env.HYPERLIQUID_WALLET_ADDRESS;
const ACCOUNT_INDEX = 0; // Account 1 = index 0

const sdk = new Hyperliquid({ 
  privateKey: PRIVATE_KEY,
  walletAddress: WALLET_ADDRESS,
  accountIndex: ACCOUNT_INDEX
});

async function entryWithTPSL(coin, isBuy, size, tpPct, slPct) {
  await sdk.connect();
  
  try {
    // 1. Get current price
    const allMids = await sdk.info.getAllMids();
    const currentPrice = parseFloat(allMids[coin]);
    console.log(Current  price: {currentPrice});
    
    // 2. Calculate TP/SL prices
    let tpPrice, slPrice;
    if (isBuy) {
      tpPrice = currentPrice * (1 + tpPct);
      slPrice = currentPrice * (1 - slPct);
    } else {
      tpPrice = currentPrice * (1 - tpPct);
      slPrice = currentPrice * (1 + slPct);
    }
    
    console.log(Entry:   );
    console.log(TP: {tpPrice.toFixed(1)} (%));
    console.log(SL: {slPrice.toFixed(1)} (%));
    
    // 3. Place market order
    console.log('\\nPlacing market order...');
    const entryResult = await sdk.exchange.marketOpen({
      coin: coin,
      isBuy: isBuy,
      sz: size,
      slippage: 0.01
    });
    console.log('Entry result:', JSON.stringify(entryResult, null, 2));
    
    // 4. Wait a moment for position to register
    await new Promise(r => setTimeout(r, 1000));
    
    // 5. Add TP order
    console.log('\\nAdding TP order...');
    const tpOrder = {
      coin: coin,
      is_buy: !isBuy, // Opposite direction to close
      sz: size,
      limit_px: tpPrice,
      order_type: {
        trigger: {
          triggerPx: tpPrice,
          isMarket: true,
          tpsl: 'tp'
        }
      },
      reduce_only: true,
      grouping: 'positionTpsl'
    };
    const tpResult = await sdk.exchange.placeOrder(tpOrder);
    console.log('TP result:', JSON.stringify(tpResult, null, 2));
    
    // 6. Add SL order
    console.log('\\nAdding SL order...');
    const slOrder = {
      coin: coin,
      is_buy: !isBuy,
      sz: size,
      limit_px: slPrice,
      order_type: {
        trigger: {
          triggerPx: slPrice,
          isMarket: true,
          tpsl: 'sl'
        }
      },
      reduce_only: true,
      grouping: 'positionTpsl'
    };
    const slResult = await sdk.exchange.placeOrder(slOrder);
    console.log('SL result:', JSON.stringify(slResult, null, 2));
    
    return {
      success: true,
      entry: entryResult,
      tp: { price: tpPrice, result: tpResult },
      sl: { price: slPrice, result: slResult }
    };
    
  } catch (error) {
    console.error('Error:', error.message);
    return { success: false, error: error.message };
  } finally {
    sdk.disconnect();
  }
}

// Parse args
const args = process.argv.slice(2);
if (args.length < 5) {
  console.log('Usage: node entry-with-tpsl.js <coin> <buy|sell> <size> <tpPct> <slPct>');
  console.log('Example: node entry-with-tpsl.js BTC buy 0.0015 0.03 0.02');
  console.log('  -> LONG 0.0015 BTC with TP +3%, SL -2%');
  process.exit(1);
}

const [coin, side, size, tpPct, slPct] = args;
const isBuy = side.toLowerCase() === 'buy';

entryWithTPSL(coin, isBuy, parseFloat(size), parseFloat(tpPct), parseFloat(slPct));
