module.exports = {
  apps: [{
    name: "hyperliquid-bot",
    script: "run.py",
    cwd: "./src",
    interpreter: "C:\\Users\\藤田　洋平\\AppData\\Local\\Programs\\Python\\Python313\\python.exe",
    autorestart: true,
    watch: false,
    max_restarts: 10,
    restart_delay: 5000
  }]
};