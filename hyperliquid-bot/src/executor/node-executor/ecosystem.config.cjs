module.exports = {
  apps: [
    {
      name: 'bot-swing',
      script: 'bot.js',
      args: '--strategy=strategy-swing.json',
      cwd: 'C:/Users/藤田　洋平/Projects/hyperliquid-bot/src/executor/node-executor'
    },
    {
      name: 'bot-daytrade',
      script: 'bot.js',
      args: '--strategy=strategy-daytrade.json',
      cwd: 'C:/Users/藤田　洋平/Projects/hyperliquid-bot/src/executor/node-executor'
    },
    {
      name: 'bot-scalp',
      script: 'bot.js',
      args: '--strategy=strategy-scalp.json',
      cwd: 'C:/Users/藤田　洋平/Projects/hyperliquid-bot/src/executor/node-executor'
    },
    {
      name: 'bot-ultrascalp',
      script: 'bot.js',
      args: '--strategy=strategy-ultrascalp.json',
      cwd: 'C:/Users/藤田　洋平/Projects/hyperliquid-bot/src/executor/node-executor'
    }
  ]
};
