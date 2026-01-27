import { UploadedImage, VibeAnalysis } from "../types";
import { AudioStreamer } from "./audio-streamer";

/**
 * Step 1: Fuse images via backend proxy
 */
export const fuseImages = async (images: UploadedImage[]): Promise<string> => {
  try {
    const response = await fetch('/api/fuse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Fusion failed');
    }

    const data = await response.json();
    return data.fusedUrl;
  } catch (error) {
    console.error("Fusion Error:", error);
    throw error;
  }
};

/**
 * Step 2: Analyze Vibe via backend proxy
 */
export const analyzeVibe = async (base64Image: string): Promise<VibeAnalysis> => {
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Analysis failed');
    }

    const data = await response.json();
    return data.vibe;
  } catch (error: any) {
    console.error("Vibe Check Error:", error);
    if (error.message === "No genres detected") {
      throw new Error("Soundscape generation failed. Please try again.");
    }
    throw new Error("Unexpected error. Please try again.");
  }
};

/**
 * Step 3: Generate GIF Search Term via backend proxy
 */
export const generateGifSearchTerm = async (base64Image: string): Promise<string> => {
  try {
    const response = await fetch('/api/gif-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image })
    });

    const data = await response.json();
    return data.searchTerm || "abstract";
  } catch (error) {
    console.error("GIF Search Term Error:", error);
    return "abstract";
  }
};

/**
 * Step 4: Fetch Stickers from Giphy via backend proxy
 */
export const fetchGifs = async (searchTerm: string): Promise<string[]> => {
  try {
    console.log("Fetching stickers for term:", searchTerm);
    const response = await fetch(`/api/giphy?q=${encodeURIComponent(searchTerm)}`);
    const data = await response.json();
            
    if (data.ids && Array.isArray(data.ids)) {
      console.log("Sticker IDs found:", data.ids);
      return data.ids;
    }
    console.warn("No stickers found in response");
    return [];
  } catch (error) {
    console.error("Giphy Fetch Error:", error);
    return [];
  }
};

/**
 * Step 5: Generate Title via backend proxy
 */
export const generateTitle = async (base64Image: string, genres: string[]): Promise<string> => {
  try {
    const response = await fetch('/api/title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image, genres })
    });

    const data = await response.json();
    return data.title || "Visual Soundscapes";
  } catch (error) {
    console.error("Title Generation Error:", error);
    return "Visual Soundscapes";
  }
};

/**
 * LYRIA REALTIME MANAGER
 * Handles the WebSocket connection via the backend proxy
 */
export class LyriaManager {
  private ws: WebSocket | null = null;
  private streamer: AudioStreamer;
  public isConnected: boolean = false;
  private hasReceivedAudio: boolean = false;
  private onAudioReadyCallback?: () => void;

  constructor() {
    this.streamer = new AudioStreamer();
  }

  /**
   * Connects to the Lyria Realtime model via proxy
   */
  async connect(vibe: VibeAnalysis, onAudioReady?: () => void) {
    this.streamer.initialize();
    this.hasReceivedAudio = false;
    this.onAudioReadyCallback = onAudioReady;
    
    console.log("Connecting to Lyria Realtime via proxy...");

    return new Promise<void>((resolve, reject) => {
      // Determine WebSocket URL based on current location
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/lyria`;
      
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("WebSocket connected to proxy");
        
        // Send setup message to initiate Lyria connection
        this.ws!.send(JSON.stringify({
          setup: { model: 'models/lyria-realtime-exp' }
        }));
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          // Handle connection confirmation
          if (msg.type === 'connected') {
            console.log("Lyria proxy connection established");
            this.isConnected = true;
            
            // Send configuration
            this.ws!.send(JSON.stringify({
              musicGenerationConfig: {
                guidance: 6.0,
                temperature: 1
              }
            }));

            // Send weighted prompts
            const weightedPrompts = Object.entries(vibe.genres).map(([genre, weight]) => ({
              text: genre,
              weight: Number(weight)
            }));

            this.ws!.send(JSON.stringify({
              clientContent: { weightedPrompts }
            }));

            // Start playback
            this.ws!.send(JSON.stringify({
              playbackControl: 'PLAY'
            }));

            console.log("Lyria Connected & Playing");
            resolve();
            return;
          }

          // Handle audio chunks from Lyria
          if (msg.serverContent?.audioChunks) {
            if (!this.hasReceivedAudio && this.onAudioReadyCallback) {
              this.hasReceivedAudio = true;
              this.onAudioReadyCallback();
            }

            for (const chunk of msg.serverContent.audioChunks) {
              this.streamer.playChunk(chunk.data);
            }
          }

          // Handle connection closed
          if (msg.type === 'closed') {
            console.log("Lyria Connection Closed");
            this.isConnected = false;
          }

          // Handle errors
          if (msg.type === 'error') {
            console.error("Lyria Error:", msg.error);
            reject(new Error(msg.error));
          }
        } catch (e) {
          console.error("Error parsing WebSocket message:", e);
        }
      };

      this.ws.onclose = () => {
        console.log("WebSocket connection closed");
        this.isConnected = false;
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        this.isConnected = false;
        reject(error);
      };
    });
  }

  /**
   * Updates the mix by sending new weighted prompts
   */
  async updateMix(genres: Record<string, number>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isConnected) {
      console.warn("updateMix called but WebSocket not connected");
      return;
    }
    
    try {
      const weightedPrompts = Object.entries(genres).map(([genre, weight]) => ({
        text: genre,
        weight: Number(weight)
      }));

      console.log("Sending weighted prompts to Lyria:", weightedPrompts);
      
      this.ws.send(JSON.stringify({
        clientContent: { weightedPrompts }
      }));
      
      console.log("Weighted prompts sent successfully");
    } catch (e) {
      console.error("Failed to update mix:", e);
    }
  }

  getAnalyser() {
    return this.streamer.getAnalyser();
  }

  disconnect() {
    this.isConnected = false;
    if (this.ws) {
      try { 
        this.ws.close();
      } catch(e) {} 
    }
    this.streamer.stop();
    this.ws = null;
  }
}
