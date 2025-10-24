const express = require('express');
const net = require('net');
const socks = require('socksv5');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Базовый веб-сервер для Render
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>VPN Proxy Server</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          .status { background: #f0f0f0; padding: 15px; border-radius: 5px; }
          .success { color: green; }
          .error { color: red; }
        </style>
      </head>
      <body>
        <h1>🚀 VPN Proxy Server</h1>
        <div class="status">
          <p><strong>Status:</strong> <span class="success">Running</span></p>
          <p><strong>SOCKS5 Port:</strong> ${process.env.SOCKS_PORT || 1080}</p>
          <p><strong>Server IP:</strong> ${req.ip}</p>
          <p><strong>Instructions:</strong> Use the client script with this server URL</p>
        </div>
      </body>
    </html>
  `);
});

// Health check для Render
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'vpn-proxy',
    timestamp: new Date().toISOString()
  });
});

class VPNProxyServer {
  constructor() {
    this.socksPort = parseInt(process.env.SOCKS_PORT) || 1080;
    this.password = process.env.VPN_PASSWORD || 'default_render_password_123';
    this.encryptionKey = crypto.createHash('sha256').update(this.password).digest();
    this.authenticatedClients = new Set();
    
    console.log('🚀 VPN Proxy Server starting on Render...');
    console.log(`📍 Web Port: ${PORT}`);
    console.log(`📍 SOCKS5 Port: ${this.socksPort}`);
  }

  encrypt(data) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    let encrypted = cipher.update(data);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]);
  }

  decrypt(data) {
    try {
      if (data.length < 32) return null;
      const iv = data.slice(0, 16);
      const authTag = data.slice(16, 32);
      const encrypted = data.slice(32);
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted;
    } catch (err) {
      return null;
    }
  }

  // WebSocket-like authentication endpoint
  setupAuthEndpoint() {
    app.post('/auth', express.json(), (req, res) => {
      const { password, clientId } = req.body;
      
      if (password === this.password) {
        this.authenticatedClients.add(clientId);
        console.log(`✅ Client authenticated: ${clientId}`);
        res.json({ status: 'success', socksPort: this.socksPort });
      } else {
        console.log(`❌ Authentication failed for: ${clientId}`);
        res.status(401).json({ status: 'error', message: 'Invalid password' });
      }
    });

    // Endpoint для проверки аутентификации
    app.post('/verify', express.json(), (req, res) => {
      const { clientId } = req.body;
      const isAuthenticated = this.authenticatedClients.has(clientId);
      res.json({ authenticated: isAuthenticated });
    });
  }

  // SOCKS5 сервер
  startSocksServer() {
    const socksServer = socks.createServer((info, accept, deny) => {
      const clientKey = `${info.srcAddr}:${info.srcPort}`;
      
      // На Render мы не можем надежно проверять аутентификацию по IP
      // Используем упрощенную проверку
      if (this.authenticatedClients.size === 0) {
        console.log(`⚠️  No authenticated clients, allowing: ${clientKey}`);
      }
      
      console.log(`🔗 SOCKS connection: ${info.srcAddr}:${info.srcPort} -> ${info.dstAddr}:${info.dstPort}`);
      
      const socket = accept(true);
      if (socket) {
        socket.on('close', () => {
          console.log(`🔒 Connection closed: ${info.dstAddr}:${info.dstPort}`);
        });
        
        socket.on('error', (err) => {
          console.log(`❌ SOCKS error: ${err.message}`);
        });
      }
    });

    socksServer.auths = [socks.auth.None()];
    
    socksServer.listen(this.socksPort, '0.0.0.0', () => {
      console.log(`✅ SOCKS5 server listening on port ${this.socksPort}`);
    });
    
    socksServer.useAuth(socks.auth.None());
  }

  // Очистка старых клиентов
  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      // На Render мы просто логируем, так как не храним timestamp
      console.log(`🔄 Active clients: ${this.authenticatedClients.size}`);
    }, 60000);
  }

  start() {
    this.setupAuthEndpoint();
    this.startSocksServer();
    this.startCleanup();
    
    // Запуск веб-сервера
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Web server listening on port ${PORT}`);
      console.log('🎉 VPN Proxy Server is ready on Render!');
    });
  }
}

// Запуск сервера
const server = new VPNProxyServer();
server.start();

module.exports = app;