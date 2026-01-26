import { GoogleGenAI } from '@google/genai';
// Initialize the Google GenAI client with API key from environment
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });
export function setupApiRoutes(app) {
    /**
     * POST /api/fuse
     * Fuse multiple images into an album cover
     */
    app.post('/api/fuse', async (req, res) => {
        try {
            const { images } = req.body;
            if (!images || !Array.isArray(images) || images.length === 0) {
                return res.status(400).json({ error: 'No images provided' });
            }
            const ai = getAI();
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
                        const fusedUrl = `data:image/png;base64,${part.inlineData.data}`;
                        return res.json({ fusedUrl });
                    }
                }
            }
            return res.status(500).json({ error: 'No image generated' });
        }
        catch (error) {
            console.error('Fusion Error:', error);
            return res.status(500).json({ error: error.message || 'Fusion failed' });
        }
    });
    /**
     * POST /api/analyze
     * Analyze an image and return vibe/genres
     */
    app.post('/api/analyze', async (req, res) => {
        try {
            const { base64Image } = req.body;
            if (!base64Image) {
                return res.status(400).json({ error: 'No image provided' });
            }
            const ai = getAI();
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
            if (!text) {
                return res.status(500).json({ error: 'No analysis received' });
            }
            const parsed = JSON.parse(text);
            const genresRecord = {};
            if (Array.isArray(parsed.genres)) {
                parsed.genres.forEach((g) => {
                    const genreName = typeof g === 'string' ? g : g.name;
                    if (genreName) {
                        genresRecord[genreName] = 0.25;
                    }
                });
            }
            if (Object.keys(genresRecord).length === 0) {
                return res.status(500).json({ error: 'No genres detected' });
            }
            const vibe = { genres: genresRecord };
            return res.json({ vibe });
        }
        catch (error) {
            console.error('Vibe Check Error:', error);
            return res.status(500).json({ error: error.message || 'Analysis failed' });
        }
    });
    /**
     * POST /api/gif-search
     * Generate a GIF search term from an image
     */
    app.post('/api/gif-search', async (req, res) => {
        try {
            const { base64Image } = req.body;
            if (!base64Image) {
                return res.status(400).json({ error: 'No image provided' });
            }
            const ai = getAI();
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
            const searchTerm = text?.trim() || "abstract";
            return res.json({ searchTerm });
        }
        catch (error) {
            console.error('GIF Search Term Error:', error);
            return res.json({ searchTerm: "abstract" });
        }
    });
    /**
     * POST /api/title
     * Generate a title for the playlist
     */
    app.post('/api/title', async (req, res) => {
        try {
            const { base64Image, genres } = req.body;
            if (!base64Image) {
                return res.status(400).json({ error: 'No image provided' });
            }
            const ai = getAI();
            const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: {
                    parts: [
                        { inlineData: { mimeType: 'image/png', data: cleanBase64 } },
                        { text: `Analyze this album cover along with its genres ('${(genres || []).join(", ")}').
            Generate a creative, two-word title for this album/playlist. (Roughly 20 characters)
            The title should be evocative and fit the aesthetic.
            Return ONLY the two words.` }
                    ]
                }
            });
            const text = response.text;
            const title = text?.trim() || "Visual Soundscapes";
            return res.json({ title });
        }
        catch (error) {
            console.error('Title Generation Error:', error);
            return res.json({ title: "Visual Soundscapes" });
        }
    });
    console.log('API routes configured: /api/fuse, /api/analyze, /api/gif-search, /api/title');
}
