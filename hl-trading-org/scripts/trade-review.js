/**
 * Trade Review Script
 * 人間トレーダーの振り返りプロセスを自動化
 * 
 * 分析内容:
 * 1. 勝率・平均PnL
 * 2. 勝ちパターン・負けパターン
 * 3. 時間帯別成績
 * 4. 戦略別成績
 * 5. Confluence vs Single signal
 * 6. トレンド順張り vs 逆張り
 */

import { readFileSync, writeFileSync } from 'fs';

const HISTORY_PATH = 'C:/clawd/memory/hyperliquid/trade-history.json';
const LESSONS_PATH = 'C:/clawd/memory/hyperliquid/trade-lessons.md';

function analyze() {
  const trades = JSON.parse(readFileSync(HISTORY_PATH, 'utf8'));
  const closed = trades.filter(t => t.result === 'win' || t.result === 'loss');
  
  if (closed.length === 0) {
    console.log(JSON.stringify({ message: 'No closed trades to analyze', totalTrades: trades.length }));
    return;
  }

  const wins = closed.filter(t => t.result === 'win');
  const losses = closed.filter(t => t.result === 'loss');
  
  // Basic stats
  const stats = {
    total: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: (wins.length / closed.length * 100).toFixed(1) + '%',
    totalPnl: closed.reduce((s, t) => s + (t.pnl || 0), 0).toFixed(2),
    avgWin: wins.length > 0 ? (wins.reduce((s, t) => s + (t.pnl || 0), 0) / wins.length).toFixed(2) : 'N/A',
    avgLoss: losses.length > 0 ? (losses.reduce((s, t) => s + (t.pnl || 0), 0) / losses.length).toFixed(2) : 'N/A'
  };

  // Confluence vs Single
  const confluenceTrades = closed.filter(t => t.confluence);
  const singleTrades = closed.filter(t => !t.confluence);
  stats.confluenceWinRate = confluenceTrades.length > 0 
    ? (confluenceTrades.filter(t => t.result === 'win').length / confluenceTrades.length * 100).toFixed(1) + '%'
    : 'N/A';
  stats.singleWinRate = singleTrades.length > 0
    ? (singleTrades.filter(t => t.result === 'win').length / singleTrades.length * 100).toFixed(1) + '%'
    : 'N/A';

  // Trend alignment
  const withTrend = closed.filter(t => {
    if (!t.marketContext?.trend1h) return false;
    return (t.direction === 'LONG' && t.marketContext.trend1h !== 'SHORT') ||
           (t.direction === 'SHORT' && t.marketContext.trend1h !== 'LONG');
  });
  const againstTrend = closed.filter(t => {
    if (!t.marketContext?.trend1h) return false;
    return (t.direction === 'LONG' && t.marketContext.trend1h === 'SHORT') ||
           (t.direction === 'SHORT' && t.marketContext.trend1h === 'LONG');
  });
  stats.withTrendWinRate = withTrend.length > 0
    ? (withTrend.filter(t => t.result === 'win').length / withTrend.length * 100).toFixed(1) + '%'
    : 'N/A';
  stats.againstTrendWinRate = againstTrend.length > 0
    ? (againstTrend.filter(t => t.result === 'win').length / againstTrend.length * 100).toFixed(1) + '%'
    : 'N/A';
  stats.withTrendCount = withTrend.length;
  stats.againstTrendCount = againstTrend.length;

  // Strategy breakdown
  const strategyStats = {};
  for (const t of closed) {
    for (const s of (t.strategy || [])) {
      if (!strategyStats[s]) strategyStats[s] = { wins: 0, losses: 0, pnl: 0 };
      if (t.result === 'win') strategyStats[s].wins++;
      else strategyStats[s].losses++;
      strategyStats[s].pnl += (t.pnl || 0);
    }
  }
  stats.strategyBreakdown = strategyStats;

  // Confidence breakdown
  const highConf = closed.filter(t => t.confidence >= 65);
  const lowConf = closed.filter(t => t.confidence < 65);
  stats.highConfWinRate = highConf.length > 0
    ? (highConf.filter(t => t.result === 'win').length / highConf.length * 100).toFixed(1) + '%'
    : 'N/A';
  stats.lowConfWinRate = lowConf.length > 0
    ? (lowConf.filter(t => t.result === 'win').length / lowConf.length * 100).toFixed(1) + '%'
    : 'N/A';

  // Extract patterns
  const patterns = {
    winPatterns: [],
    lossPatterns: []
  };
  
  for (const t of wins) {
    patterns.winPatterns.push({
      strategy: t.strategy.join('+'),
      confluence: t.confluence,
      confidence: t.confidence,
      trendAlignment: t.marketContext?.trend1h !== (t.direction === 'LONG' ? 'SHORT' : 'LONG'),
      timeframe: t.timeframe
    });
  }
  
  for (const t of losses) {
    patterns.lossPatterns.push({
      strategy: t.strategy.join('+'),
      confluence: t.confluence,
      confidence: t.confidence,
      trendAlignment: t.marketContext?.trend1h !== (t.direction === 'LONG' ? 'SHORT' : 'LONG'),
      timeframe: t.timeframe,
      lesson: t.lesson
    });
  }

  console.log(JSON.stringify({ stats, patterns, lessons: losses.map(t => t.lesson).filter(Boolean) }, null, 2));
}

analyze();
