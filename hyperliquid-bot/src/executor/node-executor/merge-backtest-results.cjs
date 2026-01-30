#!/usr/bin/env node
/**
 * 既存のbacktest-results.jsonをstrategy-analysis.jsonにマージ
 * positionModeもパラメータバリエーションとして含める
 */

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = 'C:/clawd/memory/hyperliquid';
const BACKTEST_RESULTS = path.join(MEMORY_DIR, 'backtest-results.json');
const STRATEGY_ANALYSIS = path.join(MEMORY_DIR, 'strategy-analysis.json');

// Top N variations to keep per strategy/interval
const TOP_N = 5;

function loadJson(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function saveJson(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

function parseResult(result) {
  const { params, summary } = result;
  if (!params || !summary) return null;
  
  const strategy = params.strategy;
  const interval = params.interval;
  if (!strategy || !interval) return null;
  
  const pnl = parseFloat(summary.avgMonthlyPnl) || 0;
  const winRate = parseFloat(summary.avgWinRate) || 0;
  const expectedPnl = parseFloat(summary.avgExpectedPnl) || 0;
  const consistency = summary.consistency || '0%';
  
  // trades count from periodResults
  let trades = 0;
  if (result.periodResults && result.periodResults.length > 0) {
    trades = result.periodResults.reduce((sum, p) => sum + (p.trades || 0), 0);
  }
  
  return {
    strategy,
    interval,
    variation: {
      params: { ...params },
      pnl,
      winRate,
      expectedPnl,
      trades,
      consistency
    }
  };
}

function mergeIntoAnalysis(analysis, parsed) {
  const { strategy, interval, variation } = parsed;
  
  if (!analysis.strategies[strategy]) {
    analysis.strategies[strategy] = {};
  }
  if (!analysis.strategies[strategy][interval]) {
    analysis.strategies[strategy][interval] = {
      variations: [],
      best: null
    };
  }
  
  const entry = analysis.strategies[strategy][interval];
  
  // Check for duplicate (same params)
  const isDuplicate = entry.variations.some(v => {
    return JSON.stringify(v.params) === JSON.stringify(variation.params);
  });
  
  if (!isDuplicate) {
    entry.variations.push(variation);
  }
}

function sortAndTrimVariations(analysis) {
  for (const strategy of Object.keys(analysis.strategies)) {
    for (const interval of Object.keys(analysis.strategies[strategy])) {
      const entry = analysis.strategies[strategy][interval];
      
      // Sort by PnL descending
      entry.variations.sort((a, b) => b.pnl - a.pnl);
      
      // Keep top N
      entry.variations = entry.variations.slice(0, TOP_N);
      
      // Set best
      if (entry.variations.length > 0) {
        entry.best = entry.variations[0];
      }
    }
  }
}

// recommended は不要になった（手法ごとに判断するため）
// function updateRecommended(analysis) { ... }

function main() {
  console.log('Loading backtest-results.json...');
  const backtestResults = loadJson(BACKTEST_RESULTS);
  if (!backtestResults || !backtestResults.results) {
    console.error('Failed to load backtest-results.json');
    process.exit(1);
  }
  
  console.log(`Found ${backtestResults.results.length} results`);
  
  console.log('Loading strategy-analysis.json...');
  let analysis = loadJson(STRATEGY_ANALYSIS);
  if (!analysis) {
    analysis = { strategies: {}, recommended: {} };
  }
  
  const existingCount = Object.keys(analysis.strategies).reduce((sum, s) => {
    return sum + Object.keys(analysis.strategies[s]).reduce((sum2, i) => {
      return sum2 + (analysis.strategies[s][i].variations?.length || 0);
    }, 0);
  }, 0);
  console.log(`Existing variations in analysis: ${existingCount}`);
  
  // Merge each result
  let merged = 0;
  for (const result of backtestResults.results) {
    const parsed = parseResult(result);
    if (parsed) {
      mergeIntoAnalysis(analysis, parsed);
      merged++;
    }
  }
  console.log(`Merged ${merged} results`);
  
  // Sort and trim
  sortAndTrimVariations(analysis);
  
  // Save
  saveJson(STRATEGY_ANALYSIS, analysis);
  
  // Summary
  const newCount = Object.keys(analysis.strategies).reduce((sum, s) => {
    return sum + Object.keys(analysis.strategies[s]).reduce((sum2, i) => {
      return sum2 + (analysis.strategies[s][i].variations?.length || 0);
    }, 0);
  }, 0);
  console.log(`\nFinal variations in analysis: ${newCount}`);
  
  console.log('\nRecommended strategies:');
  for (const interval of ['1m', '5m', '15m', '1h']) {
    const rec = analysis.recommended[interval];
    if (rec && rec.length > 0) {
      console.log(`  ${interval}: ${rec.map(r => `${r.strategy} ${r.pnl.toFixed(1)}%`).join(', ')}`);
    }
  }
  
  console.log('\nDone!');
}

main();
