const express = require('express');
const http = require('http');
const net = require('net');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    connections: Array.from(wss.clients).length
  });
});

// WebSocket connection for real-time tunneling
wss.on('connection', (ws) => {
  let targetSocket = null;
  
  console.log('🔗 New WebSocket connection');
  
  ws.on('message', async (data) => {
    try {
      // First message should be connection info
      if (!targetSocket) {
        const connectInfo = JSON.parse(data);
        const { host, port } = connectInfo;
        
        console.log(`🔗 Creating tunnel to ${host}:${port}`);
        
        targetSocket = new net.Socket();
        targetSocket.setNoDelay(true);
        
        targetSocket.connect(port, host, () => {
          console.log(`✅ Tunnel connected to ${host}:${port}`);
          ws.send(JSON.stringify({ type: 'connected' }));
        });
        
        targetSocket.on('data', (data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data); // Send raw binary data
          }
        });
        
        targetSocket.on('close', () => {
          console.log(`🔒 Tunnel to ${host}:${port} closed`);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'closed' }));
          }
          ws.close();
        });
        
        targetSocket.on('error', (err) => {
          console.error(`Tunnel error to ${host}:${port}:`, err.message);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: err.message }));
          }
          ws.close();
        });
        
      } else {
        // Subsequent messages are data to forward
        if (targetSocket && !targetSocket.destroyed) {
          targetSocket.write(data); // data is already a Buffer
        }
      }
      
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    if (targetSocket) {
      targetSocket.destroy();
    }
    console.log('🔒 WebSocket connection closed');
  });
  
  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    if (targetSocket) {
      targetSocket.destroy();
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 BPN Universal Server on port ${PORT}`);
  console.log(`🔗 WebSocket tunneling ready`);
});
