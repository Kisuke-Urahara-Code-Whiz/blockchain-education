const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const { exec } = require('child_process');
const app = express();

// Generate a random token for this session
const AUTH_TOKEN = Math.random().toString(36).substring(7);

async function setupProxy() {
  // Enable CORS for all routes
  app.use(cors({
    origin: [
      'https://blockchain-education.vercel.app',
      'http://localhost:5173',
      'http://localhost:3000'
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
    credentials: true
  }));

  app.use(express.json());

  // Handle preflight requests
  app.options('*', cors());

  // Log requests
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });

  // Add CORS headers to all responses
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-auth-token');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // Handle OPTIONS requests
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // IPFS proxy
  const ipfsProxy = createProxyMiddleware({
    target: 'http://127.0.0.1:5001',
    changeOrigin: true,
    ws: true,
    onProxyReq: (proxyReq, req, res) => {
      // Add auth token
      proxyReq.setHeader('x-auth-token', AUTH_TOKEN);
      
      // Copy origin
      if (req.headers.origin) {
        proxyReq.setHeader('origin', req.headers.origin);
      }

      // Remove problematic headers
      proxyReq.removeHeader('authorization');
      proxyReq.removeHeader('www-authenticate');
    },
    onProxyRes: (proxyRes, req, res) => {
      // Set CORS headers
      proxyRes.headers['access-control-allow-origin'] = req.headers.origin || '*';
      proxyRes.headers['access-control-allow-methods'] = 'GET,POST,OPTIONS';
      proxyRes.headers['access-control-allow-headers'] = 'Content-Type, Authorization, x-auth-token';
      proxyRes.headers['access-control-allow-credentials'] = 'true';
      
      // Remove auth headers
      delete proxyRes.headers['www-authenticate'];
    },
    pathRewrite: {
      '^/api/v0': '/api/v0'
    }
  });

  // Mount proxy
  app.use('/api/v0', ipfsProxy);

  // Error handler
  app.use((err, req, res, next) => {
    console.error('Proxy Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return new Promise((resolve) => {
    const server = app.listen(5002, '127.0.0.1', () => {
      console.log('Proxy server started on port 5002');
      resolve(5002);
    });
  });
}

async function startTunnel() {
  try {
    const port = await setupProxy();
    
    // Use npx to run localtunnel
    const tunnel = exec(`npx localtunnel --port ${port} --subdomain blockchain-education-ipfs`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Tunnel error: ${error}`);
        return;
      }
      if (stderr) {
        console.error(`Tunnel stderr: ${stderr}`);
        return;
      }
      console.log(`Tunnel stdout: ${stdout}`);
    });

    tunnel.stdout.on('data', (data) => {
      console.log('Tunnel output:', data);
      if (data.includes('your url is:')) {
        const url = data.split('your url is: ')[1].trim();
        console.log('\n=== IPFS Tunnel Started ===');
        console.log('Local URL: http://localhost:5002');
        console.log('Tunnel URL:', url);
        console.log('Auth Token:', AUTH_TOKEN);
        console.log('\nUse this URL in your Vercel env:', url);
        console.log('===========================\n');
      }
    });

    tunnel.stderr.on('data', (data) => {
      console.error('Tunnel error:', data);
    });

    tunnel.on('close', (code) => {
      console.log('Tunnel closed with code:', code);
      console.log('Restarting tunnel...');
      setTimeout(startTunnel, 1000);
    });

  } catch (err) {
    console.error('Error:', err);
    setTimeout(startTunnel, 5000);
  }
}

// Install dependencies
try {
  require('express');
  require('http-proxy-middleware');
  require('cors');
} catch (err) {
  console.log('Installing dependencies...');
  require('child_process').execSync('npm install express http-proxy-middleware cors', {
    stdio: 'inherit'
  });
}

console.log('Starting IPFS tunnel...');
startTunnel();