module.exports = {
  apps: [
    {
      name: 'bot-live',
      script: 'bot.js',
      cwd: 'C:/Users/藤田　洋平/Projects/hyperliquid-bot/src/executor/node-executor',
      args: '--strategy=strategy.json',
      interpreter: 'node'
    },
    {
      name: 'bot-paper-momentum',
      script: 'bot.js', 
      cwd: 'C:/Users/藤田　洋平/Projects/hyperliquid-bot/src/executor/node-executor',
      args: '--strategy=strategy-momentum.json',
      interpreter: 'node'
    },
    {
      name: 'bot-paper-breakout',
      script: 'bot.js',
      cwd: 'C:/Users/藤田　洋平/Projects/hyperliquid-bot/src/executor/node-executor', 
      args: '--strategy=strategy-breakout.json',
      interpreter: 'node'
    }
  ]
};
