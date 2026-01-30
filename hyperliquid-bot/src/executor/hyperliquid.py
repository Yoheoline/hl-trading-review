"""
Hyperliquid Executor - Uses Node.js bridge for signed operations
"""
import subprocess
import json
import re
from pathlib import Path
from typing import Optional, Dict, Any
from dataclasses import dataclass

@dataclass
class TradeResult:
    success: bool
    order_id: Optional[int]
    filled_size: float
    avg_price: float
    side: str
    coin: str
    error: Optional[str] = None

class HyperliquidExecutor:
    def __init__(self, mode: str = "paper"):
        self.mode = mode
        self.node_executor_dir = Path(__file__).parent / "node-executor"
        self.executor_script = self.node_executor_dir / "executor.js"
        self._verify_setup()
        
    def _verify_setup(self):
        if not (self.node_executor_dir / "node_modules").exists():
            raise RuntimeError(
                f"Node modules not installed. Run: cd {self.node_executor_dir} && npm install"
            )
    
    def _run_node(self, *args) -> Dict[str, Any]:
        cmd = ["node", str(self.executor_script)] + [str(a) for a in args]
        result = subprocess.run(
            cmd, capture_output=True, text=True,
            cwd=str(self.node_executor_dir), timeout=30
        )
        
        output = result.stdout.strip()
        
        # Find JSON object in output (skip WebSocket logs)
        json_match = re.search(r'(\{[\s\S]*\}|\[[\s\S]*\])(?=\s*(?:WebSocket|$))', output)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass
        
        # Try parsing the whole output
        try:
            return json.loads(output)
        except:
            pass
        
        # Try each line
        for line in output.split('\n'):
            line = line.strip()
            if line.startswith('{') or line.startswith('['):
                try:
                    return json.loads(line)
                except:
                    continue
        
        return {"error": result.stderr or output or "No output"}
    
    # === Trading Operations ===
    
    def market_open(self, coin: str, size: float, is_buy: bool, slippage: float = 0.01) -> TradeResult:
        if self.mode == "paper":
            return self._paper_trade(coin, size, is_buy)
        
        result = self._run_node("market_open", coin, size, str(is_buy).lower(), slippage)
        return self._parse_order_result(result, coin, "buy" if is_buy else "sell")
    
    def market_close(self, coin: str, size: Optional[float] = None, slippage: float = 0.01) -> TradeResult:
        if self.mode == "paper":
            return TradeResult(success=True, order_id=0, filled_size=size or 0, 
                             avg_price=0, side="close", coin=coin)
        
        args = ["market_close", coin]
        if size:
            args.extend([size, slippage])
        result = self._run_node(*args)
        return self._parse_order_result(result, coin, "close")
    
    def limit_order(self, coin: str, size: float, price: float, is_buy: bool) -> TradeResult:
        if self.mode == "paper":
            return self._paper_trade(coin, size, is_buy, price)
        
        cmd = "buy" if is_buy else "sell"
        result = self._run_node(cmd, coin, size, price)
        return self._parse_order_result(result, coin, cmd)
    
    def cancel_order(self, coin: str, order_id: int) -> bool:
        if self.mode == "paper":
            return True
        result = self._run_node("cancel", coin, order_id)
        return result.get("success", False)
    
    def cancel_all(self, coin: Optional[str] = None) -> bool:
        if self.mode == "paper":
            return True
        args = ["cancel_all"]
        if coin:
            args.append(coin)
        result = self._run_node(*args)
        return result.get("success", False)
    
    # === Info Operations ===
    
    def get_balance(self) -> Dict[str, float]:
        result = self._run_node("balance")
        if "error" in result:
            return {"accountValue": 0, "totalMarginUsed": 0, "withdrawable": 0}
        return result
    
    def get_position(self, coin: Optional[str] = None) -> Any:
        args = ["position"]
        if coin:
            args.append(coin)
        return self._run_node(*args)
    
    def get_price(self, coin: str) -> float:
        result = self._run_node("price", coin)
        return float(result.get("price", 0))
    
    # === Helpers ===
    
    def _parse_order_result(self, result: Dict, coin: str, side: str) -> TradeResult:
        if "error" in result:
            return TradeResult(success=False, order_id=None, filled_size=0,
                             avg_price=0, side=side, coin=coin, error=result["error"])
        
        if result.get("success"):
            data = result.get("order", {}).get("response", {}).get("data", {})
            statuses = data.get("statuses", [{}])
            filled = statuses[0].get("filled", {})
            
            return TradeResult(
                success=True,
                order_id=filled.get("oid"),
                filled_size=float(filled.get("totalSz", 0)),
                avg_price=float(filled.get("avgPx", 0)),
                side=side,
                coin=coin
            )
        
        return TradeResult(success=False, order_id=None, filled_size=0,
                         avg_price=0, side=side, coin=coin, error="Unknown error")
    
    def _paper_trade(self, coin: str, size: float, is_buy: bool, price: float = None) -> TradeResult:
        if not price:
            price = self.get_price(coin)
        return TradeResult(
            success=True, order_id=0, filled_size=size,
            avg_price=price, side="buy" if is_buy else "sell", coin=coin
        )
    
    # === Signal-based execution ===
    
    async def execute(self, signal, size: float) -> Optional[Dict]:
        from strategy.engine import SignalType
        
        if signal.type == SignalType.NONE:
            return None
        
        coin = "BTC"
        is_buy = signal.type == SignalType.LONG
        
        if signal.type == SignalType.CLOSE:
            result = self.market_close(coin)
        else:
            result = self.market_open(coin, size, is_buy)
        
        if result.success:
            return {
                "coin": coin,
                "side": result.side,
                "size": result.filled_size,
                "price": result.avg_price,
                "order_id": result.order_id,
                "pnl": 0
            }
        
        print(f"Order failed: {result.error}")
        return None