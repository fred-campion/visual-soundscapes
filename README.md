# Visual Soundscapes

Turn images into personalized, infinite audio streams powered by AI.

## Run Locally

**Prerequisites:** Node.js 20+

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env.local` file with your API keys:
   ```
   API_KEY=your_gemini_api_key
   VITE_GIPHY_API_KEY=your_giphy_api_key
   ```

3. Start the backend server (in one terminal):
   ```bash
   npm run dev:server
   ```

4. Start the frontend (in another terminal):
   ```bash
   npm run dev
   ```

5. Open http://localhost:5173 in your browser

## Architecture

The app uses a backend proxy to protect API keys:

- **Frontend** (Vite + React) runs on port 5173
- **Backend** (Express) runs on port 3001
- All Google API calls are proxied through the backend
- API keys are never exposed to the browser

## Production Build

```bash
npm run build
npm run start
```

This builds the frontend and compiles the server, then runs Express to serve both static files and API routes on port 8080.

## Deployment

The app is configured for Google Cloud Run. The Dockerfile handles building and running the production server.
