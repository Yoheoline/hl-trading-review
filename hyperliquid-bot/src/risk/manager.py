"""
Risk Manager - Position sizing and loss limits
"""
from typing import Dict, Any, Optional
from datetime import datetime, date
from dataclasses import dataclass, field

@dataclass
class DailyStats:
    date: date
    trades: int = 0
    wins: int = 0
    losses: int = 0
    pnl: float = 0.0
    consecutive_losses: int = 0

class RiskManager:
    def __init__(self, config: dict):
        self.config = config
        self.balance = 112.0  # Initial balance
        self.daily_stats = DailyStats(date=date.today())
        self.kill_switch_active = False
        
    def can_trade(self) -> bool:
        """Check if trading is allowed"""
        if self.kill_switch_active:
            return False
            
        # Check daily loss limit
        if self._check_daily_loss_limit():
            print("⚠️ Daily loss limit reached")
            self.kill_switch_active = True
            return False
            
        # Check consecutive losses
        if self._check_consecutive_losses():
            print("⚠️ Consecutive loss limit reached")
            self.kill_switch_active = True
            return False
            
        return True
    
    def calculate_position_size(self, signal) -> float:
        """Calculate position size based on risk parameters"""
        max_position_pct = self.config.get("max_position_pct", 0.3)
        max_loss_pct = self.config.get("max_loss_per_trade_pct", 0.05)
        max_leverage = self.config.get("max_leverage", 3)
        
        # Max position value
        max_position_value = self.balance * max_position_pct
        
        # Adjust by confidence
        confidence_adjusted = max_position_value * signal.confidence
        
        # Calculate size in BTC
        btc_size = confidence_adjusted / signal.entry_price
        
        # Apply leverage limit
        leveraged_size = btc_size * min(max_leverage, 2)  # Conservative start
        
        return round(leveraged_size, 6)
    
    def record_trade(self, trade: Dict[str, Any]):
        """Record trade result for risk tracking"""
        # Reset daily stats if new day
        if date.today() != self.daily_stats.date:
            self.daily_stats = DailyStats(date=date.today())
            self.kill_switch_active = False
        
        self.daily_stats.trades += 1
        
        pnl = trade.get("pnl", 0)
        self.daily_stats.pnl += pnl
        
        if pnl > 0:
            self.daily_stats.wins += 1
            self.daily_stats.consecutive_losses = 0
        else:
            self.daily_stats.losses += 1
            self.daily_stats.consecutive_losses += 1
    
    def _check_daily_loss_limit(self) -> bool:
        """Check if daily loss limit is breached"""
        max_daily_loss = self.balance * self.config.get("daily_loss_trigger_pct", 0.10)
        return self.daily_stats.pnl < -max_daily_loss
    
    def _check_consecutive_losses(self) -> bool:
        """Check consecutive loss limit"""
        max_consecutive = self.config.get("kill_switch", {}).get("consecutive_losses", 3)
        return self.daily_stats.consecutive_losses >= max_consecutive
    
    def get_stats(self) -> Dict[str, Any]:
        """Get current risk stats"""
        return {
            "balance": self.balance,
            "daily_pnl": self.daily_stats.pnl,
            "daily_trades": self.daily_stats.trades,
            "win_rate": self.daily_stats.wins / max(1, self.daily_stats.trades),
            "consecutive_losses": self.daily_stats.consecutive_losses,
            "kill_switch_active": self.kill_switch_active
        }
    
    def reset_kill_switch(self):
        """Manually reset kill switch"""
        self.kill_switch_active = False
        self.daily_stats.consecutive_losses = 0
        print("✅ Kill switch reset")
