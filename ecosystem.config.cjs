module.exports = {
  apps: [
    {
      name: "contabilidad-backend",
      cwd: "./backend",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
