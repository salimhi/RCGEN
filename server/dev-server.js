import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

// 1. Ensure root .env is loaded if present
try {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (envErr) {
  console.warn('[DevServer] Could not parse .env:', envErr.message);
}

// 2. Import DATA_MODE and log startup state
import { DATA_MODE } from './data-layer.js';

import dns from 'dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
const geminiModel = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';
const storagePath = '.data/storage.json';
const modeDisplay = DATA_MODE === 'supabase' ? 'supabase' : `local (${storagePath})`;

console.log(`\n==================================================`);
console.log(`Data mode: ${modeDisplay}`);
console.log(`Gemini key loaded: ${hasGemini ? 'yes' : 'no'} (model: ${geminiModel})`);
console.log(`==================================================\n`);

/**
 * Thin dev server middleware mapping /api/* requests directly to /api/<route>.js handlers.
 * Guarantees 100% parity with Vercel Serverless execution.
 */
export function createDevApiMiddleware() {
  return async function devApiMiddleware(req, res, next) {
    if (!req.url?.startsWith('/api/')) return next();

    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = parsedUrl.pathname;
      const routeName = pathname.replace(/^\/api\//, '').split('/')[0].split('?')[0];

      if (!routeName) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'Endpoint not found' }));
      }

      const handlerFilePath = path.join(process.cwd(), 'api', `${routeName}.js`);
      if (!fs.existsSync(handlerFilePath)) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: `Route /api/${routeName} not found` }));
      }

      // Add Vercel-compatible helper methods to res
      if (!res.status) {
        res.status = function (code) {
          res.statusCode = code;
          return res;
        };
      }

      if (!res.json) {
        res.json = function (data) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
          return res;
        };
      }

      // Add query parameters
      req.query = Object.fromEntries(parsedUrl.searchParams.entries());

      // Parse JSON body for mutation requests
      if (req.method === 'POST' || req.method === 'DELETE' || req.method === 'PUT') {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const rawBody = Buffer.concat(chunks).toString('utf-8');
        try {
          req.body = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          req.body = {};
        }
      }

      // Import handler dynamically
      const handlerModule = await import(pathToFileURL(handlerFilePath).href);
      const handler = handlerModule.default;

      if (typeof handler !== 'function') {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: `Handler in api/${routeName}.js is not a function` }));
      }

      return await handler(req, res);
    } catch (err) {
      console.error('[DevServer] Internal Error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: err?.message || 'Internal dev server error' }));
    }
  };
}
