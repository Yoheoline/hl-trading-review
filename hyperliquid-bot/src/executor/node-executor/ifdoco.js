/**
 * IFDOCO Order - Trigger entry with TP/SL
 * Usage: node ifdoco.js <coin> <side> <triggerPrice> <size> <tpPrice> <slPrice>
 * Example: node ifdoco.js BTC buy 85500 0.0015 89000 83500
 */
import { Hyperliquid } from 'hyperliquid';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const PRIVATE_KEY = process.env.HYPERLIQUID_API_SECRET;
const WALLET_ADDRESS = process.env.HYPERLIQUID_WALLET_ADDRESS;

const sdk = new Hyperliquid({ 
  privateKey: PRIVATE_KEY,
  walletAddress: WALLET_ADDRESS
});

async function placeIFDOCO(coin, isBuy, triggerPx, size, tpPx, slPx) {
  await sdk.connect();
  
  try {
    // Place trigger order (entry)
    const entryOrder = {
      coin: coin,
      is_buy: isBuy,
      sz: size,
      limit_px: triggerPx, // Limit price at trigger
      order_type: {
        trigger: {
          triggerPx: triggerPx,
          isMarket: false,
          tpsl: isBuy ? 'sl' : 'tp' // For entry: buy uses 'sl' (trigger below), sell uses 'tp' (trigger above)
        }
      },
      reduce_only: false
    };
    
    console.log('Placing trigger entry order...');
    console.log('Entry:', JSON.stringify(entryOrder, null, 2));
    
    const entryResult = await sdk.exchange.placeOrder(entryOrder);
    console.log('Entry order result:', JSON.stringify(entryResult, null, 2));
    
    // Note: TP/SL orders should be placed after entry is filled
    // For now, we just place the entry trigger
    // You can monitor fills and add TP/SL via add-tpsl.js
    
    return {
      success: true,
      entry: entryResult,
      note: 'TP/SL will need to be added after entry fills. Use add-tpsl.js or monitor position.'
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
if (args.length < 6) {
  console.log('Usage: node ifdoco.js <coin> <buy|sell> <triggerPrice> <size> <tpPrice> <slPrice>');
  console.log('Example: node ifdoco.js BTC buy 85500 0.0015 89000 83500');
  process.exit(1);
}

const [coin, side, triggerPx, size, tpPx, slPx] = args;
const isBuy = side.toLowerCase() === 'buy';

placeIFDOCO(coin, isBuy, parseFloat(triggerPx), parseFloat(size), parseFloat(tpPx), parseFloat(slPx));
