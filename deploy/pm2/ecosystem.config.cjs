module.exports = {
  apps: [
    {
      name: "sriyan-api",
      script: "dist/server.js",
      exec_mode: "cluster",
      instances: "max",
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: "4000",
      },
      max_memory_restart: "750M",
      kill_timeout: 30000,
      listen_timeout: 30000,
      exp_backoff_restart_delay: 1000,
    },
  ],
};
