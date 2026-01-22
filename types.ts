export enum AppState {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  PLAYBACK = 'PLAYBACK',
  ERROR = 'ERROR'
}

export interface UploadedImage {
  id: string;
  url: string;
  base64: string; // Pure base64 string without prefix
  mimeType: string;
}

export interface VibeAnalysis {
  genres: Record<string, number>;
}

export interface GenerationResult {
  albumArtUrl: string; // Base64 data URL
  vibe: VibeAnalysis;
  audioUrl?: string; // Base64 data URL (if we use TTS/Audio gen)
}