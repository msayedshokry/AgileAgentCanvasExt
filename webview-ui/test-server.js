const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Root directory for serving
const ROOT = __dirname;

const server = http.createServer((req, res) => {
  let url = req.url === '/' ? '/test-3d-force-graph.html' : req.url;
  const filePath = path.join(ROOT, url);

  try {
    const content = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    const types = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found: ' + url);
  }
});

const PORT = 8767;
server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/test-3d-force-graph.html`;
  console.log(`Server: ${url}`);

  // Try to open Chrome
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  try {
    exec(`"${chromePath}" "${url}"`);
    console.log('Chrome opened');
  } catch {
    try {
      exec(`start ${url}`);
      console.log('Default browser opened');
    } catch {
      console.log('Could not open browser, navigate to: ' + url);
    }
  }
});
