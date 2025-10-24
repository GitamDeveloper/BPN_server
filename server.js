const express = require('express');
const net = require('net');
const dgram = require('dgram');

const app = express();
const PORT = process.env.PORT || 3000;

// Максимальная производительность
app.use(express.raw({ 
  type: '*/*', 
  limit: '50mb',
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

class HighSpeedBPN {
  constructor() {
    this.connectionPool = new Map();
    this.stats = {
      totalConnections: 0,
      bytesTransferred: 0,
      activeConnections: 0
    };
  }

  setupRoutes() {
    // UDP endpoint для DNS и быстрых запросов
    app.post('/udp', async (req, res) => {
      const { host, port = 53, data } = req.body;
      
      return new Promise((resolve) => {
        const socket = dgram.createSocket('udp4');
        const timeout = setTimeout(() => {
          socket.close();
          res.json({ success: false, error: 'UDP timeout' });
          resolve();
        }, 3000);

        socket.on('message', (msg) => {
          clearTimeout(timeout);
          socket.close();
          res.json({
            success: true,
            data: msg.toString('base64'),
            bytes: msg.length
          });
          resolve();
        });

        socket.on('error', () => {
          clearTimeout(timeout);
          socket.close();
          res.json({ success: false, error: 'UDP error' });
          resolve();
        });

        if (data) {
          const requestData = Buffer.from(data, 'base64');
          socket.send(requestData, port, host);
        }
      });
    });

    // Высокоскоростной TCP туннель
    app.post('/fast-tunnel', async (req, res) => {
      const { host, port = 80, data, connectionId } = req.body;
      
      if (!host) {
        return res.status(400).json({ error: 'Host required' });
      }

      const startTime = Date.now();
      const socket = new net.Socket();
      
      // Максимальная производительность
      socket.setNoDelay(true); // Отключаем Nagle
      socket.setTimeout(10000);
      socket.setKeepAlive(true, 1000);

      try {
        // Быстрое соединение с IP
        await new Promise((resolve, reject) => {
          socket.connect(port, host, resolve);
          socket.once('error', reject);
          
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 4000);
          
          socket.once('connect', () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        let responseBuffer = Buffer.alloc(0);
        
        // Мгновенная отправка данных
        if (data) {
          const requestData = Buffer.from(data, 'base64');
          socket.write(requestData);
          this.stats.bytesTransferred += requestData.length;
        }

        // Быстрый сбор данных
        const responsePromise = new Promise((resolve) => {
          const chunks = [];
          let totalSize = 0;

          socket.on('data', (chunk) => {
            chunks.push(chunk);
            totalSize += chunk.length;
            
            // Для больших ответов - отправляем частично
            if (totalSize > 100000) { // 100KB
              const partialResponse = Buffer.concat(chunks);
              chunks.length = 0; // Очищаем для следующих чанков
              
              // Можно реализовать стриминг для очень больших ответов
            }
          });

          socket.on('close', () => {
            resolve(Buffer.concat(chunks));
          });

          socket.on('timeout', () => {
            socket.destroy();
            resolve(Buffer.concat(chunks));
          });
        });

        const result = await responsePromise;
        const duration = Date.now() - startTime;

        this.stats.bytesTransferred += result.length;
        this.stats.totalConnections++;

        res.json({
          success: true,
          data: result.toString('base64'),
          bytes: result.length,
          duration: `${duration}ms`,
          speed: `${Math.round(result.length / (duration || 1))} KB/s`
        });

      } catch (error) {
        res.status(500).json({ 
          error: error.message,
          host: host
        });
      } finally {
        if (!socket.destroyed) {
          socket.destroy();
        }
      }
    });

    // Health check с статистикой
    app.get('/stats', (req, res) => {
      res.json({
        status: 'high_performance',
        version: '2.0.0',
        uptime: process.uptime(),
        ...this.stats,
        memory: process.memoryUsage()
      });
    });

    // Bulk processing для множественных запросов
    app.post('/bulk', async (req, res) => {
      const requests = req.body.requests || [];
      const results = [];

      // Обрабатываем до 10 запросов параллельно
      const concurrentRequests = requests.slice(0, 10).map(async (request) => {
        try {
          const response = await axios.post(`http://localhost:${PORT}/fast-tunnel`, request);
          results.push({ ...response.data, host: request.host });
        } catch (error) {
          results.push({ error: error.message, host: request.host });
        }
      });

      await Promise.all(concurrentRequests);
      res.json({ results });
    });
  }

  start() {
    this.setupRoutes();
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 BPN High-Speed Server on port ${PORT}`);
      console.log('⚡ Optimized for full traffic tunneling');
      console.log('📊 Ready for high-volume traffic');
    });

    // Оптимизация сервера
    server.keepAliveTimeout = 30000;
    server.headersTimeout = 35000;
  }
}

new HighSpeedBPN().start();
