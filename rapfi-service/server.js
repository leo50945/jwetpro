'use strict';

const http = require('node:http');
const { chooseRapfiMove } = require('./rapfi-engine');

const PORT = Number(process.env.PORT || 8080);
const SERVICE_TOKEN = String(process.env.RAPFI_SERVICE_TOKEN || '');

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function authorized(req) {
  if (!SERVICE_TOKEN) return false;
  const header = String(req.headers.authorization || '');
  return header === `Bearer ${SERVICE_TOKEN}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 100000) reject(new Error('payload-too-large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') return sendJson(res, 200, { ok: true });
  if (req.method !== 'POST' || req.url !== '/move') return sendJson(res, 404, { error: 'not-found' });
  if (!authorized(req)) return sendJson(res, 401, { error: 'unauthorized' });
  try {
    const input = JSON.parse(await readBody(req));
    const board = input?.board;
    const symbol = input?.symbol;
    if (!Array.isArray(board) || board.length !== 400 || !['X', 'O'].includes(symbol)) {
      return sendJson(res, 400, { error: 'invalid-position' });
    }
    const move = await chooseRapfiMove(board, symbol);
    return sendJson(res, 200, { move });
  } catch (error) {
    console.error('Rapfi request failed:', error?.stack || error);
    return sendJson(res, 500, { error: 'engine-failed' });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`Rapfi service listening on ${PORT}`));