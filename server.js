const express = require('express');
const http = require('http');
const net = require('net');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

app.use(express.json({ limit: '10mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '10mb' }));

class BPNTunnelServer {
  constructor() {
    this.password = process.env.BPN_PASSWORD || 'bpn_password_123';
    this.encryptionKey = crypto.createHash('sha256').update(this.password).digest();
    this.clients = new Map();
    this.connections = new Map();
    
    console.log('🚀 BPN Server starting...');
    console.log('💀 Because why use normal VPN when you can use BPN?');
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
    app.get('/', (req, res) => {
      res.send(`
        <html>
          <head>
            <title>BPN Service</title>
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
            <h1 class="title">🖤 BPN Service</h1>
            <div class="status">
              <p><strong>Status:</strong> Operational</p>
              <p><strong>Service:</strong> Blog Protocol Network</p>
              <p><strong>Clients:</strong> ${this.clients.size}</p>
              <p><em>"Absolutely not a VPN service"</em></p>
            </div>
          </body>
        </html>
      `);
    });

    app.get('/health', (req, res) => {
      res.json({ 
        status: 'operational', 
        service: 'bpn',
        clients: this.clients.size,
        uptime: process.uptime()
      });
    });

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
          message: 'Welcome to BPN'
        });
      } else {
        console.log(`❌ Authentication failed: ${clientId}`);
        res.status(401).json({ 
          status: 'error', 
          message: 'Invalid credentials' 
        });
      }
    });

    // Упрощенный endpoint для тестирования
    app.post('/direct', async (req, res) => {
      const { password, host, port, data } = req.body;
      
      if (password !== this.password) {
        return res.status(401).json({ error: 'Invalid password' });
      }

      try {
        console.log(`🔗 Direct connection to ${host}:${port}`);
        
        const socket = new net.Socket();
        let responseData = Buffer.alloc(0);
        
        const result = await new Promise((resolve, reject) => {
          socket.connect(port, host, () => {
            console.log(`✅ Connected to ${host}:${port}`);
            
            if (data) {
              socket.write(Buffer.from(data, 'base64'));
            }
          });
          
          socket.on('data', (chunk) => {
            responseData = Buffer.concat([responseData, chunk]);
          });
          
          socket.on('close', () => {
            resolve(responseData);
          });
          
          socket.on('error', reject);
          
          socket.setTimeout(10000, () => {
            socket.destroy();
            resolve(responseData);
          });
        });
        
        socket.destroy();
        
        res.json({
          status: 'success',
          data: result.toString('base64'),
          bytes: result.length
        });
        
      } catch (err) {
        console.log(`❌ Direct connection failed: ${err.message}`);
        res.status(500).json({ 
          error: 'Connection failed',
          message: err.message
        });
      }
    });

    // Stream endpoint для реального BPN
    app.post('/stream/:clientId', async (req, res) => {
      const { clientId } = req.params;
      
      if (!this.clients.has(clientId)) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      try {
        const { host, port, data } = req.body;
        console.log(`🔗 Stream connection to ${host}:${port}`);
        
        const socket = new net.Socket();
        const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Устанавливаем соединение
        await new Promise((resolve, reject) => {
          socket.connect(port, host, resolve);
          socket.on('error', reject);
          socket.setTimeout(10000, () => reject(new Error('Connection timeout')));
        });

        console.log(`✅ Connected to ${host}:${port}`);
        
        this.connections.set(connectionId, { 
          socket, 
          clientId,
          responseSent: false
        });
        
        this.clients.get(clientId).connections.add(connectionId);

        // Отправляем начальный ответ
        if (!res.headersSent) {
          res.json({ 
            status: 'success', 
            connectionId,
            message: 'BPN stream established'
          });
        }

        // Обрабатываем входящие данные от целевого сервера
        socket.on('data', (data) => {
          // Данные будут читаться через отдельный endpoint
          console.log(`📨 Received ${data.length} bytes from ${host}`);
        });

        // Отправляем начальные данные если есть
        if (data) {
          const decryptedData = this.decrypt(Buffer.from(data, 'base64'));
          if (decryptedData) {
            socket.write(decryptedData);
          }
        }

        socket.on('close', () => {
          console.log(`🔒 Connection closed: ${connectionId}`);
          this.closeConnection(connectionId);
        });

        socket.on('error', (err) => {
          console.log(`❌ Socket error: ${err.message}`);
          this.closeConnection(connectionId);
        });
        
      } catch (err) {
        console.log(`❌ Stream setup failed: ${err.message}`);
        if (!res.headersSent) {
          res.status(500).json({ 
            error: 'Stream setup failed',
            message: err.message
        });
        }
      }
    });

    // Чтение данных из соединения
    app.get('/read/:connectionId', async (req, res) => {
      const { connectionId } = req.params;
      const connection = this.connections.get(connectionId);
      
      if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      const { socket } = connection;
      
      try {
        // Ждем данные с таймаутом
        const data = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => resolve(null), 10000);
          
          const dataHandler = (chunk) => {
            clearTimeout(timeout);
            socket.removeListener('data', dataHandler);
            resolve(chunk);
          };
          
          socket.once('data', dataHandler);
          
          socket.once('close', () => {
            clearTimeout(timeout);
            resolve(null);
          });
        });

        if (data && !res.headersSent) {
          const encrypted = this.encrypt(data);
          res.json({
            data: encrypted.toString('base64'),
            status: 'success'
          });
        } else if (!res.headersSent) {
          res.json({
            data: null,
            status: 'timeout'
          });
        }
        
      } catch (err) {
        if (!res.headersSent) {
          res.status(500).json({ error: 'Read failed' });
        }
      }
    });

    // Запись данных в соединение
    app.post('/write/:connectionId', (req, res) => {
      const { connectionId } = req.params;
      const connection = this.connections.get(connectionId);
      
      if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      try {
        const encrypted = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
        const decrypted = this.decrypt(encrypted);
        
        if (!decrypted) {
          return res.status(400).json({ error: 'Invalid data' });
        }

        connection.socket.write(decrypted);
        
        if (!res.headersSent) {
          res.json({ status: 'success', bytes: decrypted.length });
        }
        
      } catch (err) {
        if (!res.headersSent) {
          res.status(500).json({ error: 'Write failed' });
        }
      }
    });

    app.delete('/connection/:connectionId', (req, res) => {
      const { connectionId } = req.params;
      this.closeConnection(connectionId);
      res.json({ status: 'success' });
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
    }
  }

  start() {
    this.setupRoutes();
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ BPN server running on port ${PORT}`);
      console.log('💀 Remember: It\'s not a VPN, it\'s BPN!');
    });
  }
}

const bpnServer = new BPNTunnelServer();
bpnServer.start();

module.exports = app;
