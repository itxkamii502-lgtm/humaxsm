module.exports = {
  apps: [
    {
      name: 'humex-sms',
      script: 'server.js',
      args: '--port 3000',
      instances: 1, // Fork mode recommended for stateful memory & SMPP listener
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        SMPP_ENABLED: 'true',
        SMPP_PORT: 2775,
        TRUST_PROXY: '1',
        // Recommended on VPS: store live data outside code tree so code updates never overwrite database
        // DATA_DIR: '/var/lib/humex-sms/data'
      }
    }
  ]
};
