#!/usr/bin/env node
/**
 * evolve-strategy.js - 自律的戦略進化システム
 * 
 * 1. 新手法をbacktest-explorer.jsに追加
 * 2. feature branchでバックテスト実行
 * 3. 成績良ければPR作成、悪ければブランチ削除
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
    name: 'vwapBounce',
    description: 'VWAP反発',
    params: { vwapPeriod: [20, 50, 100], vwapBounceZone: [0.001, 0.002, 0.003, 0.005] },
    signalCode: `
  if (params.strategy === 'vwapBounce') {
    const period = params.vwapPeriod || 50;
    if (i >= period) {
      let sumPV = 0, sumV = 0;
      for (let j = i - period; j <= i; j++) {
        const typical = (highs[j] + lows[j] + prices[j]) / 3;
        const vol = highs[j] - lows[j];
        sumPV += typical * vol; sumV += vol;
      }
      const vwap = sumPV / sumV;
      const bounceZone = params.vwapBounceZone || 0.002;
      const dist = (price - vwap) / vwap;
      if (Math.abs(dist) < bounceZone) {
        if (price > prices[i-1] && price > vwap) signal = 'LONG';
        if (price < prices[i-1] && price < vwap) signal = 'SHORT';
      }
    }
  }`,
  },
  {
    name: 'obvDivergence',
    description: 'OBVダイバージェンス反転',
    params: { obvPeriod: [10, 20, 30], obvDivWindow: [5, 10, 15] },
    signalCode: `
  if (params.strategy === 'obvDivergence') {
    const divWindow = params.obvDivWindow || 10;
    if (i >= divWindow + 1) {
      let obv = [0];
      for (let j = 1; j <= i; j++) {
        const range = highs[j] - lows[j];
        if (prices[j] > prices[j-1]) obv.push(obv[obv.length-1] + range);
        else if (prices[j] < prices[j-1]) obv.push(obv[obv.length-1] - range);
        else obv.push(obv[obv.length-1]);
      }
      const obvNow = obv[obv.length-1], obvPrev = obv[obv.length-1-divWindow];
      if (price < prices[i-divWindow] && obvNow > obvPrev && price > prices[i-1]) signal = 'LONG';
      if (price > prices[i-divWindow] && obvNow < obvPrev && price < prices[i-1]) signal = 'SHORT';
    }
  }`,
  },
  {
    name: 'bbSqueeze',
    description: 'ボリンジャーバンドスクイーズブレイク',
    params: { bbPeriod: [10, 20, 30], bbStdDev: [1.5, 2.0, 2.5], bbSqueezeThreshold: [0.01, 0.02, 0.03] },
    signalCode: `
  if (params.strategy === 'bbSqueeze') {
    const period = params.bbPeriod || 20;
    const stdMult = params.bbStdDev || 2.0;
    const sqThresh = params.bbSqueezeThreshold || 0.02;
    if (i >= period * 2) {
      const slice = prices.slice(i - period, i + 1);
      const sma = slice.reduce((a,b) => a+b, 0) / slice.length;
      const std = Math.sqrt(slice.reduce((s,v) => s + (v-sma)**2, 0) / slice.length);
      const upper = sma + stdMult * std, lower = sma - stdMult * std;
      const bw = (upper - lower) / sma;
      const ps = prices.slice(i-period-1, i);
      const pSma = ps.reduce((a,b) => a+b, 0) / ps.length;
      const pStd = Math.sqrt(ps.reduce((s,v) => s + (v-pSma)**2, 0) / ps.length);
      const pBw = ((pSma + stdMult*pStd) - (pSma - stdMult*pStd)) / pSma;
      if (pBw < sqThresh && bw > pBw * 1.1) {
        if (price > upper) signal = 'LONG';
        if (price < lower) signal = 'SHORT';
      }
    }
  }`,
  },
  {
    name: 'emaCrossRsi',
    description: 'EMAクロス+RSIコンフルエンス',
    params: { ecFastEma: [5, 8, 12], ecSlowEma: [20, 26, 50], ecRsiPeriod: [7, 14], ecRsiFilter: [40, 45, 50] },
    signalCode: `
  if (params.strategy === 'emaCrossRsi') {
    const fastLen = params.ecFastEma || 8, slowLen = params.ecSlowEma || 21;
    const rsiP = params.ecRsiPeriod || 14, rsiF = params.ecRsiFilter || 45;
    if (i >= Math.max(slowLen, rsiP) + 2) {
      const ema = (data, len) => { const k = 2/(len+1); let e = data[0]; for (let j=1;j<data.length;j++) e = data[j]*k + e*(1-k); return e; };
      const fN = ema(prices.slice(0,i+1).slice(-fastLen*3), fastLen);
      const fP = ema(prices.slice(0,i).slice(-fastLen*3), fastLen);
      const sN = ema(prices.slice(0,i+1).slice(-slowLen*3), slowLen);
      const sP = ema(prices.slice(0,i).slice(-slowLen*3), slowLen);
      let gains=0, losses=0;
      for (let j=i-rsiP; j<i; j++) { const d=prices[j+1]-prices[j]; if(d>0) gains+=d; else losses-=d; }
      const rsi = 100 - 100/(1 + gains/(losses||0.0001));
      if (fP <= sP && fN > sN && rsi > rsiF) signal = 'LONG';
      if (fP >= sP && fN < sN && rsi < (100-rsiF)) signal = 'SHORT';
    }
  }`,
  },
  {
    name: 'atrBreakout',
    description: 'ATRベース動的ブレイクアウト',
    params: { atrBoPeriod: [7, 14, 20], atrBoMultiplier: [1.0, 1.5, 2.0, 2.5], atrBoLookback: [10, 20, 30] },
    signalCode: `
  if (params.strategy === 'atrBreakout') {
    const atrP = params.atrBoPeriod || 14, atrM = params.atrBoMultiplier || 1.5, lb = params.atrBoLookback || 20;
    if (i >= Math.max(atrP, lb) + 1) {
      let atrSum = 0;
      for (let j = i-atrP; j < i; j++) atrSum += Math.max(highs[j]-lows[j], Math.abs(highs[j]-prices[j-1]), Math.abs(lows[j]-prices[j-1]));
      const atr = atrSum / atrP;
      const mid = prices.slice(i-lb, i).reduce((a,b) => a+b, 0) / lb;
      if (price > mid + atr*atrM && price > prices[i-1]) signal = 'LONG';
      if (price < mid - atr*atrM && price < prices[i-1]) signal = 'SHORT';
    }
  }`,
  },
];

function git(cmd) {
  try { return execSync('git ' + cmd, { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['pipe','pipe','pipe'] }).trim(); }
  catch(e) { console.error('Git error: ' + e.message); return null; }
}
function gh(cmd) {
  try { return execSync('gh ' + cmd, { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['pipe','pipe','pipe'] }).trim(); }
  catch(e) { console.error('GH error: ' + e.message); return null; }
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

  // Insert signal code before "return signal;"
  const m = code.match(/^  return signal;$/m);
  if (!m) throw new Error('Cannot find return signal');
  code = code.slice(0, m.index) + strategy.signalCode + '\n\n' + code.slice(m.index);

  // Add param generation for new strategy
  const genSection = code.indexOf("if (strategy === 'returnMove')");
  if (genSection !== -1) {
    const insertAfter = code.indexOf('}', code.indexOf('return { params, hash }', genSection));
    if (insertAfter !== -1) {
      const paramGen = `\n    if (strategy === '${strategy.name}') {\n` +
        Object.entries(strategy.params).map(([k, v]) => `      params.${k} = pick(PARAM_SPACE.${k});`).join('\n') +
        `\n      return { params, hash };\n    }`;
      code = code.slice(0, insertAfter + 1) + paramGen + code.slice(insertAfter + 1);
    }
  }

  writeFileSync(EXPLORER_PATH, code);
  return true;
}

async function main() {
  console.log('🧬 Strategy Evolution System');
  const cur = git('rev-parse --abbrev-ref HEAD');
  if (cur !== 'main') git('checkout main');
  git('pull origin main');

  const strategies = targetStrategy ? NEW_STRATEGIES.filter(s => s.name === targetStrategy) : NEW_STRATEGIES;
  const explorerCode = readFileSync(EXPLORER_PATH, 'utf-8');
  const pending = strategies.filter(s => !explorerCode.includes("'" + s.name + "'"));
  if (!pending.length) { console.log('All strategies implemented'); return; }

  console.log(pending.length + ' new strategies to process');

  for (const s of pending) {
    console.log('\n' + '='.repeat(50));
    console.log('🔬 ' + s.name + ': ' + s.description);
    const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const branch = 'feat/strategy-' + s.name + '-' + date;

    try {
      git('checkout main');
      git('branch -D ' + branch + ' 2>/dev/null');
      git('checkout -b ' + branch);

      const added = addStrategyToExplorer(s);
      if (!added) { git('checkout main'); git('branch -D ' + branch); continue; }

      git('add -A');
      git('commit -m "feat: add ' + s.name + ' strategy"');

      if (dryRun) { console.log('[DRY RUN] OK'); git('checkout main'); git('branch -D ' + branch); continue; }

      // Run focused backtest - directly test the new strategy with various params
      console.log('Running focused backtest for ' + s.name + '...');
      
      // Create a temporary test script that imports and tests the modified explorer
      const testScript = join(__dirname, '.evolve-test-tmp.js');
      const testCode = `
import { readFileSync } from 'fs';
const API_URL = 'https://api.hyperliquid.xyz/info';
const strategy = '${s.name}';
const intervals = ['1m', '5m', '15m', '1h'];
const paramSets = ${JSON.stringify(Object.entries(s.params))};

// Build param combinations (sample 20 random)
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function fetchCandles(interval) {
  const now = Date.now();
  const start = now - 14 * 24 * 60 * 60 * 1000;
  const res = await fetch(API_URL, { method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({type:'candleSnapshot', req:{coin:'BTC', interval, startTime:start, endTime:now}})
  });
  return res.json();
}

// Import getSignal and runBacktest from the modified explorer
const explorerCode = readFileSync('${EXPLORER_PATH.replace(/\\/g, '/')}', 'utf-8');
// We'll do a simplified inline backtest
async function test() {
  let bestPnl = -Infinity;
  let bestResult = '';
  
  for (const interval of intervals) {
    const candles = await fetchCandles(interval);
    if (!candles || candles.length < 100) continue;
    
    const prices = candles.map(c => parseFloat(c.c));
    const highs = candles.map(c => parseFloat(c.h));
    const lows = candles.map(c => parseFloat(c.l));
    
    for (let trial = 0; trial < 10; trial++) {
      const params = { strategy, interval, positionMode: pick(['basic','pyramid','full','doten']),
        maxPyramid: pick([2,3,5]), takeProfitPct: pick([0.003,0.005,0.01,0.015,0.02]),
        stopLossPct: pick([0.0015,0.0025,0.005,0.0075,0.01]) };
      // Add strategy-specific params
      ${Object.entries(s.params).map(([k,v]) => `params.${k} = pick(${JSON.stringify(v)});`).join('\n      ')}
      
      // Simplified backtest inline
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
        // Signal generation (copied from strategy)
        let signal = null;
        ${s.signalCode}
        if (signal) position = { entry: price, isLong: signal === 'LONG', time: i };
      }
      
      const days = candles.length / ({ '1m': 1440, '5m': 288, '15m': 96, '1h': 24 }[interval] || 96);
      const monthly = days > 0 ? (pnl * 100 / days) * 30 : 0;
      
      if (monthly > bestPnl) {
        bestPnl = monthly;
        bestResult = interval + ' ' + JSON.stringify(params).slice(0,100) + ' 月次' + monthly.toFixed(2) + '% (' + trades + ' trades, WR ' + (trades > 0 ? (wins/trades*100).toFixed(1) : 0) + '%)';
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
      
      // Parse best PnL
      let bestPnl = 0;
      for (const line of output.split('\n')) {
        const m = line.match(/月次([+-]?\d+\.?\d*)%/) || line.match(/monthly[:\s]+([+-]?\d+\.?\d*)%/i);
        if (m) { const p = parseFloat(m[1]); if (p > bestPnl) bestPnl = p; }
      }

      if (bestPnl < MIN_MONTHLY_PNL) {
        console.log('❌ ' + s.name + ': ' + bestPnl.toFixed(2) + '% < ' + MIN_MONTHLY_PNL + '% threshold');
        git('checkout main'); git('branch -D ' + branch);
        continue;
      }

      console.log('✅ ' + s.name + ': ' + bestPnl.toFixed(2) + '% - Creating PR');
      git('push origin ' + branch);

      const bodyFile = join(__dirname, '.pr-body-tmp.md');
      writeFileSync(bodyFile, '## 🧬 ' + s.name + '\n\n' + s.description + '\n\nBest monthly: ' + bestPnl.toFixed(2) + '%\n\n```\n' + output.slice(-2000) + '\n```\n\n*Auto-generated*');
      gh('pr create --title "feat: add ' + s.name + ' (' + bestPnl.toFixed(1) + '% monthly)" --body-file "' + bodyFile + '" --base main');
      git('checkout main');
    } catch(e) {
      console.error('Error: ' + e.message);
      try { git('checkout main'); git('branch -D ' + branch); } catch(e2) {}
    }
  }
  console.log('\n🧬 Done');
}

main().catch(console.error);
