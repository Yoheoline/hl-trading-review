import { HyperliquidSDK } from '@anthropic-ai/hyperliquid';

const accountNum = process.argv[2] || '4';
const envKey = `HL_PRIVATE_KEY_${accountNum}`;
const sdk = new HyperliquidSDK({ privateKey: process.env[envKey] });

const info = await sdk.info.getUserState(sdk.wallet.address);
console.log(`=== Account ${accountNum} ===`);
console.log('Balance:', info.marginSummary.accountValue, 'USDC');
const pos = info.assetPositions.filter(p => parseFloat(p.position.szi) !== 0);
if (pos.length) {
  pos.forEach(p => {
    const { coin, szi, entryPx, unrealizedPnl, leverage } = p.position;
    console.log(`${coin}: ${szi} @ ${entryPx} | PnL: ${unrealizedPnl} | Lev: ${leverage}x`);
  });
} else {
  console.log('No positions');
}
