/**
 * Hyperliquid Order Executor
 * Uses hyperliquid SDK for signed operations
 * Called from Python via subprocess
 */
import { Hyperliquid } from 'hyperliquid';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

// Load .env from project root
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

// Parse --account N from args (extract before command parsing)
function extractAccount(argv) {
  const args = [...argv];
  let account = 1; // default: Account 1
  const idx = args.indexOf('--account');
  if (idx !== -1 && args[idx + 1]) {
    account = parseInt(args[idx + 1]);
    args.splice(idx, 2); // remove --account N from args
  }
  return { account, args };
}

const { account: ACCOUNT, args: cleanedArgv } = extractAccount(process.argv.slice(2));

// Load credentials for the selected account
// Account 1: HYPERLIQUID_SECRET_1 / HYPERLIQUID_WALLET_1 (or legacy HYPERLIQUID_API_SECRET)
// Account 2-4: HYPERLIQUID_SECRET_N / HYPERLIQUID_WALLET_N
const PRIVATE_KEY = process.env[`HYPERLIQUID_SECRET_${ACCOUNT}`] || process.env.HYPERLIQUID_API_SECRET;
const WALLET_ADDRESS = process.env[`HYPERLIQUID_WALLET_${ACCOUNT}`] || process.env.HYPERLIQUID_WALLET_ADDRESS;

if (!PRIVATE_KEY) {
  console.error(JSON.stringify({ error: `No API secret found for Account ${ACCOUNT}. Set HYPERLIQUID_SECRET_${ACCOUNT} in .env` }));
  process.exit(1);
}

// Initialize SDK for selected account
const sdk = new Hyperliquid({ 
  privateKey: PRIVATE_KEY,
  walletAddress: WALLET_ADDRESS
});

// Convert simple coin names to SDK format
function formatCoin(coin) {
  if (coin.includes('-')) return coin; // Already formatted
  return coin; // SDK should handle conversion internally
}

async function main() {
  const args = cleanedArgv;
  const command = args[0];
  
  try {
    await sdk.connect();
    let result;
    
    switch (command) {
      case 'buy':
        result = await placeOrder(args[1], parseFloat(args[2]), true, args[3] ? parseFloat(args[3]) : null);
        break;
        
      case 'sell':
        result = await placeOrder(args[1], parseFloat(args[2]), false, args[3] ? parseFloat(args[3]) : null);
        break;
        
      case 'market_open': {
        // === RISK GATE CHECK (CRITICAL) ===
        // Block new entries if CRO has disabled trading
        const RISK_GATE_PATH = 'C:/clawd/memory/hyperliquid/risk-gate.json';
        if (existsSync(RISK_GATE_PATH)) {
          try {
            const riskGate = JSON.parse(readFileSync(RISK_GATE_PATH, 'utf8'));
            if (!riskGate.allowNewEntry) {
              console.log(JSON.stringify({
                blocked: true,
                reason: 'Risk gate: new entries blocked by CRO',
                gate: {
                  allowNewEntry: false,
                  reasons: riskGate.reasons || [],
                  dangerScore: riskGate.dangerScore,
                  updatedAt: riskGate.updatedAt
                }
              }));
              process.exit(0);
            }
            // Check direction-specific blocks
            const isBuyArg = args[3] === 'true' || args[5] === 'true' || args[6] === 'true';
            if (isBuyArg && riskGate.blockedDirections?.includes('long')) {
              console.log(JSON.stringify({ blocked: true, reason: 'Risk gate: LONG direction blocked by CRO' }));
              process.exit(0);
            }
            if (!isBuyArg && riskGate.blockedDirections?.includes('short')) {
              console.log(JSON.stringify({ blocked: true, reason: 'Risk gate: SHORT direction blocked by CRO' }));
              process.exit(0);
            }
          } catch (e) {
            console.error(`[RISK GATE] Warning: could not read risk-gate.json: ${e.message}`);
            // Fail-open: continue if file is corrupted (CRO will fix on next run)
          }
        }
        // === END RISK GATE CHECK ===

        // market_open <coin> <size> <is_buy:true/false> [slippage]
        // market_open <coin> risk <riskAmount> <slPct> <is_buy:true/false> [slippage]
        if (args[2] === 'risk_pct') {
          // Percentage-based dynamic lot calculation: risk_pct <riskPct> <slPct> <is_buy> [slippage]
          const riskPct = parseFloat(args[3]);       // e.g. 4.0 (4% of balance)
          const slPct = parseFloat(args[4]);          // e.g. 0.75 (0.75% SL)
          const isBuyPct = args[5] === 'true';
          const slippagePct = args[6] ? parseFloat(args[6]) : 0.01;
          const balanceData = await getBalance();
          const balance = parseFloat(balanceData.accountValue);
          const riskAmount = balance * riskPct / 100;
          const priceDataPct = await getPrice(args[1]);
          const pricePct = parseFloat(priceDataPct.price);
          if (!pricePct || !balance) {
            result = { error: `Could not get price/balance. price=${pricePct}, balance=${balance}` };
            break;
          }
          const sizePct = parseFloat((riskAmount / (slPct / 100 * pricePct)).toFixed(5));
          console.error(`[RISK_PCT] balance=$${balance}, risk=${riskPct}%=$${riskAmount.toFixed(2)}, SL=${slPct}%, price=$${pricePct} → size=${sizePct}`);
          result = await marketOpen(args[1], sizePct, isBuyPct, slippagePct);
          result.riskCalc = { balance, riskPct, riskAmount: riskAmount.toFixed(2), slPct, size: sizePct };
        } else if (args[2] === 'risk') {
          // Fixed dollar risk: risk <riskAmount> <slPct> <is_buy> [slippage]
          const riskAmount = parseFloat(args[3]);
          const slPct = parseFloat(args[4]);
          const isBuyRisk = args[5] === 'true';
          const slippageRisk = args[6] ? parseFloat(args[6]) : 0.01;
          const priceData = await getPrice(args[1]);
          const currentPrice = parseFloat(priceData.price);
          if (!currentPrice) {
            result = { error: 'Could not get price for ' + args[1] };
            break;
          }
          const calculatedSize = parseFloat((riskAmount / (slPct / 100 * currentPrice)).toFixed(5));
          console.error(`[RISK CALC] risk=$${riskAmount}, SL=${slPct}%, price=$${currentPrice} → size=${calculatedSize}`);
          result = await marketOpen(args[1], calculatedSize, isBuyRisk, slippageRisk);
        } else {
          result = await marketOpen(args[1], parseFloat(args[2]), args[3] === 'true', args[4] ? parseFloat(args[4]) : 0.01);
        }
        break;
      }
      case 'market_close':
        // market_close <coin> [size] [slippage]
        result = await marketClose(args[1], args[2] ? parseFloat(args[2]) : null, args[3] ? parseFloat(args[3]) : 0.01);
        break;
        
      case 'cancel':
        result = await cancelOrder(args[1], args[2]);
        break;
        
      case 'cancel_all':
        result = await cancelAllOrders(args[1]);
        break;
        
      case 'position':
        result = await getPosition(args[1]);
        break;
        
      case 'balance':
        result = await getBalance();
        break;
        
      case 'price':
        result = await getPrice(args[1] || 'BTC');
        break;
        
      case 'test':
        result = await testConnection();
        break;
        
      default:
        result = { error: 'Unknown command. Use: buy, sell, market_open, market_close, cancel, cancel_all, position, balance, price, test' };
    }
    
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.log(JSON.stringify({ error: error.message, stack: error.stack }));
    process.exit(1);
  } finally {
    sdk.disconnect();
  }
}

async function getPrice(coin) {
  const mids = await sdk.info.getAllMids();
  // Try different formats
  const price = mids[coin] || mids[coin + '-PERP'] || mids[coin.toUpperCase()] || mids[coin.toUpperCase() + '-PERP'];
  return { coin, price, allKeys: Object.keys(mids).filter(k => k.toLowerCase().includes(coin.toLowerCase())) };
}

async function placeOrder(coin, size, isBuy, limitPrice = null) {
  const orderType = limitPrice ? { limit: { tif: 'Gtc' } } : { limit: { tif: 'Ioc' } };
  
  // For market orders, use a very aggressive price
  let price = limitPrice;
  if (!price) {
    const mids = await sdk.info.getAllMids();
    const midPrice = parseFloat(mids[coin] || mids[coin + '-PERP']);
    if (!midPrice) {
      return { error: 'Could not get mid price for ' + coin };
    }
    price = isBuy ? midPrice * 1.01 : midPrice * 0.99; // 1% slippage
  }
  
  const order = {
    coin: coin,
    is_buy: isBuy,
    sz: size,
    limit_px: price,
    order_type: orderType,
    reduce_only: false
  };
  
  const response = await sdk.exchange.placeOrder(order);
  return { success: true, order: response };
}

async function marketOpen(coin, size, isBuy, slippage = 0.01) {
  // Use custom operation for market orders
  const response = await sdk.custom.marketOpen(coin, isBuy, size, null, slippage);
  return { success: true, order: response };
}

async function marketClose(coin, size = null, slippage = 0.01) {
  const response = await sdk.custom.marketClose(coin, size, null, slippage);
  return { success: true, order: response };
}

async function cancelOrder(coin, orderId) {
  const response = await sdk.exchange.cancelOrder({ coin, o: parseInt(orderId) });
  return { success: true, result: response };
}

async function cancelAllOrders(coin = null) {
  const response = await sdk.custom.cancelAllOrders(coin);
  return { success: true, result: response };
}

async function getPosition(coin = null) {
  const state = await sdk.info.perpetuals.getClearinghouseState(WALLET_ADDRESS);
  
  if (coin) {
    const position = state.assetPositions.find(p => 
      p.position.coin === coin || p.position.coin === coin + '-PERP'
    );
    return position ? position.position : { coin, size: 0 };
  }
  
  return state.assetPositions.map(p => p.position);
}

async function getBalance() {
  const state = await sdk.info.perpetuals.getClearinghouseState(WALLET_ADDRESS);
  return {
    accountValue: state.marginSummary.accountValue,
    totalMarginUsed: state.marginSummary.totalMarginUsed,
    withdrawable: state.withdrawable
  };
}

async function testConnection() {
  const mids = await sdk.info.getAllMids();
  const btcPrice = mids['BTC'] || mids['BTC-PERP'];
  const assets = await sdk.info.getAllAssets();
  return { 
    connected: true, 
    btc_price: btcPrice,
    wallet: WALLET_ADDRESS,
    account: ACCOUNT,
    perp_count: assets.perp.length
  };
}

main();
