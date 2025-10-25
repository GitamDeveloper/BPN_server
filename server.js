const express = require('express');
const http = require('http');
const net = require('net');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(express.raw({ 
  type: '*/*',
  limit: '10mb'
}));

class HTTPTunnelServer {
  constructor() {
    this.tcpConnections = new Map();
    this.connectionId = 0;
    this.maxConnections = 20;
  }

  setupRoutes() {
    // Health check
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        connections: this.tcpConnections.size,
        maxConnections: this.maxConnections
      });
    });

    // Создание нового TCP туннеля
    app.post('/tunnel', async (req, res) => {
      if (this.tcpConnections.size >= this.maxConnections) {
        return res.status(503).json({ error: 'Connection limit reached' });
      }

      try {
        const { host, port } = req.query;
        if (!host || !port) {
          return res.status(400).json({ error: 'Missing host or port' });
        }

        const connId = await this.createTCPTunnel(host, parseInt(port));
        res.json({ 
          connectionId: connId,
          status: 'connected'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Отправка данных через туннель
    app.post('/tunnel/:id/send', (req, res) => {
      const connId = req.params.id;
      const connection = this.tcpConnections.get(connId);

      if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      if (!req.body || req.body.length === 0) {
        return res.status(400).json({ error: 'No data provided' });
      }

      try {
        connection.socket.write(req.body);
        res.json({ status: 'sent', bytes: req.body.length });
      } catch (error) {
        this.tcpConnections.delete(connId);
        res.status(500).json({ error: 'Connection failed' });
      }
    });

    // Получение данных из туннеля (long polling)
    app.get('/tunnel/:id/receive', (req, res) => {
      const connId = req.params.id;
      const connection = this.tcpConnections.get(connId);

      if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      // Таймаут для long polling
      const timeout = setTimeout(() => {
        res.json({ data: null, status: 'timeout' });
      }, 30000);

      // Ожидаем данные
      const dataHandler = (data) => {
        clearTimeout(timeout);
        connection.dataBuffer = connection.dataBuffer ? Buffer.concat([connection.dataBuffer, data]) : data;
        
        // Отправляем накопленные данные
        res.json({
          data: connection.dataBuffer.toString('base64'),
          bytes: connection.dataBuffer.length
        });
        
        connection.dataBuffer = null;
      };

      connection.socket.once('data', dataHandler);

      // Обработка закрытия соединения
      connection.socket.once('close', () => {
        clearTimeout(timeout);
        res.json({ status: 'closed' });
      });
    });

    // Закрытие туннеля
    app.delete('/tunnel/:id', (req, res) => {
      const connId = req.params.id;
      this.closeTCPTunnel(connId);
      res.json({ status: 'closed' });
    });
  }

  async createTCPTunnel(host, port) {
    return new Promise((resolve, reject) => {
      const connId = (++this.connectionId).toString();
      
      const socket = new net.Socket();
      socket.setTimeout(25000);
      socket.setNoDelay(true);

      socket.connect(port, host, () => {
        const connection = {
          id: connId,
          socket: socket,
          host: host,
          port: port,
          createdAt: Date.now()
        };

        this.tcpConnections.set(connId, connection);

        socket.on('data', (data) => {
          // Данные будут храниться до следующего poll запроса
          if (!connection.dataBuffer) {
            connection.dataBuffer = data;
          } else {
            connection.dataBuffer = Buffer.concat([connection.dataBuffer, data]);
          }
        });

        socket.on('close', () => {
          this.tcpConnections.delete(connId);
        });

        socket.on('error', () => {
          this.tcpConnections.delete(connId);
        });

        socket.on('timeout', () => {
          socket.destroy();
          this.tcpConnections.delete(connId);
        });

        resolve(connId);
      });

      socket.on('error', reject);
    });
  }

  closeTCPTunnel(connId) {
    const connection = this.tcpConnections.get(connId);
    if (connection) {
      connection.socket.destroy();
      this.tcpConnections.delete(connId);
    }
  }
}

// Инициализация сервера
const tunnelServer = new HTTPTunnelServer();
tunnelServer.setupRoutes();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 HTTP Tunnel Server running on port ${PORT}`);
  console.log(`📍 Server location: Frankfurt (Render)`);
  console.log(`📊 Max TCP connections: ${tunnelServer.maxConnections}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down server...');
  server.close(() => {
    process.exit(0);
  });
});
