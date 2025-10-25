import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import https from 'https';
import { URL } from 'url';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebSocket VPN Server is running\n');
});

const wss = new WebSocketServer({ server });

// Храним активные соединения
const clients = new Map();

wss.on('connection', (ws, req) => {
  const clientId = generateId();
  clients.set(clientId, ws);
  
  console.log(`Client connected: ${clientId}`);
  
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);
      
      if (message.type === 'http-request') {
        await handleHttpRequest(ws, message);
      } else if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  ws.on('close', () => {
    clients.delete(clientId);
    console.log(`Client disconnected: ${clientId}`);
  });
  
  ws.on('error', (error) => {
    console.error(`WebSocket error for client ${clientId}:`, error);
    clients.delete(clientId);
  });
  
  // Отправляем приветственное сообщение
  ws.send(JSON.stringify({
    type: 'connected',
    clientId: clientId,
    message: 'Connected to WebSocket VPN'
  }));
});

async function handleHttpRequest(ws, message) {
  const { requestId, url, method, headers, body } = message;
  
  try {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: { ...headers }
    };
    
    // Удаляем неподдерживаемые заголовки
    delete options.headers['host'];
    delete options.headers['connection'];
    
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    
    const req = protocol.request(options, (res) => {
      const responseData = {
        type: 'http-response',
        requestId: requestId,
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        headers: res.headers,
        chunks: []
      };
      
      res.on('data', (chunk) => {
        responseData.chunks.push(chunk.toString('base64'));
      });
      
      res.on('end', () => {
        ws.send(JSON.stringify(responseData));
      });
    });
    
    req.on('error', (error) => {
      ws.send(JSON.stringify({
        type: 'error',
        requestId: requestId,
        error: error.message
      }));
    });
    
    // Отправляем тело запроса если есть
    if (body) {
      req.write(Buffer.from(body, 'base64'));
    }
    
    req.end();
    
  } catch (error) {
    ws.send(JSON.stringify({
      type: 'error',
      requestId: requestId,
      error: error.message
    }));
  }
}

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket VPN Server running on port ${PORT}`);
});
