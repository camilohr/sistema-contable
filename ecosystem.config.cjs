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
        CORS_ORIGIN: "http://localhost:3000,http://127.0.0.1:3000,http://192.168.18.232:3000",
      },
    },
  ],
};
