const express = require('express');
const http = require('http');
const net = require('net');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: '*/*' }));

class BPNServer {
  constructor() {
    this.password = process.env.VPN_PASSWORD || 'bpn_password_123';
    console.log('🔐 Server password:', this.password);
    console.log('🚀 BPN Server starting...');
  }

  setupRoutes() {
    // Простейший тестовый endpoint
    app.get('/', (req, res) => {
      res.send(`
        <html>
          <head><title>BPN Service</title></head>
          <body>
            <h1>BPN Service</h1>
            <p>Status: Running</p>
            <p>Password set: ${this.password ? 'YES' : 'NO'}</p>
          </body>
        </html>
      `);
    });

    // Health check
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        service: 'bpn',
        timestamp: new Date().toISOString()
      });
    });

    // Упрощенная аутентификация
    app.post('/auth', (req, res) => {
      console.log('📨 Auth request received');
      console.log('Request body:', req.body);
      console.log('Headers:', req.headers);
      
      const { password, clientId } = req.body;
      
      if (!password) {
        console.log('❌ No password provided');
        return res.status(400).json({ error: 'Password required' });
      }
      
      console.log('🔐 Comparing passwords:');
      console.log('Client password:', password);
      console.log('Server password:', this.password);
      console.log('Match:', password === this.password);
      
      if (password === this.password) {
        console.log('✅ Authentication successful for:', clientId);
        res.json({ 
          status: 'success', 
          message: 'BPN authentication successful'
        });
      } else {
        console.log('❌ Authentication failed');
        res.status(401).json({ 
          status: 'error', 
          message: 'Invalid BPN credentials',
          received: password,
          expected: this.password
        });
      }
    });

    // Простой тестовый endpoint
    app.post('/test', (req, res) => {
      console.log('🧪 Test request:', req.body);
      res.json({ 
        status: 'success', 
        message: 'BPN test endpoint works!',
        your_data: req.body
      });
    });

    // Прямое подключение к сайту
    app.post('/connect', async (req, res) => {
      console.log('🔗 Connect request:', req.body);
      
      const { host, port = 80, data } = req.body;
      
      if (!host) {
        return res.status(400).json({ error: 'Host required' });
      }

      try {
        console.log(`🔗 Connecting to ${host}:${port}`);
        const socket = new net.Socket();
        
        const result = await new Promise((resolve, reject) => {
          let response = Buffer.alloc(0);
          
          socket.connect(port, host, () => {
            console.log(`✅ Connected to ${host}:${port}`);
            
            if (data) {
              socket.write(Buffer.from(data, 'base64'));
            } else {
              // Default HTTP request
              const httpRequest = `GET / HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`;
              socket.write(httpRequest);
            }
          });
          
          socket.on('data', (chunk) => {
            response = Buffer.concat([response, chunk]);
          });
          
          socket.on('close', () => {
            console.log(`📨 Received ${response.length} bytes from ${host}`);
            resolve(response);
          });
          
          socket.on('error', reject);
          
          socket.setTimeout(10000, () => {
            console.log('⏰ Socket timeout');
            socket.destroy();
            resolve(response);
          });
        });
        
        res.json({
          status: 'success',
          data: result.toString('base64'),
          length: result.length
        });
        
      } catch (err) {
        console.log('❌ Connection failed:', err.message);
        res.status(500).json({ 
          error: 'Connection failed',
          message: err.message
        });
      }
    });
  }

  start() {
    this.setupRoutes();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ BPN server running on port ${PORT}`);
      console.log(`🔐 Password: ${this.password}`);
      console.log('💡 Test with: curl -X POST https://your-app.onrender.com/auth -H "Content-Type: application/json" -d \'{"password":"' + this.password + '"}\'');
    });
  }
}

const server = new BPNServer();
server.start();
