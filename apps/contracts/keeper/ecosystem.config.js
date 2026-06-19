module.exports = {
  apps: [
    {
      name: "drip-keeper",
      script: "dist/keeper.js",
      cwd: __dirname,

      // Restart automatically on crash
      autorestart: true,
      watch: false,
      max_restarts: 50,
      restart_delay: 5000,       // wait 5s before restarting
      max_memory_restart: "256M",

      // Logging
      out_file: "./logs/keeper-out.log",
      error_file: "./logs/keeper-err.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      // Environment — override in keeper/.env or PM2 ecosystem env
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
