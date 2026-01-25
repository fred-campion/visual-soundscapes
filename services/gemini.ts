
import { GoogleGenAI } from "@google/genai";
import { UploadedImage, VibeAnalysis } from "../types";
import { AudioStreamer } from "./audio-streamer";

// Initialize Standard API Client for Text/Image (v1beta or default)
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Step 1: Fuse images (Updated config)
 */
export const fuseImages = async (images: UploadedImage[]): Promise<string> => {
  try {
    const imageParts = images.map(img => ({
      inlineData: {
        mimeType: img.mimeType,
        data: img.base64,
      },
    }));

    const prompt = `
    Combine these images into a cohesive, well-designed album cover. DO NOT include any text. DO NOT add new people. 
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview', 
      contents: {
        parts: [
          ...imageParts,
          { text: prompt }
        ]
      },
      config: {
        imageConfig: {
            aspectRatio: "1:1",
            imageSize: "1K"
        }
      }
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
        for (const part of parts) {
            if (part.inlineData) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
    }
    
    throw new Error("No image generated");
  } catch (error) {
    console.error("Fusion Error:", error);
    throw error;
  }
};

/**
 * Step 2: Analyze Vibe
 */
export const analyzeVibe = async (base64Image: string): Promise<VibeAnalysis> => {
  try {
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
            { inlineData: { mimeType: 'image/png', data: cleanBase64 } },
            {
                text: `Analyze this album cover. Determine TWO distinct musical genres/instruments that fit the visual.

                Constraints:
                - "genres": Identify TWO distinct genres.  
                    ↳ One genre MUST be highly specific and include as much information as possible about the style, era/ and location the album is most likely from. (E.g. 1970s French Disco, 1990s Deep Piano House, Contemporary Irish Folk...etc. 
                    ↳ The other genre should ONLY be the name of an instrument. (E.g. Piano, Acoustic Guitar, Synthesizer, Drum Machine...etc.)

                Return JSON object: { "genres": ["name1", "name2"] }.`
            }
        ]
      },
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (!text) throw new Error("No analysis received");
    
    const parsed = JSON.parse(text);
    const genresRecord: Record<string, number> = {};
    if (Array.isArray(parsed.genres)) {
        parsed.genres.forEach((g: any) => {
            // Handle both string array and object array formats
            const genreName = typeof g === 'string' ? g : g.name;
            if (genreName) {
                genresRecord[genreName] = 0.25; // Default weight for all genres
            }
        });
    }
    
    // Ensure we have at least one genre
    if (Object.keys(genresRecord).length === 0) {
        throw new Error("No genres detected. Please try again.");
    }

    return {
        genres: genresRecord
    };

  } catch (error: any) {
    console.error("Vibe Check Error:", error);
    if (error.message === "No genres detected. Please try again.") {
        throw new Error("Soundscape generation failed. Please try again.");
    }
    throw new Error("Unexpected error. Please try again.");
  }
};

/**
 * Step 3: Generate GIF Search Term
 */
export const generateGifSearchTerm = async (base64Image: string): Promise<string> => {
  try {
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
            { inlineData: { mimeType: 'image/png', data: cleanBase64 } },
            { text: "Analyze this image and generate a single search word for Giphy that captures its visual aesthetic and vibe. Keep it simple and be specific — avoid obscure words that can have multiple meanings and would result in GIFs not related to the image. Return ONLY the single word." }
        ]
      }
    });

    const text = response.text;
    if (!text) return "abstract";
    
    return text.trim();
  } catch (error) {
    console.error("GIF Search Term Error:", error);
    return "abstract";
  }
};

/**
 * Step 4: Fetch Stickers from Giphy
 */
export const fetchGifs = async (searchTerm: string): Promise<string[]> => {
    try {
        console.log("Fetching stickers for term:", searchTerm);
        const apiKey = import.meta.env.VITE_GIPHY_API_KEY;
        const response = await fetch(`https://api.giphy.com/v1/stickers/search?api_key=${apiKey}&q=${encodeURIComponent(searchTerm)}&limit=10&rating=pg-13`);
        const data = await response.json();
                
        if (data.data && Array.isArray(data.data)) {
            const ids = data.data.map((gif: any) => gif.id);
            console.log("Sticker IDs found:", ids);
            return ids;
        }
        console.warn("No stickers found in response");
        return [];
    } catch (error) {
        console.error("Giphy Fetch Error:", error);
        return [];
    }
};

/**
 * Step 5: Generate Title
 */
export const generateTitle = async (base64Image: string, genres: string[]): Promise<string> => {
  try {
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
            { inlineData: { mimeType: 'image/png', data: cleanBase64 } },
            { text: `Analyze this album cover along with its genres ('${genres.join(", ")}').
            Generate a creative, two-word title for this album/playlist. (Roughly 20 characters)
            The title should be evocative and fit the aesthetic.
            Return ONLY the two words.` }
        ]
      }
    });

    const text = response.text;
    if (!text) return "Visual Soundscapes";
    
    return text.trim();
  } catch (error) {
    console.error("Title Generation Error:", error);
    return "Visual Soundscapes";
  }
};

/**
 * LYRIA REALTIME MANAGER
 * Handles the WebSocket connection to lyria-realtime-exp using specialized music methods
 */
export class LyriaManager {
    private session: any = null;
    private streamer: AudioStreamer;
    public isConnected: boolean = false;
    private hasReceivedAudio: boolean = false;

    constructor() {
        this.streamer = new AudioStreamer();
    }

    /**
     * Connects to the Lyria Realtime model
     */
    async connect(vibe: VibeAnalysis, onAudioReady?: () => void) {
        this.streamer.initialize();
        this.hasReceivedAudio = false;
        
        console.log("Connecting to Lyria Realtime...");

        // CRITICAL: Initialize a client with v1alpha to access experimental music features
        const client = new GoogleGenAI({ 
            apiKey: process.env.API_KEY,
            apiVersion: "v1alpha" 
        });

        try {
            // Access the specific 'music' namespace on 'live'
            this.session = await (client.live as any).music.connect({
                model: 'models/lyria-realtime-exp',
                callbacks: {
                    onopen: () => {
                        console.log("Lyria Connection Opened");
                        this.isConnected = true;
                    },
                    onmessage: (msg: any) => {
                        // Handle Audio Chunks specific to Music model
                        if (msg.serverContent?.audioChunks) {
                            // Signal that audio has actually started arriving
                            if (!this.hasReceivedAudio && onAudioReady) {
                                this.hasReceivedAudio = true;
                                onAudioReady();
                            }

                            for (const chunk of msg.serverContent.audioChunks) {
                                // data is base64 encoded PCM
                                this.streamer.playChunk(chunk.data);
                            }
                        }
                    },
                    onclose: () => {
                        console.log("Lyria Connection Closed");
                        this.isConnected = false;
                    },
                    onerror: (err: any) => {
                        console.error("Lyria Connection Error:", err);
                        this.isConnected = false;
                    }
                }
            });

            // 1. Set Configuration
            await this.session.setMusicGenerationConfig({
                musicGenerationConfig: {
                    guidance: 6.0, 
                    temperature: 1
                }
            });

            // 2. Set Prompts (Granular Mixing)
            // We mix genres individually
            const weightedPrompts = [
                ...Object.entries(vibe.genres).map(([genre, weight]) => ({
                    text: genre,
                    weight: Number(weight)
                }))
            ];

            await this.session.setWeightedPrompts({
                weightedPrompts: weightedPrompts
            });
            
            // 3. Start Playback
            await this.session.play();
            
            // Mark as connected after successful play, BUT we wait for onmessage to trigger visuals
            this.isConnected = true;
            console.log("Lyria Connected & Playing");

        } catch (err) {
            console.error("Lyria Connection Failed:", err);
            this.disconnect();
            throw err;
        }
    }

    /**
     * Updates the mix by sending new weighted prompts
     */
    async updateMix(genres: Record<string, number>) {
        if (!this.session || !this.isConnected) {
            console.warn("updateMix called but session not connected");
            return;
        }
        
        try {
            const weightedPrompts = [
                ...Object.entries(genres).map(([genre, weight]) => ({
                    text: genre,
                    weight: Number(weight)
                }))
            ];

            console.log("Sending weighted prompts to Lyria:", weightedPrompts);
            
            await this.session.setWeightedPrompts({
                weightedPrompts: weightedPrompts
            });
            
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
        if (this.session) {
            try { 
                if (typeof this.session.close === 'function') {
                    this.session.close(); 
                }
            } catch(e) {} 
        }
        this.streamer.stop();
        this.session = null;
    }
}
