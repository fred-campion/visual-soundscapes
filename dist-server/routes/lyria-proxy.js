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
        console.log('Client connected to Lyria proxy');
        let googleSession = null;
        let isConnected = false;
        // Initialize Google GenAI client with v1alpha for music features
        const client = new GoogleGenAI({
            apiKey: process.env.API_KEY,
            apiVersion: "v1alpha"
        });
        // Handle messages from the client
        clientWs.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log('Received from client:', Object.keys(message));
                // Handle initial setup - create connection to Google
                if (message.setup) {
                    try {
                        // Connect to Lyria via Google's SDK
                        googleSession = await client.live.music.connect({
                            model: message.setup.model || 'models/lyria-realtime-exp',
                            callbacks: {
                                onopen: () => {
                                    console.log('Connected to Google Lyria');
                                    isConnected = true;
                                    // Notify client that connection is open
                                    if (clientWs.readyState === WebSocket.OPEN) {
                                        clientWs.send(JSON.stringify({ type: 'connected' }));
                                    }
                                },
                                onmessage: (msg) => {
                                    // Forward messages from Google to client
                                    if (clientWs.readyState === WebSocket.OPEN) {
                                        clientWs.send(JSON.stringify(msg));
                                    }
                                },
                                onclose: () => {
                                    console.log('Google Lyria connection closed');
                                    isConnected = false;
                                    if (clientWs.readyState === WebSocket.OPEN) {
                                        clientWs.send(JSON.stringify({ type: 'closed' }));
                                    }
                                },
                                onerror: (err) => {
                                    console.error('Google Lyria error:', err);
                                    if (clientWs.readyState === WebSocket.OPEN) {
                                        clientWs.send(JSON.stringify({ type: 'error', error: err.message }));
                                    }
                                }
                            }
                        });
                        activeSessions.set(clientWs, { clientWs, googleSession, isConnected: true });
                    }
                    catch (err) {
                        console.error('Failed to connect to Lyria:', err);
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
                console.error('Error processing client message:', err);
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({ type: 'error', error: err.message }));
                }
            }
        });
        // Handle client disconnect
        clientWs.on('close', () => {
            console.log('Client disconnected from Lyria proxy');
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
            console.error('Client WebSocket error:', err);
            activeSessions.delete(clientWs);
        });
    });
}
