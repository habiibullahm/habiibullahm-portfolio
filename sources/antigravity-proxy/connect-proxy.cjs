// Minimal HTTP CONNECT proxy. Loopback only, allowlisted hosts, port 443 only. No logging of payloads.
const http = require('http');
const net = require('net');

const PORT = 18080;
const ALLOW = [
  /(^|\.)googleapis\.com$/,
  /(^|\.)google\.com$/,
  /^ipinfo\.io$/,
  /(^|\.)codebuddy\.ai$/,
  /(^|\.)tencent\.com$/,
  /(^|\.)minimax(i)?\.(com|cn|io)$/,
  /(^|\.)deepseek\.com$/,
  /(^|\.)openrouter\.ai$/,
  /(^|\.)groq\.com$/,
  /(^|\.)anthropic\.com$/,
  /(^|\.)opencode\.ai$/
];

const server = http.createServer((req, res) => {
  res.writeHead(405);
  res.end('CONNECT only');
});

server.on('connect', (req, clientSocket, head) => {
  const [host, portStr] = req.url.split(':');
  const port = Number(portStr || 443);
  if (port !== 443 || !ALLOW.some((re) => re.test(host))) {
    clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    console.log(new Date().toISOString(), 'blocked', host, port);
    return;
  }
  const upstream = net.connect({ port, host, timeout: 10000 });
  // A CONNECT that never completes is worse than a failed one: 9Router waits forever.
  upstream.on('timeout', () => {
    console.log(new Date().toISOString(), 'timeout', host);
    clientSocket.end('HTTP/1.1 504 Gateway Timeout\r\n\r\n');
    upstream.destroy();
  });
  upstream.on('connect', () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head && head.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  const close = () => { upstream.destroy(); clientSocket.destroy(); };
  upstream.on('error', (e) => { console.log(new Date().toISOString(), 'upstream error', host, e.code || e.message); close(); });
  clientSocket.on('error', close);
  console.log(new Date().toISOString(), 'tunnel', host);
});

server.listen(PORT, '127.0.0.1', () => console.log('proxy listening on 127.0.0.1:' + PORT));
