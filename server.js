const express = require('express');
const net = require('net');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.raw({ 
  type: '*/*', 
  limit: '100mb'
}));

class UniversalBPN {
  setupRoutes() {
    // Универсальный TCP туннель
    app.post('/connect', async (req, res) => {
      const { host, port, data } = req.body;
      
      console.log(`🔗 Connecting to ${host}:${port}`);
      
      const socket = new net.Socket();
      socket.setTimeout(15000);
      socket.setNoDelay(true);

      try {
        // Устанавливаем соединение
        await new Promise((resolve, reject) => {
          socket.connect(port || 80, host, resolve);
          socket.once('error', reject);
        });

        console.log(`✅ Connected to ${host}:${port}`);

        let response = Buffer.alloc(0);
        
        // Отправляем данные если есть
        if (data) {
          const requestData = Buffer.from(data, 'base64');
          socket.write(requestData);
        }

        // Получаем ответ
        const responseData = await new Promise((resolve) => {
          socket.on('data', (chunk) => {
            response = Buffer.concat([response, chunk]);
          });

          socket.on('close', () => resolve(response));
          socket.on('timeout', () => {
            socket.destroy();
            resolve(response);
          });
        });

        console.log(`📨 Received ${responseData.length} bytes from ${host}`);

        res.json({
          success: true,
          data: responseData.toString('base64'),
          bytes: responseData.length
        });

      } catch (error) {
        console.log(`❌ Connection failed: ${host}:${port} - ${error.message}`);
        res.status(500).json({ 
          success: false,
          error: error.message
        });
      } finally {
        if (!socket.destroyed) {
          socket.destroy();
        }
      }
    });

    // Health check
    app.get('/', (req, res) => {
      res.json({ 
        status: 'BPN Universal Tunnel',
        version: '3.0.0',
        ready: true
      });
    });
  }

  start() {
    this.setupRoutes();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 BPN Universal Server on port ${PORT}`);
    });
  }
}

new UniversalBPN().start();
