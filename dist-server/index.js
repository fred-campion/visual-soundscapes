import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load .env.local only in development (when file exists)
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
    const dotenv = await import('dotenv');
    dotenv.config({ path: envPath });
    console.log('Loaded .env.local for development');
}
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { setupApiRoutes } from './routes/api.js';
import { setupLyriaProxy } from './routes/lyria-proxy.js';
const app = express();
const server = createServer(app);
// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Large limit for base64 images
// API routes
setupApiRoutes(app);
// WebSocket proxy for Lyria
setupLyriaProxy(server);
// Serve static files from the built frontend
// In production (Docker), dist is at /app/dist
// When running compiled server locally, it's at ../dist relative to dist-server
const distPath = path.resolve(__dirname, '..', 'dist');
console.log('Static files path:', distPath);
console.log('Static files exist:', fs.existsSync(distPath));
if (fs.existsSync(distPath)) {
    console.log('Static files contents:', fs.readdirSync(distPath));
}
// Log API key status (not the actual key!)
console.log('API_KEY env var:', process.env.API_KEY ? `SET (${process.env.API_KEY.length} chars)` : 'NOT SET');
app.use(express.static(distPath));
// SPA fallback - serve index.html for any non-API routes
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
        const indexPath = path.join(distPath, 'index.html');
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        }
        else {
            res.status(404).send('Frontend not built. Run npm run build:frontend');
        }
    }
});
// Use PORT env var in production (Cloud Run sets this to 8080)
// Use 3001 for local dev (Vite proxies to this)
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API routes available at /api/*`);
    console.log(`WebSocket proxy available at /ws/lyria`);
});
