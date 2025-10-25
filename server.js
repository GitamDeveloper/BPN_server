const express = require('express');
const http = require('http');
const net = require('net');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store active connections
const connections = new Map();
let connectionId = 0;

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    connections: connections.size,
    maxConnections: 20
  });
});

// WebSocket connection for real-time tunneling
wss.on('connection', (ws) => {
  const connId = (++connectionId).toString();
  let targetSocket = null;
  
  console.log(`🔗 WebSocket connection established: ${connId}`);
  
  connections.set(connId, { ws, targetSocket });
  
  ws.on('message', async (data) => {
    try {
      // Handle binary data directly
      if (Buffer.isBuffer(data)) {
        // Binary data - forward to target
        if (targetSocket && !targetSocket.destroyed) {
          targetSocket.write(data);
        }
        return;
      }
      
      // Text data - parse as JSON for control messages
      const message = JSON.parse(data);
      
      if (message.type === 'connect') {
        // Create TCP connection to target
        const { host, port } = message;
        
        targetSocket = new net.Socket();
        targetSocket.setNoDelay(true);
        targetSocket.setTimeout(30000);
        
        targetSocket.connect(port, host, () => {
          console.log(`✅ Tunnel ${connId} connected to ${host}:${port}`);
          ws.send(JSON.stringify({ type: 'connected' }));
        });
        
        targetSocket.on('data', (data) => {
          // Send binary data back to client via WebSocket
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data); // Send as binary
          }
        });
        
        targetSocket.on('close', () => {
          console.log(`🔒 Tunnel ${connId} closed`);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'closed' }));
          }
          connections.delete(connId);
        });
        
        targetSocket.on('error', (err) => {
          console.error(`Tunnel ${connId} error:`, err.message);
          connections.delete(connId);
        });
        
        connections.set(connId, { ws, targetSocket });
      }
      
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    if (targetSocket) {
      targetSocket.destroy();
    }
    connections.delete(connId);
    console.log(`🔒 WebSocket closed: ${connId}`);
  });
  
  ws.on('error', (err) => {
    console.error(`WebSocket error ${connId}:`, err);
    if (targetSocket) {
      targetSocket.destroy();
    }
    connections.delete(connId);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 BPN Universal Server on port ${PORT}`);
  console.log(`🔗 WebSocket tunneling enabled`);
});
