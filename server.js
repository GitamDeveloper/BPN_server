const express = require('express');
const http = require('http');
const net = require('net');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '10mb' }));

class HTTPTunnelServer {
  constructor() {
    this.password = process.env.VPN_PASSWORD || 'pathetic_password_123';
    this.encryptionKey = crypto.createHash('sha256').update(this.password).digest();
    this.clients = new Map();
    this.connections = new Map();
    
    console.log('🚀 Pathetic VPN Server starting...');
    console.log('💀 Because sometimes good enough is not an option');
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
      if (!data || data.length < 32) return null;
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

  setupRoutes() {
    // Главная страница с настроением
    app.get('/', (req, res) => {
      res.send(`
        <html>
          <head>
            <title>Pathetic VPN</title>
            <style>
              body { 
                font-family: 'Courier New', monospace; 
                max-width: 600px; 
                margin: 50px auto; 
                padding: 20px;
                background: #1a1a1a;
                color: #00ff00;
              }
              .status { 
                background: #2a2a2a; 
                padding: 20px; 
                border: 1px solid #444;
                border-radius: 0;
              }
              .title { 
                color: #ff4444; 
                text-align: center;
                margin-bottom: 30px;
              }
            </style>
          </head>
          <body>
            <h1 class="title">🖤 Pathetic VPN</h1>
            <div class="status">
              <p><strong>Status:</strong> Working... probably</p>
              <p><strong>Quality:</strong> Questionable</p>
              <p><strong>Clients:</strong> ${this.clients.size} (if any)</p>
              <p><strong>Philosophy:</strong> It's not a bug, it's a feature</p>
              <p><em>"Why use good when pathetic is available?"</em></p>
            </div>
          </body>
        </html>
      `);
    });

    // Health check
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'pathetic', 
        message: 'Still running, surprisingly',
        clients: this.clients.size,
        uptime: process.uptime()
      });
    });

    // Аутентификация клиента
    app.post('/auth', (req, res) => {
      const { password, clientId } = req.body;
      
      if (password === this.password) {
        this.clients.set(clientId, {
          id: clientId,
          lastSeen: Date.now(),
          connections: new Set()
        });
        
        console.log(`✅ Client authenticated: ${clientId}`);
        res.json({ 
          status: 'success', 
          message: 'Welcome to pathetic VPN'
        });
      } else {
        console.log(`❌ Authentication failed: ${clientId}`);
        res.status(401).json({ 
          status: 'pathetic', 
          message: 'Even our authentication is mediocre' 
        });
      }
    });

    // Создание TCP соединения через HTTP туннель
    app.post('/connect/:clientId', async (req, res) => {
      const { clientId } = req.params;
      
      if (!this.clients.has(clientId)) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      try {
        const { host, port } = req.body;
        console.log(`🔗 Creating connection to ${host}:${port}`);
        
        const socket = new net.Socket();
        const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        await new Promise((resolve, reject) => {
          socket.connect(port, host, () => {
            console.log(`✅ Connected to ${host}:${port}`);
            resolve();
          });
          
          socket.on('error', reject);
          socket.setTimeout(10000, () => reject(new Error('Timeout')));
        });

        this.connections.set(connectionId, { socket, clientId });
        this.clients.get(clientId).connections.add(connectionId);

        res.json({ 
          status: 'success', 
          connectionId,
          message: 'Connection established... somehow'
        });

      } catch (err) {
        console.log(`❌ Connection failed: ${err.message}`);
        res.status(500).json({ 
          error: 'Failed to connect',
          message: 'This is why we are pathetic'
        });
      }
    });

    // Чтение данных из туннеля
    app.get('/read/:connectionId', (req, res) => {
      const { connectionId } = req.params;
      const connection = this.connections.get(connectionId);
      
      if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      const { socket } = connection;
      
      // Ждем данные с таймаутом
      const timeout = setTimeout(() => {
        res.json({ data: null, status: 'timeout' });
      }, 30000);

      const dataHandler = (data) => {
        clearTimeout(timeout);
        socket.removeListener('data', dataHandler);
        
        try {
          const encrypted = this.encrypt(data);
          res.json({
            data: encrypted.toString('base64'),
            status: 'success'
          });
        } catch (err) {
          res.status(500).json({ error: 'Encryption failed' });
        }
      };

      socket.once('data', dataHandler);
      
      socket.once('close', () => {
        clearTimeout(timeout);
        res.status(410).json({ error: 'Connection closed' });
      });
    });

    // Запись данных в туннель
    app.post('/write/:connectionId', (req, res) => {
      const { connectionId } = req.params;
      const connection = this.connections.get(connectionId);
      
      if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      try {
        const encrypted = Buffer.from(req.body);
        const decrypted = this.decrypt(encrypted);
        
        if (!decrypted) {
          return res.status(400).json({ error: 'Invalid data' });
        }

        connection.socket.write(decrypted);
        res.json({ status: 'success', bytes: decrypted.length });
        
      } catch (err) {
        res.status(500).json({ error: 'Write failed' });
      }
    });

    // Закрытие соединения
    app.delete('/connection/:connectionId', (req, res) => {
      const { connectionId } = req.params;
      this.closeConnection(connectionId);
      res.json({ status: 'success', message: 'Connection closed... finally' });
    });
  }

  closeConnection(connectionId) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.socket.destroy();
      this.connections.delete(connectionId);
      
      const client = this.clients.get(connection.clientId);
      if (client) {
        client.connections.delete(connectionId);
      }
      
      console.log(`🔒 Connection closed: ${connectionId}`);
    }
  }

  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      
      // Очистка старых клиентов
      for (const [clientId, client] of this.clients.entries()) {
        if (now - client.lastSeen > 300000) { // 5 минут
          console.log(`🧹 Removing inactive client: ${clientId}`);
          this.clients.delete(clientId);
        }
      }
      
      // Очистка битых соединений
      for (const [connectionId, connection] of this.connections.entries()) {
        if (connection.socket.destroyed) {
          this.connections.delete(connectionId);
        }
      }
    }, 60000);
  }

  start() {
    this.setupRoutes();
    this.startCleanup();
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Pathetic VPN server running on port ${PORT}`);
      console.log('💀 Remember: low expectations lead to fewer disappointments');
    });
  }
}

// Запуск сервера
const vpnServer = new HTTPTunnelServer();
vpnServer.start();

module.exports = app;
