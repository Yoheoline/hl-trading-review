#!/usr/bin/env node
/**
 * シグナルチェック - 指定時間軸のTop5手法でシグナルを確認（22戦略対応）
 * Usage: node check-signals.js <interval>
 * Example: node check-signals.js 1m
 */

import { readFileSync } from 'fs';

const API_URL = 'https://api.hyperliquid.xyz/info';
const ANALYSIS_PATH = 'C:/clawd/memory/hyperliquid/strategy-analysis.json';

const interval = process.argv[2];
if (!interval || !['1m', '5m', '15m', '1h'].includes(interval)) {
  console.error('Usage: node check-signals.js <1m|5m|15m|1h>');
  process.exit(1);
}

// キャンドル数の設定
const CANDLE_COUNTS = { '1m': 200, '5m': 200, '15m': 200, '1h': 200 };

async function fetchCandles(coin, interval, count) {
  const now = Date.now();
  const intervalMs = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000, '1d': 86400000 };
  const startTime = now - (count * (intervalMs[interval] || 3600000));
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval, startTime, endTime: now } })
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error(`⚠️ API error for ${coin}/${interval}: ${text.substring(0, 100)}`);
    return [];
  }
}

function getTop3Strategies(interval) {
  const analysis = JSON.parse(readFileSync(ANALYSIS_PATH));
  const results = [];
  for (const strategy of Object.keys(analysis.strategies)) {
    const entry = analysis.strategies[strategy]?.[interval];
    if (entry?.best && entry.best.pnl > 0) {
      results.push({ strategy, ...entry.best });
    }
  }
  results.sort((a, b) => b.pnl - a.pnl);
  return results.slice(0, 5);
}

function checkSignal(strategy, candles, params) {
  const prices = candles.map(c => parseFloat(c.c));
  const highs = candles.map(c => parseFloat(c.h));
  const lows = candles.map(c => parseFloat(c.l));
  const last = prices.length - 1;
  const price = prices[last];
  
  switch (strategy) {
    case 'momentum': {
      const window = params.momentumWindow || 5;
      const threshold = params.momentumThreshold || 0.002;
      if (last < window) return null;
      const change = (price - prices[last - window]) / prices[last - window];
      if (change > threshold) return { signal: 'LONG', reason: `momentum +${(change*100).toFixed(2)}% > ${(threshold*100).toFixed(2)}%` };
      if (change < -threshold) return { signal: 'SHORT', reason: `momentum ${(change*100).toFixed(2)}% < -${(threshold*100).toFixed(2)}%` };
      return null;
    }
    case 'rangeBounce': {
      const window = params.rangeWindow || 50;
      const zone = params.rangeBounceZone || 0.15;
      if (last < window) return null;
      const rangeHighs = highs.slice(last - window, last);
      const rangeLows = lows.slice(last - window, last);
      const high = Math.max(...rangeHighs);
      const low = Math.min(...rangeLows);
      const size = high - low;
      if (price < low + size * zone && price > prices[last - 1]) return { signal: 'LONG', reason: `bounce from range bottom (${low.toFixed(0)}-${high.toFixed(0)})` };
      if (price > high - size * zone && price < prices[last - 1]) return { signal: 'SHORT', reason: `bounce from range top (${low.toFixed(0)}-${high.toFixed(0)})` };
      return null;
    }
    case 'rsi': {
      const period = params.rsiPeriod || 14;
      const oversold = params.rsiOversold || 30;
      const overbought = params.rsiOverbought || 70;
      if (last < period + 1) return null;
      let gains = 0, losses = 0;
      for (let i = last - period; i <= last; i++) {
        const diff = prices[i] - prices[i-1];
        if (diff > 0) gains += diff; else losses -= diff;
      }
      const rs = gains / (losses || 0.0001);
      const rsi = 100 - (100 / (1 + rs));
      if (rsi < oversold) return { signal: 'LONG', reason: `RSI=${rsi.toFixed(1)} < ${oversold} (oversold)` };
      if (rsi > overbought) return { signal: 'SHORT', reason: `RSI=${rsi.toFixed(1)} > ${overbought} (overbought)` };
      return null;
    }
    case 'rsiMomentum': {
      const period = params.rsiPeriod || 14;
      const oversold = params.rsiOversold || 30;
      const overbought = params.rsiOverbought || 70;
      const momWindow = params.momentumWindow || 5;
      const momThreshold = params.momentumThreshold || 0.002;
      if (last < Math.max(period + 1, momWindow)) return null;
      // RSI
      let gains = 0, losses = 0;
      for (let i = last - period; i <= last; i++) {
        const diff = prices[i] - prices[i-1];
        if (diff > 0) gains += diff; else losses -= diff;
      }
      const rs = gains / (losses || 0.0001);
      const rsi = 100 - (100 / (1 + rs));
      // Momentum
      const change = (price - prices[last - momWindow]) / prices[last - momWindow];
      if (rsi < oversold && change > momThreshold) return { signal: 'LONG', reason: `RSI=${rsi.toFixed(1)} oversold + momentum +${(change*100).toFixed(2)}%` };
      if (rsi > overbought && change < -momThreshold) return { signal: 'SHORT', reason: `RSI=${rsi.toFixed(1)} overbought + momentum ${(change*100).toFixed(2)}%` };
      return null;
    }
    case 'maCross': {
      const fast = params.maFast || 9;
      const slow = params.maSlow || 21;
      if (last < slow + 1) return null;
      const maFastNow = prices.slice(last - fast + 1, last + 1).reduce((a,b) => a+b, 0) / fast;
      const maSlowNow = prices.slice(last - slow + 1, last + 1).reduce((a,b) => a+b, 0) / slow;
      const maFastPrev = prices.slice(last - fast, last).reduce((a,b) => a+b, 0) / fast;
      const maSlowPrev = prices.slice(last - slow, last).reduce((a,b) => a+b, 0) / slow;
      if (maFastPrev <= maSlowPrev && maFastNow > maSlowNow) return { signal: 'LONG', reason: `MA${fast} crossed above MA${slow}` };
      if (maFastPrev >= maSlowPrev && maFastNow < maSlowNow) return { signal: 'SHORT', reason: `MA${fast} crossed below MA${slow}` };
      return null;
    }
    case 'breakout': {
      const window = params.breakoutWindow || 20;
      if (last < window) return null;
      const high = Math.max(...highs.slice(last - window, last));
      const low = Math.min(...lows.slice(last - window, last));
      if (price > high) return { signal: 'LONG', reason: `breakout above ${high.toFixed(0)}` };
      if (price < low) return { signal: 'SHORT', reason: `breakout below ${low.toFixed(0)}` };
      return null;
    }
    case 'pivotBounce': {
      const lookback = params.pivotLookback || 48;
      const touchPct = params.pivotTouchPct || 0.002;
      if (last < lookback) return null;
      const high = Math.max(...highs.slice(last - lookback, last));
      const low = Math.min(...lows.slice(last - lookback, last));
      if (Math.abs(price - low) / low < touchPct && price > prices[last - 1]) return { signal: 'LONG', reason: `pivot bounce near support ${low.toFixed(0)}` };
      if (Math.abs(price - high) / high < touchPct && price < prices[last - 1]) return { signal: 'SHORT', reason: `pivot bounce near resistance ${high.toFixed(0)}` };
      return null;
    }
    case 'swingPoint': {
      const lookback = params.swingLookback || 5;
      const threshold = params.swingBounceThreshold || 0.003;
      if (last < lookback * 2 + 1) return null;
      // Find recent swing low/high
      let swingLow = Infinity, swingHigh = -Infinity;
      for (let i = last - lookback * 4; i <= last - lookback; i++) {
        if (i < 0) continue;
        let isLow = true, isHigh = true;
        for (let j = 1; j <= lookback; j++) {
          if (i - j >= 0 && lows[i] > lows[i-j]) isLow = false;
          if (i + j < prices.length && lows[i] > lows[i+j]) isLow = false;
          if (i - j >= 0 && highs[i] < highs[i-j]) isHigh = false;
          if (i + j < prices.length && highs[i] < highs[i+j]) isHigh = false;
        }
        if (isLow) swingLow = Math.min(swingLow, lows[i]);
        if (isHigh) swingHigh = Math.max(swingHigh, highs[i]);
      }
      if (swingLow < Infinity && (price - swingLow) / swingLow < threshold && price > prices[last-1]) return { signal: 'LONG', reason: `swing point bounce near ${swingLow.toFixed(0)}` };
      if (swingHigh > -Infinity && (swingHigh - price) / price < threshold && price < prices[last-1]) return { signal: 'SHORT', reason: `swing point bounce near ${swingHigh.toFixed(0)}` };
      return null;
    }
    case 'returnMove': {
      const window = params.returnMoveWindow || 20;
      const retestBars = params.returnMoveRetestBars || 5;
      const touchPct = params.returnMoveTouchPct || 0.005;
      if (last < window + retestBars) return null;
      const breakoutHigh = Math.max(...highs.slice(last - window - retestBars, last - retestBars));
      const breakoutLow = Math.min(...lows.slice(last - window - retestBars, last - retestBars));
      const recentHigh = Math.max(...highs.slice(last - retestBars, last + 1));
      if (recentHigh > breakoutHigh && Math.abs(price - breakoutHigh) / breakoutHigh < touchPct && price > prices[last-1]) {
        return { signal: 'LONG', reason: `return move to breakout level ${breakoutHigh.toFixed(0)}` };
      }
      const recentLow = Math.min(...lows.slice(last - retestBars, last + 1));
      if (recentLow < breakoutLow && Math.abs(price - breakoutLow) / breakoutLow < touchPct && price < prices[last-1]) {
        return { signal: 'SHORT', reason: `return move to breakout level ${breakoutLow.toFixed(0)}` };
      }
      return null;
    }
    case 'stochRsi': {
      const rsiP = params.srRsiPeriod || 14, stochP = params.srStochPeriod || 14;
      if (last < rsiP + stochP) return null;
      const rsis = [];
      for (let k = last - stochP; k <= last; k++) {
        let g=0, l=0;
        for (let j=k-rsiP; j<k; j++) { const d=prices[j+1]-prices[j]; if(d>0) g+=d; else l-=d; }
        rsis.push(100 - 100/(1 + g/(l||0.0001)));
      }
      const rH=Math.max(...rsis), rL=Math.min(...rsis);
      const sr = rH!==rL ? (rsis[rsis.length-1]-rL)/(rH-rL)*100 : 50;
      if (sr < (params.srOversold||20) && price > prices[last-1]) return { signal: 'LONG', reason: `StochRSI=${sr.toFixed(1)} oversold` };
      if (sr > (params.srOverbought||80) && price < prices[last-1]) return { signal: 'SHORT', reason: `StochRSI=${sr.toFixed(1)} overbought` };
      return null;
    }
    case 'supertrend': {
      const atrP = params.stAtrPeriod || 10, mult = params.stMultiplier || 3.0;
      if (last < atrP + 1) return null;
      let atrSum = 0;
      for (let j = last-atrP; j < last; j++) atrSum += Math.max(highs[j]-lows[j], Math.abs(highs[j]-prices[j-1]), Math.abs(lows[j]-prices[j-1]));
      const atr = atrSum/atrP, hl2 = (highs[last]+lows[last])/2;
      const ub = hl2+mult*atr, lb = hl2-mult*atr;
      if (price > ub) return { signal: 'LONG', reason: `Supertrend breakout above ${ub.toFixed(0)}` };
      if (price < lb) return { signal: 'SHORT', reason: `Supertrend breakdown below ${lb.toFixed(0)}` };
      return null;
    }
    case 'ichimokuCloud': {
      const tenP = params.ichiTenkan||9, kijP = params.ichiKijun||26, senP = params.ichiSenkou||52;
      if (last < senP) return null;
      const midHL = (s, len) => { let hi=-Infinity,lo=Infinity; for(let j=s;j<s+len&&j<=last;j++){hi=Math.max(hi,highs[j]);lo=Math.min(lo,lows[j]);} return (hi+lo)/2; };
      const tenkan=midHL(last-tenP+1,tenP), kijun=midHL(last-kijP+1,kijP);
      const sA=(tenkan+kijun)/2, sB=midHL(last-senP+1,senP);
      const cTop=Math.max(sA,sB), cBot=Math.min(sA,sB);
      if (price > cTop && prices[last-1] <= cTop) return { signal: 'LONG', reason: `Ichimoku cloud breakout above ${cTop.toFixed(0)}` };
      if (price < cBot && prices[last-1] >= cBot) return { signal: 'SHORT', reason: `Ichimoku cloud breakdown below ${cBot.toFixed(0)}` };
      return null;
    }
    case 'donchianBreakout': {
      const period = params.donchianPeriod || 20;
      if (last < period) return null;
      const upper = Math.max(...highs.slice(last-period, last));
      const lower = Math.min(...lows.slice(last-period, last));
      if (price > upper) return { signal: 'LONG', reason: `Donchian breakout above ${upper.toFixed(0)}` };
      if (price < lower) return { signal: 'SHORT', reason: `Donchian breakdown below ${lower.toFixed(0)}` };
      return null;
    }
    case 'keltnerChannel': {
      const emaP = params.kcEmaPeriod||20, atrP = params.kcAtrPeriod||10;
      if (last < Math.max(emaP,atrP)+1) return null;
      const k = 2/(emaP+1); let ema = prices[0];
      for (let j=1;j<=last;j++) ema = prices[j]*k+ema*(1-k);
      let atrSum=0; for(let j=last-atrP;j<last;j++) atrSum+=Math.max(highs[j]-lows[j],Math.abs(highs[j]-prices[j-1]),Math.abs(lows[j]-prices[j-1]));
      const atr=atrSum/atrP, m=params.kcAtrMult||1.5;
      if (price > ema+m*atr && price>prices[last-1]) return { signal: 'LONG', reason: `Keltner breakout (EMA=${ema.toFixed(0)})` };
      if (price < ema-m*atr && price<prices[last-1]) return { signal: 'SHORT', reason: `Keltner breakdown (EMA=${ema.toFixed(0)})` };
      return null;
    }
    case 'williamsR': {
      const period = params.wrPeriod||14;
      if (last < period) return null;
      const hh=Math.max(...highs.slice(last-period+1,last+1)), ll=Math.min(...lows.slice(last-period+1,last+1));
      const wr = hh!==ll ? ((hh-price)/(hh-ll))*-100 : -50;
      if (wr < (params.wrOversold||-80) && price>prices[last-1]) return { signal: 'LONG', reason: `Williams %R=${wr.toFixed(1)} oversold` };
      if (wr > (params.wrOverbought||-20) && price<prices[last-1]) return { signal: 'SHORT', reason: `Williams %R=${wr.toFixed(1)} overbought` };
      return null;
    }
    case 'bbSqueeze': {
      const period=params.bbPeriod||20, stdM=params.bbStdDev||2.0, sqTh=params.bbSqueezeThreshold||0.02;
      if (last < period*2) return null;
      const sl=prices.slice(last-period,last+1), sma=sl.reduce((a,b)=>a+b,0)/sl.length;
      const std=Math.sqrt(sl.reduce((s,v)=>s+(v-sma)**2,0)/sl.length);
      const u=sma+stdM*std, l2=sma-stdM*std, bw=(u-l2)/sma;
      const ps=prices.slice(last-period-1,last), pSma=ps.reduce((a,b)=>a+b,0)/ps.length;
      const pStd=Math.sqrt(ps.reduce((s,v)=>s+(v-pSma)**2,0)/ps.length);
      const pBw=((pSma+stdM*pStd)-(pSma-stdM*pStd))/pSma;
      if (pBw < sqTh && bw > pBw*1.1) {
        if (price > u) return { signal: 'LONG', reason: `BB squeeze breakout above ${u.toFixed(0)}` };
        if (price < l2) return { signal: 'SHORT', reason: `BB squeeze breakdown below ${l2.toFixed(0)}` };
      }
      return null;
    }
    case 'vwapBounce': {
      const period=params.vwapPeriod||50, bz=params.vwapBounceZone||0.002;
      if (last < period) return null;
      let sumPV=0, sumV=0;
      for(let j=last-period;j<=last;j++){const t=(highs[j]+lows[j]+prices[j])/3,v=highs[j]-lows[j];sumPV+=t*v;sumV+=v;}
      const vwap=sumPV/sumV, dist=(price-vwap)/vwap;
      if (Math.abs(dist)<bz) {
        if (price>prices[last-1]&&price>vwap) return { signal: 'LONG', reason: `VWAP bounce (VWAP=${vwap.toFixed(0)})` };
        if (price<prices[last-1]&&price<vwap) return { signal: 'SHORT', reason: `VWAP rejection (VWAP=${vwap.toFixed(0)})` };
      }
      return null;
    }
    case 'macdDivergence': {
      const fL=params.macdFast||12, sL=params.macdSlow||26, dW=params.macdDivWindow||10;
      if (last < sL+dW+10) return null;
      const ema=(d,len)=>{const k=2/(len+1);let e=d[0];for(let j=1;j<d.length;j++)e=d[j]*k+e*(1-k);return e;};
      const hNow=ema(prices.slice(0,last+1).slice(-fL*3),fL)-ema(prices.slice(0,last+1).slice(-sL*3),sL);
      const hPrev=ema(prices.slice(0,last-dW+1).slice(-fL*3),fL)-ema(prices.slice(0,last-dW+1).slice(-sL*3),sL);
      if (price<prices[last-dW]&&hNow>hPrev&&price>prices[last-1]) return { signal: 'LONG', reason: 'MACD bullish divergence' };
      if (price>prices[last-dW]&&hNow<hPrev&&price<prices[last-1]) return { signal: 'SHORT', reason: 'MACD bearish divergence' };
      return null;
    }
    case 'obvDivergence': {
      const dW=params.obvDivWindow||10;
      if (last < dW+1) return null;
      let obv=[0]; for(let j=1;j<=last;j++){const r=highs[j]-lows[j];if(prices[j]>prices[j-1])obv.push(obv[obv.length-1]+r);else if(prices[j]<prices[j-1])obv.push(obv[obv.length-1]-r);else obv.push(obv[obv.length-1]);}
      if (price<prices[last-dW]&&obv[obv.length-1]>obv[obv.length-1-dW]&&price>prices[last-1]) return { signal: 'LONG', reason: 'OBV bullish divergence' };
      if (price>prices[last-dW]&&obv[obv.length-1]<obv[obv.length-1-dW]&&price<prices[last-1]) return { signal: 'SHORT', reason: 'OBV bearish divergence' };
      return null;
    }
    case 'emaCrossRsi': {
      const fL=params.ecFastEma||8,sL=params.ecSlowEma||21,rP=params.ecRsiPeriod||14,rF=params.ecRsiFilter||45;
      if (last < Math.max(sL,rP)+2) return null;
      const ema=(d,len)=>{const k=2/(len+1);let e=d[0];for(let j=1;j<d.length;j++)e=d[j]*k+e*(1-k);return e;};
      const fN=ema(prices.slice(0,last+1).slice(-fL*3),fL), fP=ema(prices.slice(0,last).slice(-fL*3),fL);
      const sN=ema(prices.slice(0,last+1).slice(-sL*3),sL), sP=ema(prices.slice(0,last).slice(-sL*3),sL);
      let g=0,l=0;for(let j=last-rP;j<last;j++){const d=prices[j+1]-prices[j];if(d>0)g+=d;else l-=d;}
      const rsi=100-100/(1+g/(l||0.0001));
      if (fP<=sP&&fN>sN&&rsi>rF) return { signal: 'LONG', reason: `EMA cross + RSI=${rsi.toFixed(1)}` };
      if (fP>=sP&&fN<sN&&rsi<(100-rF)) return { signal: 'SHORT', reason: `EMA cross + RSI=${rsi.toFixed(1)}` };
      return null;
    }
    case 'atrBreakout': {
      const atrP=params.atrBoPeriod||14,atrM=params.atrBoMultiplier||1.5,lb=params.atrBoLookback||20;
      if (last < Math.max(atrP,lb)+1) return null;
      let atrS=0;for(let j=last-atrP;j<last;j++) atrS+=Math.max(highs[j]-lows[j],Math.abs(highs[j]-prices[j-1]),Math.abs(lows[j]-prices[j-1]));
      const atr=atrS/atrP,mid=prices.slice(last-lb,last).reduce((a,b)=>a+b,0)/lb;
      if (price>mid+atr*atrM&&price>prices[last-1]) return { signal: 'LONG', reason: `ATR breakout above ${(mid+atr*atrM).toFixed(0)}` };
      if (price<mid-atr*atrM&&price<prices[last-1]) return { signal: 'SHORT', reason: `ATR breakdown below ${(mid-atr*atrM).toFixed(0)}` };
      return null;
    }
    case 'linearRegression': {
      const period=params.lrPeriod||30,dM=params.lrDevMult||2.0;
      if (last < period) return null;
      const sl=prices.slice(last-period+1,last+1),n=sl.length;
      let sX=0,sY=0,sXY=0,sX2=0;
      for(let j=0;j<n;j++){sX+=j;sY+=sl[j];sXY+=j*sl[j];sX2+=j*j;}
      const slope=(n*sXY-sX*sY)/(n*sX2-sX*sX),inter=(sY-slope*sX)/n;
      const pred=inter+slope*(n-1);
      let dS=0;for(let j=0;j<n;j++){const d=sl[j]-(inter+slope*j);dS+=d*d;}
      const std=Math.sqrt(dS/n);
      if (price<pred-dM*std&&price>prices[last-1]) return { signal: 'LONG', reason: `LinReg bounce from lower band ${(pred-dM*std).toFixed(0)}` };
      if (price>pred+dM*std&&price<prices[last-1]) return { signal: 'SHORT', reason: `LinReg rejection at upper band ${(pred+dM*std).toFixed(0)}` };
      return null;
    }
    default:
      return null;
  }
}

// ====== Multi-Timeframe Analysis ======

// 時間軸の階層（下位→上位）
const TF_HIERARCHY = ['1m', '5m', '15m', '1h', '4h', '1d'];

// 対象時間軸に対する上位足を返す
function getHigherTimeframes(tf) {
  const idx = TF_HIERARCHY.indexOf(tf);
  if (idx === -1) return [];
  // 1つ上と2つ上を返す（最大2つ）
  return TF_HIERARCHY.slice(idx + 1, idx + 3);
}

// 対象時間軸に対する下位足を返す
function getLowerTimeframe(tf) {
  const idx = TF_HIERARCHY.indexOf(tf);
  if (idx <= 0) return null;
  return TF_HIERARCHY[idx - 1];
}

// 特定時間軸のトレンド+シグナルを分析
async function analyzeTimeframe(tf) {
  const candles = await fetchCandles('BTC', tf, 200);
  if (!candles || candles.length < 50) return null;
  
  const prices = candles.map(c => parseFloat(c.c));
  const highs = candles.map(c => parseFloat(c.h));
  const lows = candles.map(c => parseFloat(c.l));
  const last = prices.length - 1;
  const price = prices[last];
  
  // EMA20 trend
  const ema20 = calcEMA(prices, 20);
  const momentum = (price - prices[Math.max(0, last - 5)]) / prices[Math.max(0, last - 5)] * 100;
  
  // RSI
  let gains = 0, losses = 0;
  for (let i = Math.max(1, last - 14); i <= last; i++) {
    const diff = prices[i] - prices[i-1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const rsi = 100 - (100 / (1 + gains / (losses || 0.0001)));
  
  let trend;
  if (price > ema20 && momentum > 0.5) trend = 'STRONG_UP';
  else if (price > ema20) trend = 'UP';
  else if (price < ema20 && momentum < -0.5) trend = 'STRONG_DOWN';
  else if (price < ema20) trend = 'DOWN';
  else trend = 'NEUTRAL';
  
  // Top5戦略のシグナルチェック
  const top = getTop3Strategies(tf);
  const signals = [];
  for (const s of top) {
    const result = checkSignal(s.strategy, candles, s.params || {});
    if (result) signals.push({ ...result, strategy: s.strategy, pnl: s.pnl });
  }
  
  const longs = signals.filter(s => s.signal === 'LONG').length;
  const shorts = signals.filter(s => s.signal === 'SHORT').length;
  
  // この時間軸の方向性
  let bias = 'NEUTRAL';
  if (longs > shorts && longs >= 1) bias = longs >= 2 ? 'STRONG_LONG' : 'LONG';
  if (shorts > longs && shorts >= 1) bias = shorts >= 2 ? 'STRONG_SHORT' : 'SHORT';
  
  return { tf, trend, bias, momentum: momentum.toFixed(2), rsi: rsi.toFixed(1), ema20: ema20.toFixed(0), price: price.toFixed(2), signals, longs, shorts, topCount: top.length };
}

function calcEMA(prices, period) {
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a,b) => a+b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

// コンフルエンススコア計算
function calcConfluence(primary, htfResults) {
  let score = 0;
  const direction = primary.longs > primary.shorts ? 'LONG' : primary.shorts > primary.longs ? 'SHORT' : null;
  if (!direction) return { score: 0, direction: null, details: [] };
  
  const details = [];
  
  // 自分の時間軸のシグナル数
  const ownSignals = direction === 'LONG' ? primary.longs : primary.shorts;
  score += ownSignals * 20; // 各シグナル20点
  details.push(`${primary.tf}: ${ownSignals} ${direction} signal(s) (+${ownSignals * 20})`);
  
  // 上位足の評価
  for (const htf of htfResults) {
    if (!htf) continue;
    const htfDir = htf.bias.includes('LONG') ? 'LONG' : htf.bias.includes('SHORT') ? 'SHORT' : null;
    const htfTrend = htf.trend.includes('UP') ? 'LONG' : htf.trend.includes('DOWN') ? 'SHORT' : null;
    
    if (htfDir === direction) {
      const pts = htf.bias.includes('STRONG') ? 30 : 15;
      score += pts;
      details.push(`${htf.tf} bias: ${htf.bias} (+${pts})`);
    } else if (htfDir && htfDir !== direction) {
      score -= 25;
      details.push(`${htf.tf} bias: ${htf.bias} AGAINST (-25)`);
    }
    
    if (htfTrend === direction) {
      score += 10;
      details.push(`${htf.tf} trend: ${htf.trend} (+10)`);
    } else if (htfTrend && htfTrend !== direction) {
      score -= 15;
      details.push(`${htf.tf} trend: ${htf.trend} AGAINST (-15)`);
    }
  }
  
  return { score, direction, details };
}

async function main() {
  console.log(`\n📊 MTF Signal Check: ${interval}`);
  console.log('='.repeat(50));

  // 1. 上位足を分析
  const higherTFs = getHigherTimeframes(interval);
  const htfResults = [];
  for (const htf of higherTFs) {
    const result = await analyzeTimeframe(htf);
    htfResults.push(result);
    if (result) {
      const biasEmoji = result.bias.includes('LONG') ? '🟢' : result.bias.includes('SHORT') ? '🔴' : '⚪';
      console.log(`\n🔭 ${htf}: ${result.trend} ${biasEmoji} bias=${result.bias} (mom: ${result.momentum}%, RSI: ${result.rsi})`);
      if (result.signals.length > 0) {
        result.signals.forEach(s => console.log(`   ${s.signal === 'LONG' ? '🟢' : '🔴'} ${s.strategy}: ${s.reason}`));
      }
    }
  }
  
  // 2. 自分の時間軸を分析
  const primary = await analyzeTimeframe(interval);
  if (!primary) { console.log('No data for', interval); process.exit(0); }
  
  console.log(`\n📍 ${interval}: ${primary.trend} (mom: ${primary.momentum}%, RSI: ${primary.rsi})`);
  console.log(`BTC Price: $${primary.price}`);
  
  const top = getTop3Strategies(interval);
  if (top.length === 0) { console.log('No positive strategies'); process.exit(0); }
  
  console.log(`\nTop ${top.length} strategies:`);
  top.forEach((s, i) => {
    console.log(`  ${i+1}. ${s.strategy}/${s.params?.positionMode || 'basic'} +${s.pnl.toFixed(1)}%/月 (WR ${s.winRate.toFixed(1)}%)`);
  });
  
  // シグナル表示
  const candles = await fetchCandles('BTC', interval, 200);
  for (const s of top) {
    const result = checkSignal(s.strategy, candles, s.params || {});
    if (result) {
      console.log(`\n✅ ${s.strategy}: ${result.signal} - ${result.reason}`);
    } else {
      console.log(`\n❌ ${s.strategy}: no signal`);
    }
  }
  
  // 3. MTFコンフルエンス判定
  const confluence = calcConfluence(primary, htfResults);
  
  console.log('\n' + '='.repeat(50));
  console.log('🎯 MTF Confluence Analysis:');
  confluence.details.forEach(d => console.log(`  ${d}`));
  console.log(`\n  📊 Score: ${confluence.score}/100`);
  
  let recommendation;
  if (!confluence.direction || primary.signals.length === 0) {
    recommendation = '😴 NO SIGNAL - wait';
  } else if (confluence.score >= 60) {
    recommendation = `🔥 STRONG ${confluence.direction} (score ${confluence.score})`;
  } else if (confluence.score >= 30) {
    recommendation = `✅ ${confluence.direction} (score ${confluence.score})`;
  } else if (confluence.score > 0) {
    recommendation = `⚡ WEAK ${confluence.direction} (score ${confluence.score}) - small size only`;
  } else {
    recommendation = `🚫 ${confluence.direction} signal but HTF disagrees (score ${confluence.score}) - SKIP`;
  }
  
  console.log(`\n  ${recommendation}`);
  
  // JSON output for Cron parsers
  console.log(JSON.stringify({
    direction: confluence.direction,
    score: confluence.score,
    signals: primary.signals.map(s => s.strategy),
    htf: htfResults.filter(Boolean).map(h => ({ tf: h.tf, trend: h.trend, bias: h.bias })),
    price: parseFloat(primary.price),
    recommendation: recommendation.replace(/[^\w\s()-]/g, '').trim()
  }));
}

main().catch(console.error);
