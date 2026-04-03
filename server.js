require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Tenant-Id');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// API routes
app.all('/api/auth', require('./api/auth'));
app.all('/api/solicitacoes', require('./api/solicitacoes'));
app.all('/api/portal', require('./api/portal'));
app.all('/api/tenants', require('./api/tenants'));
app.all('/api/dashboard', require('./api/dashboard'));
app.all('/api/webhooks', require('./api/webhooks'));

// Widget (embeddable JS)
app.get('/widget.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.sendFile(path.join(__dirname, 'public/widget/widget.js'));
});

// Frontend routes
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/index.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/index.html')));
app.get('/portal/:tenant', (req, res) => res.sendFile(path.join(__dirname, 'public/portal/index.html')));
app.get('/portal/:tenant/*', (req, res) => res.sendFile(path.join(__dirname, 'public/portal/index.html')));

app.listen(PORT, () => {
  console.log(`troqueAI rodando em http://localhost:${PORT}`);
  console.log(`Admin:  http://localhost:${PORT}/admin`);
  console.log(`Portal: http://localhost:${PORT}/portal/{slug-da-loja}`);
});
