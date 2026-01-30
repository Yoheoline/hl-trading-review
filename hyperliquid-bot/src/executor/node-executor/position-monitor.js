/**
 * Position Monitor - オープンポジションの状態チェック
 * - 含み益が出たらSLを建値に移動（ブレイクイーブン）
 * - 大きな含み益ならトレーリングストップ
 * 
 * Usage: node position-monitor.js
 * Output: JSON with position status and recommended actions
 */

import { Hyperliquid } from 'hyperliquid';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

// Use project root for .env
const envPath = resolve('C:/Users/yohei/Projects/hyperliquid-bot/.env');
dotenv.config({ path: envPath, override: true });

const ACCOUNTS = [
  { name: 'swing', num: 1 },
  { name: 'scalp', num: 3 }
];

async function checkPositions() {
  const results = [];

  for (const acc of ACCOUNTS) {
    const privateKey = process.env[`HYPERLIQUID_SECRET_${acc.num}`];
    const walletAddress = process.env[`HYPERLIQUID_WALLET_${acc.num}`];
    if (!privateKey || !walletAddress) continue;

    const sdk = new Hyperliquid({ privateKey, walletAddress });
    await sdk.connect();

    try {
      const state = await sdk.info.perpetuals.getClearinghouseState(walletAddress);
      const positions = state.assetPositions.filter(p => Math.abs(parseFloat(p.position.szi)) > 0.00001);

      const balance = parseFloat(state.marginSummary.accountValue);

      if (positions.length === 0) {
        results.push({ account: acc.name, num: acc.num, balance, position: null });
        continue;
      }

      for (const pos of positions) {
        const p = pos.position;
        const entry = parseFloat(p.entryPx);
        const size = Math.abs(parseFloat(p.szi));
        const isLong = parseFloat(p.szi) > 0;
        const unrealizedPnl = parseFloat(p.unrealizedPnl);
        const roe = parseFloat(p.returnOnEquity) * 100;

        // Get current orders (TP/SL)
        const orders = await sdk.info.getUserOpenOrders(walletAddress);
        const coinOrders = orders.filter(o => o.coin === p.coin);

        results.push({
          account: acc.name,
          num: acc.num,
          balance,
          position: {
            coin: p.coin,
            direction: isLong ? 'LONG' : 'SHORT',
            size,
            entry,
            unrealizedPnl: unrealizedPnl.toFixed(2),
            roe: roe.toFixed(2) + '%',
            orders: coinOrders.length,
            // Recommendations
            action: getRecommendation(isLong, entry, unrealizedPnl, roe, size)
          }
        });
      }
    } catch (e) {
      results.push({ account: acc.name, error: e.message });
    }

    sdk.disconnect();
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(JSON.stringify(results, null, 2));
}

function getRecommendation(isLong, entry, pnl, roe, size) {
  // ブレイクイーブン: 含み益+1%以上 → SLを建値に移動推奨
  if (roe > 1.0) {
    return `MOVE_SL_TO_BREAKEVEN: roe=${roe.toFixed(1)}% > 1%. Move SL to entry $${entry.toFixed(0)}`;
  }
  // トレーリング: 含み益+2%以上 → SLを+1%に移動推奨
  if (roe > 2.0) {
    const trailPrice = isLong ? entry * 1.01 : entry * 0.99;
    return `TRAIL_STOP: roe=${roe.toFixed(1)}% > 2%. Move SL to $${trailPrice.toFixed(0)} (+1%)`;
  }
  // 大損: -5%以上 → 手動確認推奨
  if (roe < -5.0) {
    return `CHECK_MANUALLY: roe=${roe.toFixed(1)}% large loss. Consider manual close.`;
  }
  return 'HOLD';
}

checkPositions().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
