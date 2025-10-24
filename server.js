const express = require('express');
const net = require('net');
const { SocksClient } = require('socks');

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

    // Улучшенный SOCKS прокси
    app.post('/socks', async (req, res) => {
      const { host, port, data } = req.body;
      
      console.log(`🔗 SOCKS request: ${host}:${port}`);

      try {
        const options = {
          proxy: {
            hostname: host,
            port: port,
            type: 5 // SOCKS5
          },
          command: 'connect',
          destination: {
            host: host,
            port: port
          }
        };

        const info = await SocksClient.createConnection(options);
        console.log(`✅ SOCKS connected to ${host}:${port}`);

        // Если есть данные - отправляем их
        if (data) {
          info.socket.write(Buffer.from(data, 'base64'));
        }

        // Ждем ответ
        const response = await new Promise((resolve) => {
          let responseData = Buffer.alloc(0);
          
          info.socket.on('data', (chunk) => {
            responseData = Buffer.concat([responseData, chunk]);
          });
          
          info.socket.on('close', () => {
            resolve(responseData);
          });
          
          info.socket.setTimeout(10000, () => {
            info.socket.destroy();
            resolve(responseData);
          });
        });

        info.socket.destroy();

        res.json({
          status: 'success',
          data: response.toString('base64'),
          bytes: response.length
        });

      } catch (err) {
        console.log('❌ SOCKS error:', err.message);
        res.status(500).json({ error: err.message });
      }
    });

    // Простой HTTP прокси
    app.post('/http', async (req, res) => {
      const { url, method = 'GET', headers = {} } = req.body;
      
      try {
        const target = new URL(url);
        const host = target.hostname;
        const port = target.port || (target.protocol === 'https:' ? 443 : 80);
        const path = target.pathname + target.search;

        console.log(`🌐 HTTP proxy: ${method} ${url}`);

        const socket = new net.Socket();
        const response = await new Promise((resolve, reject) => {
          let responseData = Buffer.alloc(0);

          socket.connect(port, host, () => {
            const requestLines = [
              `${method} ${path} HTTP/1.1`,
              `Host: ${host}`,
              `Connection: close`,
              `User-Agent: BPN-Client/1.0`,
              ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
              '', ''
            ];

            socket.write(requestLines.join('\r\n'));
          });

          socket.on('data', (chunk) => {
            responseData = Buffer.concat([responseData, chunk]);
          });

          socket.on('close', () => resolve(responseData));
          socket.on('error', reject);
          socket.setTimeout(10000, () => {
            socket.destroy();
            resolve(responseData);
          });
        });

        socket.destroy();

        res.json({
          status: 'success', 
          data: response.toString('base64'),
          bytes: response.length
        });

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
          service: 'BPN'
        });
        
      } catch (err) {
        res.json({ ip: 'Error: ' + err.message });
      }
    });
  }

  start() {
    this.setupRoutes();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🎉 BPN Server running on port ${PORT}`);
    });
  }
}

new BPNServer().start();
