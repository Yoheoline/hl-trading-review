"""
Python bridge to Node.js Hyperliquid executor
Handles order execution via subprocess calls
"""
import subprocess
import json
import os
from pathlib import Path
from typing import Optional, Dict, Any, Union

class NodeExecutor:
    """Bridge to Node.js executor for signed Hyperliquid operations"""
    
    def __init__(self):
        self.executor_dir = Path(__file__).parent / 'node-executor'
        self.executor_script = self.executor_dir / 'executor.js'
        self._check_setup()
    
    def _check_setup(self):
        """Verify Node.js executor is installed"""
        node_modules = self.executor_dir / 'node_modules'
        if not node_modules.exists():
            raise RuntimeError(
                f"Node modules not installed. Run: cd {self.executor_dir} && npm install"
            )
    
    def _run(self, *args) -> Dict[str, Any]:
        """Execute Node.js command and return JSON result"""
        cmd = ['node', str(self.executor_script)] + list(args)
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=str(self.executor_dir),
            timeout=30
        )
        
        if result.returncode != 0:
            error_msg = result.stderr or result.stdout
            return {'error': f'Executor failed: {error_msg}'}
        
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError:
            return {'error': f'Invalid JSON response: {result.stdout}'}
    
    # ========== Trading Operations ==========
    
    def buy(self, coin: str, size: float, limit_price: Optional[float] = None) -> Dict:
        """Place a buy order (market or limit)"""
        args = ['buy', coin, str(size)]
        if limit_price:
            args.append(str(limit_price))
        return self._run(*args)
    
    def sell(self, coin: str, size: float, limit_price: Optional[float] = None) -> Dict:
        """Place a sell order (market or limit)"""
        args = ['sell', coin, str(size)]
        if limit_price:
            args.append(str(limit_price))
        return self._run(*args)
    
    def cancel(self, coin: str, order_id: Union[str, int]) -> Dict:
        """Cancel a specific order"""
        return self._run('cancel', coin, str(order_id))
    
    def cancel_all(self, coin: Optional[str] = None) -> Dict:
        """Cancel all orders, optionally for a specific coin"""
        args = ['cancel_all']
        if coin:
            args.append(coin)
        return self._run(*args)
    
    # ========== Account Operations ==========
    
    def get_position(self, coin: Optional[str] = None) -> Dict:
        """Get current position(s)"""
        args = ['position']
        if coin:
            args.append(coin)
        return self._run(*args)
    
    def get_balance(self) -> Dict:
        """Get account balance info"""
        return self._run('balance')
    
    def test_connection(self) -> Dict:
        """Test API connection and return BTC price"""
        return self._run('test')


# Quick test
if __name__ == "__main__":
    try:
        executor = NodeExecutor()
        print("Testing Node.js executor connection...")
        result = executor.test_connection()
        print(json.dumps(result, indent=2))
    except RuntimeError as e:
        print(f"Setup required: {e}")
