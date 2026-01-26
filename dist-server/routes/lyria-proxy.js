import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI } from '@google/genai';
const activeSessions = new Map();
export function setupLyriaProxy(server) {
    const wss = new WebSocketServer({
        server,
        path: '/ws/lyria'
    });
    console.log('Lyria WebSocket proxy configured at /ws/lyria');
    wss.on('connection', (clientWs) => {
        console.log('Lyria: Client connected');
        let googleSession = null;
        let isConnected = false;
        const client = new GoogleGenAI({
            apiKey: process.env.API_KEY,
            apiVersion: "v1alpha"
        });
        clientWs.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                // Handle initial setup - create connection to Google
                if (message.setup) {
                    try {
                        const connectPromise = client.live.music.connect({
                            model: message.setup.model || 'models/lyria-realtime-exp',
                            callbacks: {
                                onopen: () => {
                                    isConnected = true;
                                    if (clientWs.readyState === WebSocket.OPEN) {
                                        clientWs.send(JSON.stringify({ type: 'connected' }));
                                    }
                                },
                                onmessage: (msg) => {
                                    // Handle setupComplete as our "connected" signal
                                    if (msg.setupComplete) {
                                        console.log('Lyria: Connection ready');
                                        isConnected = true;
                                        if (clientWs.readyState === WebSocket.OPEN) {
                                            clientWs.send(JSON.stringify({ type: 'connected' }));
                                        }
                                        return;
                                    }
                                    // Forward audio and other messages to client
                                    if (clientWs.readyState === WebSocket.OPEN) {
                                        clientWs.send(JSON.stringify(msg));
                                    }
                                },
                                onclose: () => {
                                    console.log('Lyria: Google connection closed');
                                    isConnected = false;
                                    if (clientWs.readyState === WebSocket.OPEN) {
                                        clientWs.send(JSON.stringify({ type: 'closed' }));
                                    }
                                },
                                onerror: (err) => {
                                    console.error('Lyria: Error:', err?.message || err);
                                    if (clientWs.readyState === WebSocket.OPEN) {
                                        clientWs.send(JSON.stringify({ type: 'error', error: err?.message || String(err) }));
                                    }
                                }
                            }
                        });
                        googleSession = await connectPromise;
                        activeSessions.set(clientWs, { clientWs, googleSession, isConnected: true });
                    }
                    catch (err) {
                        console.error('Lyria: Failed to connect:', err.message);
                        if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(JSON.stringify({ type: 'error', error: err.message }));
                        }
                    }
                    return;
                }
                // Forward other messages to Google session
                if (googleSession && isConnected) {
                    if (message.musicGenerationConfig) {
                        await googleSession.setMusicGenerationConfig(message);
                    }
                    else if (message.clientContent?.weightedPrompts) {
                        await googleSession.setWeightedPrompts({
                            weightedPrompts: message.clientContent.weightedPrompts
                        });
                    }
                    else if (message.playbackControl === 'PLAY') {
                        await googleSession.play();
                    }
                    else if (message.playbackControl === 'PAUSE') {
                        await googleSession.pause?.();
                    }
                }
            }
            catch (err) {
                console.error('Lyria: Error processing message:', err.message);
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({ type: 'error', error: err.message }));
                }
            }
        });
        clientWs.on('close', () => {
            console.log('Lyria: Client disconnected');
            const session = activeSessions.get(clientWs);
            if (session?.googleSession) {
                try {
                    if (typeof session.googleSession.close === 'function') {
                        session.googleSession.close();
                    }
                }
                catch (e) {
                    // Ignore close errors
                }
            }
            activeSessions.delete(clientWs);
        });
        clientWs.on('error', (err) => {
            console.error('Lyria: WebSocket error:', err.message);
            activeSessions.delete(clientWs);
        });
    });
}
