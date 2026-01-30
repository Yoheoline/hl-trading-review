"""
Strategy Engine - Signal generation with real indicators
"""
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from enum import Enum
from datetime import datetime
import numpy as np

class SignalType(Enum):
    LONG = "long"
    SHORT = "short"
    CLOSE = "close"
    NONE = "none"

@dataclass
class Signal:
    type: SignalType
    confidence: float
    reason: str
    entry_price: float
    stop_loss: float
    take_profit: float
    timestamp: str

class StrategyEngine:
    def __init__(self, config: dict):
        self.config = config
        self.entry_config = config.get("entry", {})
        self.risk_config = config.get("risk", {})
        
    def analyze(self, data: Dict[str, Any]) -> Optional[Signal]:
        candles = data.get("candles", [])
        if len(candles) < 20:
            return None
        
        closes = [float(c.get('c', c.get('close', 0))) for c in candles]
        volumes = [float(c.get('v', c.get('volume', 0))) for c in candles]
        
        # Calculate indicators
        rsi = self._calculate_rsi(closes)
        sma_fast, sma_slow = self._calculate_sma(closes)
        volume_spike = self._check_volume_spike(volumes)
        
        # Generate score
        score = self._combine_signals(rsi, sma_fast, sma_slow, volume_spike)
        
        threshold = self.entry_config.get("min_confidence", 0.5)
        if abs(score) < threshold:
            return None
        
        signal_type = SignalType.LONG if score > 0 else SignalType.SHORT
        price = float(data.get("price", closes[-1]))
        
        return Signal(
            type=signal_type,
            confidence=min(abs(score), 1.0),
            reason=self._generate_reason(rsi, sma_fast > sma_slow, volume_spike, score),
            entry_price=price,
            stop_loss=self._calculate_stop_loss(price, signal_type),
            take_profit=self._calculate_take_profit(price, signal_type),
            timestamp=datetime.now().isoformat()
        )
    
    def _calculate_rsi(self, closes: List[float], period: int = 14) -> float:
        if len(closes) < period + 1:
            return 50.0
        
        deltas = np.diff(closes[-period-1:])
        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)
        
        avg_gain = np.mean(gains)
        avg_loss = np.mean(losses)
        
        if avg_loss == 0:
            return 100.0
        
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))
    
    def _calculate_sma(self, closes: List[float]) -> tuple:
        fast_period = self.entry_config.get("sma_fast", 9)
        slow_period = self.entry_config.get("sma_slow", 21)
        
        if len(closes) < slow_period:
            return 0, 0
        
        sma_fast = np.mean(closes[-fast_period:])
        sma_slow = np.mean(closes[-slow_period:])
        
        return sma_fast, sma_slow
    
    def _check_volume_spike(self, volumes: List[float], threshold: float = 1.5) -> bool:
        if len(volumes) < 20:
            return False
        
        avg_volume = np.mean(volumes[-20:-1])
        current_volume = volumes[-1]
        
        return current_volume > avg_volume * threshold
    
    def _combine_signals(self, rsi: float, sma_fast: float, sma_slow: float, volume_spike: bool) -> float:
        score = 0.0
        
        # RSI signal
        rsi_oversold = self.entry_config.get("rsi_oversold", 30)
        rsi_overbought = self.entry_config.get("rsi_overbought", 70)
        
        if rsi < rsi_oversold:
            score += 0.4 * (rsi_oversold - rsi) / rsi_oversold
        elif rsi > rsi_overbought:
            score -= 0.4 * (rsi - rsi_overbought) / (100 - rsi_overbought)
        
        # MA crossover
        if sma_fast > 0 and sma_slow > 0:
            ma_diff = (sma_fast - sma_slow) / sma_slow
            score += ma_diff * 10  # Scale
        
        # Volume confirmation
        if volume_spike:
            score *= 1.3
        
        return max(-1, min(1, score))
    
    def _generate_reason(self, rsi: float, ma_bullish: bool, volume_spike: bool, score: float) -> str:
        reasons = []
        
        if rsi < 30:
            reasons.append(f"RSI oversold ({rsi:.1f})")
        elif rsi > 70:
            reasons.append(f"RSI overbought ({rsi:.1f})")
        else:
            reasons.append(f"RSI neutral ({rsi:.1f})")
        
        reasons.append("MA bullish" if ma_bullish else "MA bearish")
        
        if volume_spike:
            reasons.append("Volume spike")
        
        reasons.append(f"Score: {score:.2f}")
        
        return " | ".join(reasons)
    
    def _calculate_stop_loss(self, price: float, signal_type: SignalType) -> float:
        sl_pct = self.risk_config.get("stop_loss_pct", 0.02)
        if signal_type == SignalType.LONG:
            return price * (1 - sl_pct)
        return price * (1 + sl_pct)
    
    def _calculate_take_profit(self, price: float, signal_type: SignalType) -> float:
        tp_pct = self.risk_config.get("take_profit_pct", 0.03)
        if signal_type == SignalType.LONG:
            return price * (1 + tp_pct)
        return price * (1 - tp_pct)
