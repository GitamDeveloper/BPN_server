const express = require('express');
const net = require('net');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

class BPNServer {
  constructor() {
    this.password = process.env.BPN_PASSWORD || 'bpn_test_123';
    console.log('🚀 BPN Server started on port', PORT);
  }

  setupRoutes() {
    // Статус
    app.get('/', (req, res) => {
      res.send(`
        <html>
          <head><title>BPN</title><style>body{font-family:monospace;margin:40px}</style></head>
          <body>
            <h1>🌐 BPN Service</h1>
            <p><strong>Status:</strong> ✅ Operational</p>
            <p><em>Blog Protocol Network - definitely not a VPN</em></p>
          </body>
        </html>
      `);
    });

    // Простой прокси для HTTP
    app.post('/proxy', async (req, res) => {
      const { url, method = 'GET', headers = {}, body } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL required' });
      }

      try {
        const target = new URL(url);
        const host = target.hostname;
        const port = target.port || (target.protocol === 'https:' ? 443 : 80);
        const path = target.pathname + target.search;

        console.log(`🔗 Proxying ${method} ${url}`);

        const socket = new net.Socket();
        const response = await new Promise((resolve, reject) => {
          let responseData = Buffer.alloc(0);
          let isHTTPS = target.protocol === 'https:';

          socket.connect(port, host, () => {
            console.log(`✅ Connected to ${host}:${port}`);
            
            const requestLines = [
              `${method} ${path} HTTP/1.1`,
              `Host: ${host}`,
              `Connection: close`,
              `User-Agent: BPN-Proxy/1.0`,
              ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`)
            ];

            if (body) {
              requestLines.push(`Content-Length: ${body.length}`);
              requestLines.push('', body);
            } else {
              requestLines.push('', '');
            }

            const requestStr = requestLines.join('\r\n');
            socket.write(requestStr);
          });

          socket.on('data', (chunk) => {
            responseData = Buffer.concat([responseData, chunk]);
          });

          socket.on('close', () => {
            resolve(responseData.toString());
          });

          socket.on('error', reject);
          socket.setTimeout(10000, () => {
            socket.destroy();
            resolve(responseData.toString());
          });
        });

        socket.destroy();

        // Парсим HTTP ответ
        const [headers, ...bodyParts] = response.split('\r\n\r\n');
        const responseBody = bodyParts.join('\r\n\r\n');

        res.json({
          status: 'success',
          data: responseBody,
          headers: headers.split('\r\n').slice(0, 10) // Первые 10 заголовков
        });

      } catch (err) {
        console.log('❌ Proxy error:', err.message);
        res.status(500).json({ error: err.message });
      }
    });

    // Получение IP через BPN
    app.get('/myip', async (req, res) => {
      try {
        const socket = new net.Socket();
        const response = await new Promise((resolve, reject) => {
          let responseData = Buffer.alloc(0);

          socket.connect(80, 'api.ipify.org', () => {
            socket.write('GET / HTTP/1.1\r\nHost: api.ipify.org\r\nConnection: close\r\n\r\n');
          });

          socket.on('data', (chunk) => {
            responseData = Buffer.concat([responseData, chunk]);
          });

          socket.on('close', () => resolve(responseData.toString()));
          socket.on('error', reject);
          socket.setTimeout(5000, () => {
            socket.destroy();
            resolve(responseData.toString());
          });
        });

        socket.destroy();

        // Извлекаем IP из ответа
        const ipMatch = response.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
        const ip = ipMatch ? ipMatch[0] : 'Unknown';

        res.json({
          status: 'success',
          your_bpn_ip: ip,
          raw_response: response.substring(0, 200) + '...'
        });

      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Тест скорости/доступности
    app.get('/test', async (req, res) => {
      const testUrls = [
        'http://google.com',
        'http://github.com',
        'http://stackoverflow.com'
      ];

      const results = [];

      for (const url of testUrls) {
        try {
          const start = Date.now();
          const target = new URL(url);
          const socket = new net.Socket();

          await new Promise((resolve, reject) => {
            socket.connect(target.port || 80, target.hostname, resolve);
            socket.on('error', reject);
            socket.setTimeout(3000, () => reject(new Error('timeout')));
          });

          const latency = Date.now() - start;
          socket.destroy();

          results.push({
            url,
            status: '✅ Reachable',
            latency: latency + 'ms'
          });

        } catch (err) {
          results.push({
            url,
            status: '❌ Unreachable',
            error: err.message
          });
        }
      }

      res.json({
        status: 'success',
        bpn_test_results: results,
        message: 'BPN connectivity test completed'
      });
    });
  }

  start() {
    this.setupRoutes();
    app.listen(PORT, '0.0.0.0', () => {
      console.log('🎉 BPN Server ready!');
      console.log('💡 Test endpoints:');
      console.log('   GET  /myip    - Get your BPN IP');
      console.log('   GET  /test    - Test BPN connectivity');
      console.log('   POST /proxy   - Proxy HTTP requests');
    });
  }
}

new BPNServer().start();
