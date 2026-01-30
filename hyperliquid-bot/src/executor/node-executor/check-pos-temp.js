import { HyperliquidClient } from './hyperliquid-client.js';
const client = new HyperliquidClient(4);
const positions = await client.getPositions();
const btc = positions.find(x => x.coin === 'BTC');
console.log('Account 4 BTC:', btc ? JSON.stringify(btc, null, 2) : 'No position');
