import { Hyperliquid } from 'hyperliquid';

const sdk = new Hyperliquid();
await sdk.connect();

// Get all available assets
const assets = await sdk.info.getAllAssets();
console.log('Perp assets:', assets.perp.slice(0, 10));

// Get mids to see actual symbols
const mids = await sdk.info.getAllMids();
console.log('Sample mids:', Object.keys(mids).slice(0, 10));

sdk.disconnect();
