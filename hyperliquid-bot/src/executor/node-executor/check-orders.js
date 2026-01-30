import { HyperliquidClient } from './hyperliquid-client.js';

async function checkOrders() {
  const client = new HyperliquidClient();
  await client.connect();
  
  try {
    const orders = await client.getOpenOrders();
    console.log('Open Orders:');
    console.log(JSON.stringify(orders, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  }
  
  client.disconnect();
}

checkOrders();
