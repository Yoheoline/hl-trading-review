#!/usr/bin/env node
/**
 * evolve-strategy-v2.js - 第2弾: TradingView人気手法 + トレンドライン系
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');
const EXPLORER_PATH = join(__dirname, 'backtest-explorer.js');
const MIN_MONTHLY_PNL = 5;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targetStrategy = args.find((a, i) => args[i - 1] === '--strategy');

const NEW_STRATEGIES = [
  {
    name: 'supertrend',
    description: 'Supertrend (ATRベーストレンドフォロー、TradingView最人気)',
    params: { stAtrPeriod: [7, 10, 14], stMultiplier: [1.5, 2.0, 3.0] },
    signalCode: `
  if (params.strategy === 'supertrend') {
    const atrP = params.stAtrPeriod || 10;
    const mult = params.stMultiplier || 3.0;
    if (i >= atrP + 1) {
      // ATR
      let atrSum = 0;
      for (let j = i - atrP; j < i; j++) {
        atrSum += Math.max(highs[j]-lows[j], Math.abs(highs[j]-prices[j-1]), Math.abs(lows[j]-prices[j-1]));
      }
      const atr = atrSum / atrP;
      const hl2 = (highs[i] + lows[i]) / 2;
      const upperBand = hl2 + mult * atr;
      const lowerBand = hl2 - mult * atr;
      // Previous candle trend detection
      const prevHl2 = (highs[i-1] + lows[i-1]) / 2;
      let prevAtrSum = 0;
      for (let j = i-1-atrP; j < i-1; j++) {
        prevAtrSum += Math.max(highs[j]-lows[j], Math.abs(highs[j]-prices[j-1]), Math.abs(lows[j]-prices[j-1]));
      }
      const prevAtr = prevAtrSum / atrP;
      const prevUpper = prevHl2 + mult * prevAtr;
      const prevLower = prevHl2 - mult * prevAtr;
      // Supertrend flip detection
      const wasAbove = prices[i-1] > prevUpper;
      const wasBelow = prices[i-1] < prevLower;
      if (price > upperBand && !wasAbove) signal = 'LONG';
      if (price < lowerBand && !wasBelow) signal = 'SHORT';
    }
  }`,
  },
  {
    name: 'ichimokuCloud',
    description: '一目均衡表 雲ブレイク',
    params: { ichiTenkan: [7, 9, 12], ichiKijun: [22, 26, 30], ichiSenkou: [44, 52, 60] },
    signalCode: `
  if (params.strategy === 'ichimokuCloud') {
    const tenkanP = params.ichiTenkan || 9;
    const kijunP = params.ichiKijun || 26;
    const senkouP = params.ichiSenkou || 52;
    if (i >= senkouP) {
      const midHL = (arr, start, len) => {
        let hi = -Infinity, lo = Infinity;
        for (let j = start; j < start + len && j <= i; j++) { hi = Math.max(hi, highs[j]); lo = Math.min(lo, lows[j]); }
        return (hi + lo) / 2;
      };
      const tenkan = midHL(highs, i - tenkanP + 1, tenkanP);
      const kijun = midHL(highs, i - kijunP + 1, kijunP);
      const senkouA = (tenkan + kijun) / 2;
      const senkouB = midHL(highs, i - senkouP + 1, senkouP);
      const cloudTop = Math.max(senkouA, senkouB);
      const cloudBottom = Math.min(senkouA, senkouB);
      // Price breaks above cloud
      if (price > cloudTop && prices[i-1] <= cloudTop) signal = 'LONG';
      // Price breaks below cloud
      if (price < cloudBottom && prices[i-1] >= cloudBottom) signal = 'SHORT';
    }
  }`,
  },
  {
    name: 'donchianBreakout',
    description: 'ドンチャンチャネルブレイク（タートルズ手法）',
    params: { donchianPeriod: [10, 20, 30, 55], donchianExitPeriod: [5, 10, 15] },
    signalCode: `
  if (params.strategy === 'donchianBreakout') {
    const period = params.donchianPeriod || 20;
    if (i >= period) {
      const channelHighs = highs.slice(i - period, i);
      const channelLows = lows.slice(i - period, i);
      const upper = Math.max(...channelHighs);
      const lower = Math.min(...channelLows);
      if (price > upper) signal = 'LONG';
      if (price < lower) signal = 'SHORT';
    }
  }`,
  },
  {
    name: 'stochRsi',
    description: 'Stochastic RSI (RSIのストキャスティクス化)',
    params: { srRsiPeriod: [7, 14, 21], srStochPeriod: [7, 14], srOversold: [10, 15, 20], srOverbought: [80, 85, 90] },
    signalCode: `
  if (params.strategy === 'stochRsi') {
    const rsiP = params.srRsiPeriod || 14;
    const stochP = params.srStochPeriod || 14;
    if (i >= rsiP + stochP) {
      // Calculate RSI series
      const rsis = [];
      for (let k = i - stochP; k <= i; k++) {
        let g = 0, l = 0;
        for (let j = k - rsiP; j < k; j++) {
          const d = prices[j+1] - prices[j];
          if (d > 0) g += d; else l -= d;
        }
        rsis.push(100 - 100 / (1 + g / (l || 0.0001)));
      }
      const rsiHigh = Math.max(...rsis);
      const rsiLow = Math.min(...rsis);
      const stochRsi = rsiHigh !== rsiLow ? (rsis[rsis.length-1] - rsiLow) / (rsiHigh - rsiLow) * 100 : 50;
      const oversold = params.srOversold || 20;
      const overbought = params.srOverbought || 80;
      if (stochRsi < oversold && price > prices[i-1]) signal = 'LONG';
      if (stochRsi > overbought && price < prices[i-1]) signal = 'SHORT';
    }
  }`,
  },
  {
    name: 'keltnerChannel',
    description: 'ケルトナーチャネル（EMA + ATR）ブレイク/反発',
    params: { kcEmaPeriod: [10, 20, 30], kcAtrPeriod: [7, 10, 14], kcAtrMult: [1.0, 1.5, 2.0, 2.5] },
    signalCode: `
  if (params.strategy === 'keltnerChannel') {
    const emaP = params.kcEmaPeriod || 20;
    const atrP = params.kcAtrPeriod || 10;
    if (i >= Math.max(emaP, atrP) + 1) {
      // EMA
      const k = 2 / (emaP + 1);
      let ema = prices[0];
      for (let j = 1; j <= i; j++) ema = prices[j] * k + ema * (1 - k);
      // ATR
      let atrSum = 0;
      for (let j = i - atrP; j < i; j++) {
        atrSum += Math.max(highs[j]-lows[j], Math.abs(highs[j]-prices[j-1]), Math.abs(lows[j]-prices[j-1]));
      }
      const atr = atrSum / atrP;
      const mult = params.kcAtrMult || 1.5;
      const upper = ema + mult * atr;
      const lower = ema - mult * atr;
      if (price > upper && price > prices[i-1]) signal = 'LONG';
      if (price < lower && price < prices[i-1]) signal = 'SHORT';
    }
  }`,
  },
  {
    name: 'williamsR',
    description: 'Williams %R オーバーソールド/ボート反転',
    params: { wrPeriod: [7, 14, 21], wrOversold: [-90, -85, -80], wrOverbought: [-20, -15, -10] },
    signalCode: `
  if (params.strategy === 'williamsR') {
    const period = params.wrPeriod || 14;
    if (i >= period) {
      const periodHighs = highs.slice(i - period + 1, i + 1);
      const periodLows = lows.slice(i - period + 1, i + 1);
      const hh = Math.max(...periodHighs);
      const ll = Math.min(...periodLows);
      const wr = hh !== ll ? ((hh - price) / (hh - ll)) * -100 : -50;
      const oversold = params.wrOversold || -80;
      const overbought = params.wrOverbought || -20;
      if (wr < oversold && price > prices[i-1]) signal = 'LONG';
      if (wr > overbought && price < prices[i-1]) signal = 'SHORT';
    }
  }`,
  },
  {
    name: 'macdDivergence',
    description: 'MACDヒストグラムダイバージェンス',
    params: { macdFast: [8, 12, 16], macdSlow: [21, 26, 30], macdSignal: [5, 9, 12], macdDivWindow: [5, 10, 15] },
    signalCode: `
  if (params.strategy === 'macdDivergence') {
    const fastLen = params.macdFast || 12, slowLen = params.macdSlow || 26, sigLen = params.macdSignal || 9;
    const divW = params.macdDivWindow || 10;
    if (i >= slowLen + sigLen + divW) {
      const ema = (data, len) => { const k = 2/(len+1); let e = data[0]; for(let j=1;j<data.length;j++) e=data[j]*k+e*(1-k); return e; };
      const calcMacdHist = (idx) => {
        const sl = prices.slice(0, idx + 1);
        const fast = ema(sl.slice(-fastLen*3), fastLen);
        const slow = ema(sl.slice(-slowLen*3), slowLen);
        return fast - slow;
      };
      const histNow = calcMacdHist(i);
      const histPrev = calcMacdHist(i - divW);
      // Bullish divergence: price lower but MACD higher
      if (price < prices[i-divW] && histNow > histPrev && price > prices[i-1]) signal = 'LONG';
      // Bearish divergence: price higher but MACD lower
      if (price > prices[i-divW] && histNow < histPrev && price < prices[i-1]) signal = 'SHORT';
    }
  }`,
  },
  {
    name: 'linearRegression',
    description: '線形回帰チャネル乖離反発',
    params: { lrPeriod: [20, 30, 50], lrDevMult: [1.5, 2.0, 2.5] },
    signalCode: `
  if (params.strategy === 'linearRegression') {
    const period = params.lrPeriod || 30;
    const devMult = params.lrDevMult || 2.0;
    if (i >= period) {
      const slice = prices.slice(i - period + 1, i + 1);
      const n = slice.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      for (let j = 0; j < n; j++) { sumX += j; sumY += slice[j]; sumXY += j * slice[j]; sumX2 += j * j; }
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      const predicted = intercept + slope * (n - 1);
      // Standard deviation from regression line
      let devSum = 0;
      for (let j = 0; j < n; j++) { const diff = slice[j] - (intercept + slope * j); devSum += diff * diff; }
      const stdDev = Math.sqrt(devSum / n);
      const upperDev = predicted + devMult * stdDev;
      const lowerDev = predicted - devMult * stdDev;
      // Price bouncing from channel edges
      if (price < lowerDev && price > prices[i-1]) signal = 'LONG';
      if (price > upperDev && price < prices[i-1]) signal = 'SHORT';
    }
  }`,
  },
];

function git(cmd) {
  try { return execSync('git ' + cmd, { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['pipe','pipe','pipe'] }).trim(); }
  catch(e) { console.error('Git error: ' + e.stderr?.slice(0,100)); return null; }
}
function gh(cmd) {
  try { return execSync('gh ' + cmd, { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['pipe','pipe','pipe'] }).trim(); }
  catch(e) { console.error('GH error: ' + e.stderr?.slice(0,100)); return null; }
}

function addStrategyToExplorer(strategy) {
  let code = readFileSync(EXPLORER_PATH, 'utf-8');
  const sm = code.match(/strategies:\s*\[([^\]]+)\]/);
  if (!sm) throw new Error('Cannot find PARAM_SPACE.strategies');
  if (sm[1].includes("'" + strategy.name + "'")) { console.log('Already exists'); return false; }
  code = code.replace(sm[0], sm[0].replace(/\]$/, ", '" + strategy.name + "']"));

  const psEnd = code.indexOf('};', code.indexOf('const PARAM_SPACE'));
  let pl = '';
  for (const [k, v] of Object.entries(strategy.params)) {
    if (!code.includes(k + ':')) pl += '  ' + k + ': [' + v.join(', ') + '],\n';
  }
  if (pl) code = code.slice(0, psEnd) + pl + code.slice(psEnd);

  const m = code.match(/^  return signal;$/m);
  if (!m) throw new Error('Cannot find return signal');
  code = code.slice(0, m.index) + strategy.signalCode + '\n\n' + code.slice(m.index);

  // Add param generation
  const genSection = code.indexOf("if (strategy === 'returnMove')");
  if (genSection !== -1) {
    const returnIdx = code.indexOf('return { params, hash }', genSection);
    const insertAfter = code.indexOf('}', returnIdx);
    if (insertAfter !== -1) {
      const paramGen = `\n    if (strategy === '${strategy.name}') {\n` +
        Object.entries(strategy.params).map(([k]) => `      params.${k} = pick(PARAM_SPACE.${k});`).join('\n') +
        `\n      return { params, hash };\n    }`;
      code = code.slice(0, insertAfter + 1) + paramGen + code.slice(insertAfter + 1);
    }
  }

  writeFileSync(EXPLORER_PATH, code);
  return true;
}

async function main() {
  console.log('🧬 Strategy Evolution v2 - TradingView + Trendline');
  const cur = git('rev-parse --abbrev-ref HEAD');
  if (cur !== 'main') { git('stash'); git('checkout main'); }
  git('pull origin main');

  // Add .evolve-test-tmp.js and .pr-body-tmp.md to .gitignore
  const gitignorePath = join(REPO_ROOT, '.gitignore');
  let gitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
  if (!gitignore.includes('.evolve-test-tmp.js')) {
    gitignore += '\n.evolve-test-tmp.js\n.pr-body-tmp.md\n';
    writeFileSync(gitignorePath, gitignore);
    execSync('git add .gitignore && git commit -m "chore: ignore evolve temp files" && git push origin main', { cwd: REPO_ROOT, stdio: 'pipe' });
  }

  const strategies = targetStrategy ? NEW_STRATEGIES.filter(s => s.name === targetStrategy) : NEW_STRATEGIES;
  const explorerCode = readFileSync(EXPLORER_PATH, 'utf-8');
  const pending = strategies.filter(s => !explorerCode.includes("'" + s.name + "'"));
  if (!pending.length) { console.log('All strategies implemented'); return; }

  console.log(pending.length + ' new strategies to process\n');

  for (const s of pending) {
    console.log('='.repeat(50));
    console.log('🔬 ' + s.name + ': ' + s.description);
    const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const branch = 'feat/strategy-' + s.name + '-' + date;

    try {
      git('stash');
      git('checkout main');
      try { git('branch -D ' + branch); } catch(e) {}
      git('checkout -b ' + branch);

      const added = addStrategyToExplorer(s);
      if (!added) { git('checkout main'); try { git('branch -D ' + branch); } catch(e) {} continue; }

      git('add -A');
      git('commit -m "feat: add ' + s.name + ' strategy"');

      if (dryRun) { console.log('[DRY RUN] OK'); git('checkout main'); try { git('branch -D ' + branch); } catch(e) {} continue; }

      // Focused inline backtest
      console.log('Running backtest...');
      const testScript = join(__dirname, '.evolve-test-tmp.js');
      const testCode = `
const strategy = '${s.name}';
const API_URL = 'https://api.hyperliquid.xyz/info';
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function fetchCandles(interval) {
  const now = Date.now();
  const start = now - 14 * 24 * 60 * 60 * 1000;
  const res = await fetch(API_URL, { method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({type:'candleSnapshot', req:{coin:'BTC', interval, startTime:start, endTime:now}})
  });
  return res.json();
}

async function test() {
  let bestPnl = -Infinity, bestResult = '';
  for (const interval of ['1m', '5m', '15m', '1h']) {
    const candles = await fetchCandles(interval);
    if (!candles || candles.length < 100) continue;
    const prices = candles.map(c => parseFloat(c.c));
    const highs = candles.map(c => parseFloat(c.h));
    const lows = candles.map(c => parseFloat(c.l));
    
    for (let trial = 0; trial < 15; trial++) {
      const params = { strategy, interval, positionMode: pick(['basic','pyramid','full','doten']),
        maxPyramid: pick([2,3,5]), takeProfitPct: pick([0.003,0.005,0.01,0.015,0.02]),
        stopLossPct: pick([0.0015,0.0025,0.005,0.0075,0.01]) };
      ${Object.entries(s.params).map(([k,v]) => `params.${k} = pick(${JSON.stringify(v)});`).join('\n      ')}
      
      let position = null, pnl = 0, trades = 0, wins = 0;
      for (let i = 50; i < prices.length; i++) {
        const price = prices[i];
        if (position) {
          const ep = position.entry;
          const pp = position.isLong ? (price-ep)/ep : (ep-price)/ep;
          if (pp >= params.takeProfitPct) { pnl += pp - 0.0007; trades++; wins++; position = null; continue; }
          if (pp <= -params.stopLossPct) { pnl += pp - 0.0007; trades++; position = null; continue; }
          continue;
        }
        let signal = null;
        ${s.signalCode}
        if (signal) position = { entry: price, isLong: signal === 'LONG', time: i };
      }
      
      const cpd = { '1m': 1440, '5m': 288, '15m': 96, '1h': 24 };
      const days = candles.length / (cpd[interval] || 96);
      const monthly = days > 0 ? (pnl * 100 / days) * 30 : 0;
      if (monthly > bestPnl) {
        bestPnl = monthly;
        bestResult = interval + ' ' + trades + ' trades, WR ' + (trades > 0 ? (wins/trades*100).toFixed(1) : 0) + '%';
      }
    }
  }
  console.log('BEST: 月次' + bestPnl.toFixed(2) + '%');
  console.log('DETAIL: ' + bestResult);
}
test().catch(e => console.error(e));
`;
      writeFileSync(testScript, testCode);
      
      let output = '';
      try {
        output = execSync('node ' + testScript, { cwd: __dirname, encoding: 'utf-8', timeout: 120000, stdio: ['pipe','pipe','pipe'] });
      } catch(e) { output = (e.stdout || '') + (e.stderr || ''); }
      console.log(output);
      
      let bestPnl = 0;
      for (const line of output.split('\n')) {
        const m = line.match(/月次([+-]?\d+\.?\d*)%/);
        if (m) { const p = parseFloat(m[1]); if (p > bestPnl) bestPnl = p; }
      }

      if (bestPnl < MIN_MONTHLY_PNL) {
        console.log('❌ ' + s.name + ': ' + bestPnl.toFixed(2) + '% < ' + MIN_MONTHLY_PNL + '%');
        git('checkout main'); try { git('branch -D ' + branch); } catch(e) {}
        continue;
      }

      console.log('✅ ' + s.name + ': ' + bestPnl.toFixed(2) + '% - Creating PR');
      git('push -f origin ' + branch);

      const bodyFile = join(__dirname, '.pr-body-tmp.md');
      writeFileSync(bodyFile, '## 🧬 ' + s.name + '\n\n' + s.description + '\n\nBest monthly: ' + bestPnl.toFixed(2) + '%\n\n```\n' + output.slice(-2000) + '\n```\n\n*Auto-generated by evolve-strategy-v2*');
      gh('pr create --title "feat: add ' + s.name + ' (' + bestPnl.toFixed(1) + '% monthly)" --body-file "' + bodyFile.replace(/\\/g, '/') + '" --base main');
      git('checkout main');
    } catch(e) {
      console.error('Error: ' + e.message);
      try { git('stash'); git('checkout main'); git('branch -D ' + branch); } catch(e2) {}
    }
  }
  // Cleanup
  try { git('stash'); git('checkout main'); } catch(e) {}
  console.log('\n🧬 v2 Done');
}

main().catch(console.error);
