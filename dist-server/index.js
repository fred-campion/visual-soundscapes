import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { setupApiRoutes } from './routes/api.js';
import { setupLyriaProxy } from './routes/lyria-proxy.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
// SPA fallback - serve index.html for any non-API routes
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
        res.sendFile(path.join(distPath, 'index.html'));
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
