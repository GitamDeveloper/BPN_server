const express = require('express');
const net = require('net');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

class BPNServer {
  constructor() {
    console.log('🚀 BPN Server starting...');
  }

  setupRoutes() {
    app.get('/', (req, res) => {
      res.send(`
        <html>
          <head><title>BPN</title><style>body{font-family:monospace;margin:40px}</style></head>
          <body>
            <h1>🌐 BPN Service</h1>
            <p><strong>Status:</strong> ✅ Operational</p>
            <p><strong>Your IP:</strong> ${req.ip}</p>
            <p><em>Blog Protocol Network - definitely not a VPN</em></p>
          </body>
        </html>
      `);
    });

    // Простой TCP туннель через HTTP
    app.post('/tunnel', async (req, res) => {
      const { host, port = 80, data } = req.body;
      
      console.log(`🔗 Tunnel request: ${host}:${port}, data: ${data ? data.length : 0} bytes`);

      try {
        const socket = new net.Socket();
        
        const result = await new Promise((resolve, reject) => {
          let response = Buffer.alloc(0);
          
          socket.connect(port, host, () => {
            console.log(`✅ Connected to ${host}:${port}`);
            
            if (data) {
              const requestData = Buffer.from(data, 'base64');
              socket.write(requestData);
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
            console.log('⏰ Tunnel timeout');
            socket.destroy();
            resolve(response);
          });
        });

        socket.destroy();

        res.json({
          status: 'success',
          data: result.toString('base64'),
          bytes: result.length
        });

      } catch (err) {
        console.log('❌ Tunnel error:', err.message);
        res.status(500).json({ 
          error: 'Tunnel failed',
          message: err.message
        });
      }
    });

    // Готовые HTTP запросы
    app.get('/http/:url*', async (req, res) => {
      try {
        const url = req.params.url + (req.params[0] || '');
        const fullUrl = url.startsWith('http') ? url : `http://${url}`;
        
        console.log(`🌐 HTTP request: ${fullUrl}`);
        
        const target = new URL(fullUrl);
        const host = target.hostname;
        const port = target.port || 80;
        const path = target.pathname + target.search;

        const socket = new net.Socket();
        const response = await new Promise((resolve) => {
          let responseData = Buffer.alloc(0);

          socket.connect(port, host, () => {
            const request = `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\nUser-Agent: BPN-Client/1.0\r\n\r\n`;
            socket.write(request);
          });

          socket.on('data', (chunk) => {
            responseData = Buffer.concat([responseData, chunk]);
          });

          socket.on('close', () => resolve(responseData));
          socket.setTimeout(8000, () => {
            socket.destroy();
            resolve(responseData);
          });
        });

        socket.destroy();

        // Отправляем как есть
        res.set('X-BPN-Proxy', 'true');
        res.send(response);

      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Получение IP
    app.get('/ip', async (req, res) => {
      try {
        const socket = new net.Socket();
        const response = await new Promise((resolve) => {
          let data = '';
          socket.connect(80, 'api.ipify.org', () => {
            socket.write('GET / HTTP/1.1\r\nHost: api.ipify.org\r\nConnection: close\r\n\r\n');
          });
          socket.on('data', chunk => data += chunk.toString());
          socket.on('close', () => resolve(data));
          socket.setTimeout(5000, () => {
            socket.destroy();
            resolve(data);
          });
        });
        
        const ipMatch = response.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
        res.json({ 
          ip: ipMatch ? ipMatch[0] : 'Unknown',
          country: 'Germany (Frankfurt)',
          service: 'BPN',
          raw: response.substring(0, 200)
        });
        
      } catch (err) {
        res.json({ ip: 'Error: ' + err.message });
      }
    });

    // Тест нескольких сайтов
    app.get('/test', async (req, res) => {
      const sites = [
        { name: 'Google', host: 'google.com', path: '/' },
        { name: 'GitHub', host: 'github.com', path: '/' },
        { name: 'IPify', host: 'api.ipify.org', path: '/' }
      ];

      const results = [];

      for (const site of sites) {
        try {
          const start = Date.now();
          const socket = new net.Socket();

          await new Promise((resolve, reject) => {
            socket.connect(80, site.host, resolve);
            socket.on('error', reject);
            socket.setTimeout(3000, () => reject(new Error('timeout')));
          });

          const latency = Date.now() - start;
          socket.destroy();

          results.push({
            site: site.name,
            status: '✅ Reachable',
            latency: latency + 'ms'
          });

        } catch (err) {
          results.push({
            site: site.name,
            status: '❌ Unreachable',
            error: err.message
          });
        }
      }

      res.json({
        status: 'success',
        bpn_test: results,
        message: 'BPN connectivity test completed'
      });
    });
  }

  start() {
    this.setupRoutes();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🎉 BPN Server running on port ${PORT}`);
      console.log('💡 Test endpoints:');
      console.log('   GET  /ip              - Get your BPN IP');
      console.log('   GET  /test            - Test connectivity');
      console.log('   GET  /http/google.com - Direct HTTP proxy');
      console.log('   POST /tunnel          - Raw TCP tunnel');
    });
  }
}

new BPNServer().start();
