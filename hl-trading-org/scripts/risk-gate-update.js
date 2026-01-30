/**
 * Risk Gate Update (CRO機能)
 * 
 * Position Monitorから呼ばれ、risk-gate.jsonを更新する。
 * 全トレーダーはエントリー前にこのファイルを確認し、
 * allowNewEntry=false なら新規エントリーを行わない。
 * 
 * チェック項目:
 * 1. 全アカウント合計エクスポージャー > 残高50% → 新規禁止
 * 2. 4アカウント中3つが同方向 → 同方向の新規禁止
 * 3. 日次損失 > 5% → 翌日まで強制停止（タイムロック）
 * 4. BTC 1h変動 ±5% → 新規停止
 * 5. BTC 4h変動 ±10% → 全クローズ推奨
 * 6. FA警告🔴 → 新規禁止
 * 
 * Usage: node risk-gate-update.js
 * Output: risk-gate.json
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const ACCOUNTS = [
  { name: 'swing', num: 1, timeframe: '1h' },
  { name: 'daytrade', num: 2, timeframe: '15m' },
  { name: 'scalp', num: 3, timeframe: '5m' },
  { name: 'ultrascalp', num: 4, timeframe: '1m' }
];

const RISK_GATE_PATH = resolve('C:/clawd/memory/hyperliquid/risk-gate.json');
const MARKET_BRIEF_PATH = resolve('C:/clawd/memory/hyperliquid/market-brief.md');
const TRADE_HISTORY_PATH = resolve('C:/clawd/memory/hyperliquid/trade-history.json');
const INITIAL_CAPITAL = 197.66; // 4アカウント合計初期資金

// --- Thresholds (ChatGPT reviewed 2026-01-30) ---
const MAX_EXPOSURE_PCT = 50;       // 全体エクスポージャー上限 (%) ※含み損考慮して実質計算
const MAX_SAME_DIRECTION = 3;      // 同方向ポジション上限
const DAILY_LOSS_STOP_PCT = 5;     // 日次損失でタイムロック (%)
const CONSECUTIVE_LOSS_DAYS = 3;   // 連続マイナス日数で1日停止 (ChatGPT追加)
const BTC_1H_VOLATILITY_STOP = 7;  // BTC 1h変動で新規停止 (%) ※5%→7%に緩和(ChatGPT指摘)
const BTC_4H_STAGE1 = 10;         // BTC 4h変動で50%縮小 (%) (段階的に変更)
const BTC_4H_STAGE2 = 12;         // BTC 4h変動で全クローズ (%)
const MAX_COMBINED_RISK_PCT = 7;  // 全アカウント合計リスク上限 (%) (Claude Kelly分析追加)
const ACCOUNT_RISK = { swing: 4.0, daytrade: 2.5, scalp: 2.0, ultrascalp: 1.5 };

async function fetchAccountState(walletAddress) {
  const body = JSON.stringify({ type: "clearinghouseState", user: walletAddress });
  const res = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  return res.json();
}

async function fetchBTCCandles(interval, count) {
  const body = JSON.stringify({
    type: "candleSnapshot",
    req: { coin: "BTC", interval, startTime: Date.now() - count * 3600000 }
  });
  const res = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  return res.json();
}

function checkFAWarning() {
  try {
    if (!existsSync(MARKET_BRIEF_PATH)) return { level: 'unknown', reason: 'market-brief.md not found' };
    const content = readFileSync(MARKET_BRIEF_PATH, 'utf-8');
    if (content.includes('🔴') || content.toLowerCase().includes('red')) {
      return { level: 'RED', reason: 'FA警告🔴検出' };
    }
    if (content.includes('🟡') || content.toLowerCase().includes('yellow')) {
      return { level: 'YELLOW', reason: 'FA警告🟡検出' };
    }
    return { level: 'GREEN', reason: 'FA正常' };
  } catch (e) {
    return { level: 'unknown', reason: e.message };
  }
}

function loadExistingGate() {
  try {
    if (existsSync(RISK_GATE_PATH)) {
      return JSON.parse(readFileSync(RISK_GATE_PATH, 'utf-8'));
    }
  } catch (e) {}
  return null;
}

async function updateRiskGate() {
  const now = new Date();
  const reasons = [];
  let allowNewEntry = true;
  let emergencyClose = false;
  let lockedUntil = null;

  // Check existing timelock
  const existing = loadExistingGate();
  if (existing?.lockedUntil) {
    const lockTime = new Date(existing.lockedUntil);
    if (lockTime > now) {
      reasons.push(`⏰ タイムロック中 (${existing.lockedUntil}まで): ${existing.lockReason || '日次損失超過'}`);
      allowNewEntry = false;
      lockedUntil = existing.lockedUntil;
    }
  }

  // --- 1. Fetch all account states ---
  const accountStates = [];
  let totalBalance = 0;
  let totalExposure = 0;
  const directions = { long: 0, short: 0, none: 0 };
  let dailyPnl = 0;

  for (const acc of ACCOUNTS) {
    const walletAddress = process.env[`HYPERLIQUID_WALLET_${acc.num}`];
    if (!walletAddress) continue;

    try {
      const state = await fetchAccountState(walletAddress);
      const balance = parseFloat(state.marginSummary?.accountValue || 0);
      const positions = state.assetPositions?.filter(p => 
        Math.abs(parseFloat(p.position.szi)) > 0.00001
      ) || [];

      totalBalance += balance;

      if (positions.length === 0) {
        directions.none++;
        accountStates.push({ name: acc.name, balance, position: null, direction: 'none' });
      } else {
        for (const pos of positions) {
          const p = pos.position;
          const size = Math.abs(parseFloat(p.szi));
          const markPx = parseFloat(p.entryPx); // approximation
          const exposure = size * markPx;
          totalExposure += exposure;
          
          const isLong = parseFloat(p.szi) > 0;
          if (isLong) directions.long++;
          else directions.short++;

          const pnl = parseFloat(p.unrealizedPnl);
          dailyPnl += pnl;

          accountStates.push({ 
            name: acc.name, 
            balance, 
            position: { coin: p.coin, direction: isLong ? 'LONG' : 'SHORT', exposure, pnl },
            direction: isLong ? 'long' : 'short'
          });
        }
      }
    } catch (e) {
      accountStates.push({ name: acc.name, error: e.message });
    }
  }

  // --- 2. Check exposure (含み損考慮 - ChatGPT改善) ---
  const effectiveBalance = totalBalance + dailyPnl; // 含み損を考慮した実質残高
  const exposurePct = effectiveBalance > 0 ? (totalExposure / effectiveBalance * 100) : 0;
  if (exposurePct > MAX_EXPOSURE_PCT) {
    reasons.push(`📊 全体エクスポージャー ${exposurePct.toFixed(1)}% > ${MAX_EXPOSURE_PCT}%上限 (実質残高$${effectiveBalance.toFixed(2)})`);
    allowNewEntry = false;
  }

  // --- 3. Check directional concentration ---
  const dominantDirection = directions.long >= MAX_SAME_DIRECTION ? 'long' : 
                            directions.short >= MAX_SAME_DIRECTION ? 'short' : null;
  if (dominantDirection) {
    reasons.push(`🔄 同方向集中: ${dominantDirection.toUpperCase()} x${directions[dominantDirection]} (上限${MAX_SAME_DIRECTION})`);
    // Don't fully block, but block same direction
  }

  // --- 3.5 Check combined risk (Claude Kelly分析追加) ---
  const activePositionAccounts = accountStates
    .filter(a => a.direction && a.direction !== 'none')
    .map(a => a.name);
  const currentCombinedRisk = activePositionAccounts
    .reduce((sum, name) => sum + (ACCOUNT_RISK[name] || 2), 0);
  
  if (currentCombinedRisk >= MAX_COMBINED_RISK_PCT) {
    reasons.push(`📐 合計リスク ${currentCombinedRisk.toFixed(1)}% ≧ ${MAX_COMBINED_RISK_PCT}%上限 (ポジション中: ${activePositionAccounts.join(', ')})`);
    allowNewEntry = false;
  }

  // --- 4. Check daily P&L ---
  const dailyPnlPct = INITIAL_CAPITAL > 0 ? (dailyPnl / INITIAL_CAPITAL * 100) : 0;
  if (dailyPnlPct < -DAILY_LOSS_STOP_PCT) {
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0); // midnight tonight = start of tomorrow
    lockedUntil = tomorrow.toISOString();
    reasons.push(`🚨 日次損失 ${dailyPnlPct.toFixed(2)}% > -${DAILY_LOSS_STOP_PCT}% → 翌日までタイムロック`);
    allowNewEntry = false;
  }

  // --- 5. Check BTC volatility ---
  try {
    // 1h candles
    const candles1h = await fetchBTCCandles('1h', 2);
    if (candles1h && candles1h.length >= 2) {
      const prevClose = parseFloat(candles1h[candles1h.length - 2].c);
      const currClose = parseFloat(candles1h[candles1h.length - 1].c);
      const change1h = ((currClose - prevClose) / prevClose) * 100;
      
      if (Math.abs(change1h) > BTC_1H_VOLATILITY_STOP) {
        reasons.push(`⚡ BTC 1h変動 ${change1h.toFixed(2)}% > ±${BTC_1H_VOLATILITY_STOP}% → 新規停止`);
        allowNewEntry = false;
      }
    }

    // 4h check - 段階的対応 (ChatGPT改善: 一気に逃げない)
    if (candles1h && candles1h.length >= 5) {
      const fourHoursAgo = parseFloat(candles1h[candles1h.length - 5].c);
      const current = parseFloat(candles1h[candles1h.length - 1].c);
      const change4h = ((current - fourHoursAgo) / fourHoursAgo) * 100;
      
      if (Math.abs(change4h) > BTC_4H_STAGE2) {
        reasons.push(`🚨 BTC 4h変動 ${change4h.toFixed(2)}% > ±${BTC_4H_STAGE2}% → 全ポジションクローズ`);
        allowNewEntry = false;
        emergencyClose = true;
      } else if (Math.abs(change4h) > BTC_4H_STAGE1) {
        reasons.push(`⚠️ BTC 4h変動 ${change4h.toFixed(2)}% > ±${BTC_4H_STAGE1}% → 50%縮小推奨`);
        allowNewEntry = false;
        // emergencyClose stays false - partial reduction only
      }
    }
  } catch (e) {
    reasons.push(`⚠️ BTC価格取得失敗: ${e.message}`);
  }

  // --- 6. Check FA warning ---
  const fa = checkFAWarning();
  if (fa.level === 'RED') {
    reasons.push(`🔴 ${fa.reason} → 新規エントリー禁止`);
    allowNewEntry = false;
  }

  // --- Danger Score (崩壊予兆スコア - ChatGPT提案) ---
  let dangerScore = 0;
  const dangerFactors = {};

  // エクスポージャー傾向
  dangerFactors.exposurePct = Math.min(30, Math.round(exposurePct * 0.6));
  dangerScore += dangerFactors.exposurePct;

  // 日次損失傾向
  const lossFactor = dailyPnlPct < 0 ? Math.min(30, Math.round(Math.abs(dailyPnlPct) * 6)) : 0;
  dangerFactors.dailyLoss = lossFactor;
  dangerScore += lossFactor;

  // 同方向集中
  const maxDir = Math.max(directions.long, directions.short);
  dangerFactors.concentration = maxDir >= 3 ? 20 : maxDir >= 2 ? 10 : 0;
  dangerScore += dangerFactors.concentration;

  // FA警告
  dangerFactors.faWarning = fa.level === 'RED' ? 20 : fa.level === 'YELLOW' ? 10 : 0;
  dangerScore += dangerFactors.faWarning;

  // 合計リスク (Claude追加)
  dangerFactors.combinedRisk = Math.min(20, Math.round(currentCombinedRisk * 2));
  dangerScore += dangerFactors.combinedRisk;

  dangerScore = Math.min(100, dangerScore);

  // --- Virtual trades log (仮想継続ログ - ChatGPT提案) ---
  // Preserve existing virtual trades from previous gate
  const virtualTrades = existing?.virtualTrades || [];

  // --- Build risk gate ---
  const riskGate = {
    updatedAt: now.toISOString(),
    allowNewEntry,
    emergencyClose,
    lockedUntil,
    lockReason: lockedUntil ? reasons.find(r => r.includes('タイムロック')) || 'daily loss exceeded' : null,
    blockedDirection: dominantDirection,
    reasons,
    dangerScore,
    dangerFactors,
    metrics: {
      totalBalance: parseFloat(totalBalance.toFixed(2)),
      effectiveBalance: parseFloat(effectiveBalance.toFixed(2)),
      totalExposure: parseFloat(totalExposure.toFixed(2)),
      exposurePct: parseFloat(exposurePct.toFixed(1)),
      dailyPnl: parseFloat(dailyPnl.toFixed(2)),
      dailyPnlPct: parseFloat(dailyPnlPct.toFixed(2)),
      directions,
      faWarning: fa.level,
      activePositions: activePositionAccounts.length,
      combinedRiskPct: parseFloat(currentCombinedRisk.toFixed(1))
    },
    accounts: accountStates.map(a => ({
      name: a.name,
      balance: a.balance,
      direction: a.direction,
      exposure: a.position?.exposure,
      pnl: a.position?.pnl,
      error: a.error
    })),
    virtualTrades,
    thresholds: {
      maxExposurePct: MAX_EXPOSURE_PCT,
      maxSameDirection: MAX_SAME_DIRECTION,
      dailyLossStopPct: DAILY_LOSS_STOP_PCT,
      consecutiveLossDays: CONSECUTIVE_LOSS_DAYS,
      btc1hVolatilityStop: BTC_1H_VOLATILITY_STOP,
      btc4hStage1: BTC_4H_STAGE1,
      btc4hStage2: BTC_4H_STAGE2,
      maxCombinedRiskPct: MAX_COMBINED_RISK_PCT
    }
  };

  // Write to file
  writeFileSync(RISK_GATE_PATH, JSON.stringify(riskGate, null, 2));
  
  // Output for Cron/AI to read
  console.log(JSON.stringify(riskGate, null, 2));
}

updateRiskGate().then(() => process.exit(0)).catch(e => { 
  console.error('Risk gate update failed:', e); 
  process.exit(1); 
});
