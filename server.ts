/**
 * FireScope — Multi-Satellite Fire Observation & Triage Dashboard
 * Backend Server & API Proxy Runtime
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import {
  getFirmsServiceStatus,
  queryFirmsHotspots,
  SUPPORTED_SENSORS,
  SUPPORTED_REGION_PRESETS,
} from './server/firmsService';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '10mb' }));

  // API Route: Health Check
  app.get('/api/health', (_req, res) => {
    const status = getFirmsServiceStatus();
    res.json({
      status: 'healthy',
      app: 'FireScope',
      service: 'Multi-Satellite Fire Observation & Triage Service',
      version: '1.0.0',
      timestampUtc: new Date().toISOString(),
      firmsApiConfigured: status.configured,
    });
  });

  // API Route: FIRMS Key & Service Status (safe, never returns the secret key)
  app.get('/api/firms/status', (req, res) => {
    const clientKey = (req.query.mapKey as string) || (req.headers['x-firms-map-key'] as string);
    const status = getFirmsServiceStatus(clientKey ? clientKey.trim() : undefined);
    res.json(status);
  });

  // API Route: Supported Sensors & Geographic Presets
  app.get('/api/firms/options', (_req, res) => {
    res.json({
      sensors: SUPPORTED_SENSORS,
      regionPresets: SUPPORTED_REGION_PRESETS,
      dayRangeLimits: { min: 1, max: 5, default: 1 },
    });
  });

  // API Route: Live NASA FIRMS Data Query Proxy
  app.post('/api/firms/query', async (req, res) => {
    const {
      source = 'MULTI_CONSTELLATION',
      bbox = '68.1,8.0,97.4,37.1',
      dayRange = 1,
      date,
      regionName = 'India — National Envelope (Coordinates: 68.1°E to 97.4°E, 8.0°N to 37.1°N)',
      countryName = 'India',
      bypassCache = false,
      mapKey: clientKey,
    } = req.body || {};

    const headerKey = req.headers['x-firms-map-key'] as string | undefined;
    const effectiveKey = (clientKey || headerKey || '').trim() || undefined;

    const status = getFirmsServiceStatus(effectiveKey);

    // If FIRMS_MAP_KEY is missing, gracefully return configuration guidance
    if (!status.configured) {
      return res.status(200).json({
        success: false,
        configured: false,
        code: 'MISSING_KEY',
        error: 'FIRMS_MAP_KEY is not configured in server environment or client. FireScope is operating in synthetic demonstration mode.',
        help: 'To activate live satellite streaming, obtain a free NASA MAP_KEY from https://firms.modaps.eosdis.nasa.gov/api/map_key and configure it in Settings or server secrets.',
        mode: 'SYNTHETIC_DEMO',
        observations: [],
        recordCount: 0,
      });
    }

    try {
      const result = await queryFirmsHotspots({
        source,
        bbox,
        dayRange: Number(dayRange),
        date: date ? String(date) : undefined,
        regionName,
        countryName,
        bypassCache: Boolean(bypassCache),
        mapKey: effectiveKey,
      });

      res.json({
        ...result,
        configured: true,
        mode: 'LIVE_FIRMS',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error during FIRMS query';
      const statusCode = message.includes('Unauthorized') ? 401 :
                         message.includes('rate limit') ? 429 :
                         message.includes('timed out') ? 504 : 400;

      res.status(statusCode).json({
        success: false,
        configured: true,
        error: message,
        mode: 'LIVE_FIRMS',
        observations: [],
        recordCount: 0,
      });
    }
  });

  // Mount Vite middleware in development
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FireScope] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[FireScope] Server failed to start:', err);
  process.exit(1);
});
