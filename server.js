const express = require('express');
const net = require('net');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.raw({ type: '*/*', limit: '10mb' }));

// Middleware для логирования
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

class BPNServer {
  setupRoutes() {
    // Health check
    app.get('/', (req, res) => {
      res.json({
        status: 'operational',
        service: 'BPN',
        version: '1.0.0',
        uptime: process.uptime()
      });
    });

    // TCP туннель - основной endpoint
    app.post('/tunnel', async (req, res) => {
      const { host, port = 80, data } = req.body;
      
      if (!host) {
        return res.status(400).json({ error: 'Host required' });
      }

      const socket = new net.Socket();
      let isResponded = false;

      const cleanup = () => {
        if (!socket.destroyed) {
          socket.destroy();
        }
      };

      const sendResponse = (response) => {
        if (!isResponded) {
          isResponded = true;
          res.json(response);
        }
      };

      const sendError = (error) => {
        if (!isResponded) {
          isResponded = true;
          res.status(500).json({ error: error.message });
        }
      };

      try {
        socket.connect(port, host, () => {
          if (data) {
            const requestData = Buffer.from(data, 'base64');
            socket.write(requestData);
          }
        });

        let responseBuffer = Buffer.alloc(0);
        
        socket.on('data', (chunk) => {
          responseBuffer = Buffer.concat([responseBuffer, chunk]);
        });

        socket.on('close', () => {
          sendResponse({
            success: true,
            data: responseBuffer.toString('base64'),
            bytes: responseBuffer.length
          });
          cleanup();
        });

        socket.on('error', (err) => {
          sendError(err);
          cleanup();
        });

        socket.setTimeout(15000, () => {
          sendResponse({
            success: true,
            data: responseBuffer.toString('base64'),
            bytes: responseBuffer.length,
            timeout: true
          });
          cleanup();
        });

      } catch (err) {
        sendError(err);
        cleanup();
      }
    });

    // HTTP прокси для простых запросов
    app.all('/http/*', async (req, res) => {
      const url = req.params[0];
      if (!url) {
        return res.status(400).json({ error: 'URL required' });
      }

      try {
        const targetUrl = url.startsWith('http') ? url : `http://${url}`;
        const { hostname, port = 80, pathname, search } = new URL(targetUrl);
        const path = pathname + search;

        const requestHeaders = Object.entries(req.headers)
          .filter(([key]) => !['host', 'connection'].includes(key.toLowerCase()))
          .map(([key, value]) => `${key}: ${value}`)
          .join('\r\n');

        const requestData = [
          `${req.method} ${path} HTTP/1.1`,
          `Host: ${hostname}`,
          'Connection: close',
          requestHeaders,
          '',
          req.body && req.body.length ? req.body.toString() : ''
        ].join('\r\n');

        const response = await axios.post(`http://localhost:${PORT}/tunnel`, {
          host: hostname,
          port: parseInt(port),
          data: Buffer.from(requestData).toString('base64')
        });

        if (response.data.success) {
          const responseData = Buffer.from(response.data.data, 'base64');
          const [headers, ...body] = responseData.toString().split('\r\n\r\n');
          
          // Парсим статус код
          const statusLine = headers.split('\r\n')[0];
          const statusCode = parseInt(statusLine.split(' ')[1]) || 200;
          
          // Устанавливаем заголовки
          headers.split('\r\n').slice(1).forEach(header => {
            const [key, value] = header.split(': ');
            if (key && value) {
              res.set(key, value);
            }
          });

          res.status(statusCode).send(body.join('\r\n\r\n'));
        } else {
          res.status(502).json({ error: 'Proxy error' });
        }

      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Получение IP клиента
    app.get('/ip', (req, res) => {
      res.json({
        ip: req.ip,
        forwarded: req.headers['x-forwarded-for'],
        country: 'DE',
        city: 'Frankfurt',
        service: 'BPN'
      });
    });

    // Error handling
    app.use((err, req, res, next) => {
      console.error('Server error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });

    app.use('*', (req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });
  }

  start() {
    this.setupRoutes();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 BPN Server v1.0.0 running on port ${PORT}`);
      console.log('📍 Location: Frankfurt, DE');
      console.log('💡 Ready for production use');
    });
  }
}

new BPNServer().start();
