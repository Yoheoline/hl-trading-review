"""
Learning Module - Self-reflection and strategy optimization
"""
import json
from typing import Dict, Any, List
from datetime import datetime
from pathlib import Path

class Reflector:
    def __init__(self, config: dict):
        self.config = config
        self.trades_dir = Path(__file__).parent.parent.parent / "memory" / "trades"
        self.reflections_dir = Path(__file__).parent.parent.parent / "memory" / "reflections"
        self.reflections_dir.mkdir(exist_ok=True)
        
        self.reflection_interval = config.get("reflection_interval", 5)
        self.min_trades = config.get("min_trades_for_analysis", 10)
        
    async def reflect(self):
        """Perform reflection on recent trades"""
        trades = self._load_recent_trades()
        
        if len(trades) < self.reflection_interval:
            return
        
        recent = trades[-self.reflection_interval:]
        
        # Analyze recent performance
        analysis = self._analyze_trades(recent)
        
        # Generate insights
        insights = self._generate_insights(analysis, trades)
        
        # Create reflection report
        reflection = {
            "timestamp": datetime.now().isoformat(),
            "trades_analyzed": len(recent),
            "analysis": analysis,
            "insights": insights,
            "recommendations": self._generate_recommendations(analysis, insights)
        }
        
        # Save reflection
        self._save_reflection(reflection)
        
        # Print summary
        self._print_summary(reflection)
        
        return reflection
    
    def _load_recent_trades(self, limit: int = 50) -> List[Dict]:
        """Load recent trades from memory"""
        trades = []
        for filepath in sorted(self.trades_dir.glob("*.json"))[-limit:]:
            with open(filepath) as f:
                trades.append(json.load(f))
        return trades
    
    def _analyze_trades(self, trades: List[Dict]) -> Dict[str, Any]:
        """Analyze trade performance"""
        wins = [t for t in trades if t.get("pnl", 0) > 0]
        losses = [t for t in trades if t.get("pnl", 0) < 0]
        
        total_pnl = sum(t.get("pnl", 0) for t in trades)
        
        # Analyze by signal type
        longs = [t for t in trades if t.get("type") == "long"]
        shorts = [t for t in trades if t.get("type") == "short"]
        
        # Analyze by reason/indicator
        reason_performance = {}
        for t in trades:
            for reason in t.get("reason", "").split("; "):
                if reason not in reason_performance:
                    reason_performance[reason] = {"trades": 0, "pnl": 0}
                reason_performance[reason]["trades"] += 1
                reason_performance[reason]["pnl"] += t.get("pnl", 0)
        
        return {
            "total_trades": len(trades),
            "wins": len(wins),
            "losses": len(losses),
            "win_rate": len(wins) / max(1, len(trades)),
            "total_pnl": total_pnl,
            "avg_pnl": total_pnl / max(1, len(trades)),
            "long_performance": {
                "count": len(longs),
                "pnl": sum(t.get("pnl", 0) for t in longs)
            },
            "short_performance": {
                "count": len(shorts),
                "pnl": sum(t.get("pnl", 0) for t in shorts)
            },
            "reason_performance": reason_performance
        }
    
    def _generate_insights(self, analysis: Dict, all_trades: List[Dict]) -> List[str]:
        """Generate insights from analysis"""
        insights = []
        
        # Win rate insight
        win_rate = analysis["win_rate"]
        if win_rate > 0.6:
            insights.append(f"Strong win rate ({win_rate:.1%}) - strategy is working well")
        elif win_rate < 0.4:
            insights.append(f"Low win rate ({win_rate:.1%}) - strategy needs adjustment")
        
        # Long vs Short
        long_pnl = analysis["long_performance"]["pnl"]
        short_pnl = analysis["short_performance"]["pnl"]
        if long_pnl > short_pnl * 2:
            insights.append("Long trades significantly outperforming shorts")
        elif short_pnl > long_pnl * 2:
            insights.append("Short trades significantly outperforming longs")
        
        # Best/worst indicators
        reason_perf = analysis["reason_performance"]
        if reason_perf:
            best = max(reason_perf.items(), key=lambda x: x[1]["pnl"] / max(1, x[1]["trades"]))
            worst = min(reason_perf.items(), key=lambda x: x[1]["pnl"] / max(1, x[1]["trades"]))
            
            if best[1]["pnl"] > 0:
                insights.append(f"Best performing signal: {best[0]}")
            if worst[1]["pnl"] < 0:
                insights.append(f"Worst performing signal: {worst[0]}")
        
        return insights
    
    def _generate_recommendations(self, analysis: Dict, insights: List[str]) -> List[Dict]:
        """Generate actionable recommendations"""
        recommendations = []
        
        # Win rate recommendations
        if analysis["win_rate"] < 0.4:
            recommendations.append({
                "type": "parameter",
                "target": "entry.confidence_threshold",
                "action": "increase",
                "reason": "Low win rate suggests being too aggressive on entries"
            })
        
        # Long/Short bias
        long_pnl = analysis["long_performance"]["pnl"]
        short_pnl = analysis["short_performance"]["pnl"]
        
        if long_pnl > 0 and short_pnl < 0:
            recommendations.append({
                "type": "strategy",
                "action": "bias_long",
                "reason": "Shorts are losing money, consider long-only mode"
            })
        elif short_pnl > 0 and long_pnl < 0:
            recommendations.append({
                "type": "strategy",
                "action": "bias_short",
                "reason": "Longs are losing money, consider short-only mode"
            })
        
        return recommendations
    
    def _save_reflection(self, reflection: Dict):
        """Save reflection to file"""
        filename = datetime.now().strftime("%Y%m%d_%H%M%S") + ".json"
        filepath = self.reflections_dir / filename
        
        with open(filepath, "w") as f:
            json.dump(reflection, f, indent=2)
    
    def _print_summary(self, reflection: Dict):
        """Print reflection summary"""
        print("\n" + "="*50)
        print("🧠 REFLECTION SUMMARY")
        print("="*50)
        
        analysis = reflection["analysis"]
        print(f"Trades: {analysis['total_trades']} | Win Rate: {analysis['win_rate']:.1%}")
        print(f"PnL: ${analysis['total_pnl']:.2f}")
        
        print("\n📊 Insights:")
        for insight in reflection["insights"]:
            print(f"  • {insight}")
        
        print("\n💡 Recommendations:")
        for rec in reflection["recommendations"]:
            print(f"  • [{rec['type']}] {rec['action']}: {rec['reason']}")
        
        print("="*50 + "\n")
