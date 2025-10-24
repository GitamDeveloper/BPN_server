const express = require('express');
const net = require('net');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

class BPNServer {
  constructor() {
    console.log('🚀 BPN Server starting...');
  }

  setupRoutes() {
    // Главная страница
    app.get('/', (req, res) => {
      res.json({ 
        status: 'BPN Server is running!',
        service: 'Blog Protocol Network',
        endpoints: {
          '/ip': 'Get your BPN IP',
          '/proxy?url=...': 'HTTP proxy',
          '/tunnel': 'TCP tunnel (POST)',
          '/test': 'Test connectivity'
        }
      });
    });

    // Получение IP через BPN
    app.get('/ip', async (req, res) => {
      try {
        console.log('🌍 Fetching IP via BPN...');
        
        const socket = new net.Socket();
        const response = await new Promise((resolve, reject) => {
          let data = '';
          
          socket.connect(80, 'api.ipify.org', () => {
            console.log('✅ Connected to api.ipify.org');
            socket.write('GET / HTTP/1.1\r\nHost: api.ipify.org\r\nConnection: close\r\n\r\n');
          });
          
          socket.on('data', (chunk) => {
            data += chunk.toString();
          });
          
          socket.on('close', () => {
            console.log('📨 Received response from api.ipify.org');
            resolve(data);
          });
          
          socket.on('error', reject);
          
          socket.setTimeout(8000, () => {
            socket.destroy();
            resolve(data);
          });
        });

        const ipMatch = response.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
        const ip = ipMatch ? ipMatch[0] : 'Unknown';

        res.json({
          success: true,
          your_bpn_ip: ip,
          location: 'Frankfurt, Germany',
          raw_response: response.substring(0, 200) + '...'
        });

      } catch (err) {
        console.log('❌ IP fetch error:', err.message);
        res.status(500).json({
          success: false,
          error: err.message
        });
      }
    });

    // HTTP прокси
    app.get('/proxy', async (req, res) => {
      const { url } = req.query;
      
      if (!url) {
        return res.status(400).json({ error: 'URL parameter required' });
      }

      try {
        console.log(`🌐 Proxying: ${url}`);
        
        const targetUrl = url.startsWith('http') ? url : `http://${url}`;
        const parsedUrl = new URL(targetUrl);
        
        const host = parsedUrl.hostname;
        const port = parsedUrl.port || 80;
        const path = parsedUrl.pathname + parsedUrl.search;

        const socket = new net.Socket();
        const response = await new Promise((resolve, reject) => {
          let responseData = Buffer.alloc(0);

          socket.connect(port, host, () => {
            console.log(`✅ Connected to ${host}`);
            const request = `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\nUser-Agent: BPN-Proxy/1.0\r\n\r\n`;
            socket.write(request);
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

        // Отправляем raw HTTP ответ
        res.setHeader('X-BPN-Proxy', 'true');
        res.send(response);

      } catch (err) {
        console.log('❌ Proxy error:', err.message);
        res.status(500).json({ error: err.message });
      }
    });

    // TCP туннель для любых протоколов
    app.post('/tunnel', async (req, res) => {
      const { host, port = 80, data, protocol = 'http' } = req.body;
      
      if (!host) {
        return res.status(400).json({ error: 'Host required' });
      }

      try {
        console.log(`🔗 Tunnel to ${host}:${port} (${protocol})`);
        
        const socket = new net.Socket();
        const result = await new Promise((resolve, reject) => {
          let response = Buffer.alloc(0);

          socket.connect(port, host, () => {
            console.log(`✅ Tunnel connected to ${host}:${port}`);
            
            if (data) {
              const requestData = Buffer.from(data, 'base64');
              socket.write(requestData);
            } else if (protocol === 'http') {
              // Авто HTTP запрос
              socket.write(`GET / HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
            }
          });

          socket.on('data', (chunk) => {
            response = Buffer.concat([response, chunk]);
          });

          socket.on('close', () => {
            console.log(`📨 Tunnel received ${response.length} bytes`);
            resolve(response);
          });

          socket.on('error', reject);
          socket.setTimeout(10000, () => {
            socket.destroy();
            resolve(response);
          });
        });

        res.json({
          success: true,
          data: result.toString('base64'),
          bytes: result.length,
          host: host,
          port: port
        });

      } catch (err) {
        console.log('❌ Tunnel error:', err.message);
        res.status(500).json({
          success: false,
          error: err.message
        });
      }
    });

    // Тест связности
    app.get('/test', async (req, res) => {
      const testSites = [
        { name: 'Google', host: 'google.com', path: '/' },
        { name: 'GitHub', host: 'github.com', path: '/' },
        { name: 'Cloudflare', host: 'cloudflare.com', path: '/' },
        { name: 'IPify', host: 'api.ipify.org', path: '/' }
      ];

      const results = [];

      for (const site of testSites) {
        try {
          const start = Date.now();
          const socket = new net.Socket();

          await new Promise((resolve, reject) => {
            socket.connect(80, site.host, resolve);
            socket.on('error', reject);
            socket.setTimeout(5000, () => reject(new Error('timeout')));
          });

          const latency = Date.now() - start;
          socket.destroy();

          results.push({
            site: site.name,
            status: '✅ Reachable',
            latency: `${latency}ms`,
            host: site.host
          });

        } catch (err) {
          results.push({
            site: site.name,
            status: '❌ Unreachable',
            error: err.message,
            host: site.host
          });
        }
      }

      res.json({
        success: true,
        bpn_connectivity_test: results,
        message: 'BPN network test completed'
      });
    });
  }

  start() {
    this.setupRoutes();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🎉 BPN Server running on port ${PORT}`);
      console.log('💡 Available endpoints:');
      console.log('   /ip     - Get your BPN IP');
      console.log('   /proxy  - HTTP proxy (?url=...)');
      console.log('   /tunnel - TCP tunnel (POST)');
      console.log('   /test   - Network test');
    });
  }
}

new BPNServer().start();
