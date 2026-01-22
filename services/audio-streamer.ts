
export class AudioStreamer {
  private audioContext: AudioContext | null = null;
  private nextStartTime: number = 0;
  private isPlaying: boolean = false;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;

  constructor() {
    // Context creation deferred to initialize() to better manage browser resources
  }

  public initialize() {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    
    // Create new context if one doesn't exist
    if (!this.audioContext && AudioContextClass) {
      this.audioContext = new AudioContextClass({ sampleRate: 44100 });
    }

    if (!this.audioContext) return;

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 0.8;
    
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    
    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
    
    this.nextStartTime = this.audioContext.currentTime + 0.1; // Small buffer
    this.isPlaying = true;
  }

  public stop() {
    this.isPlaying = false;
    if (this.audioContext) {
      // We attempt to close the context to free up hardware resources
      this.audioContext.close().catch(e => console.warn("Error closing audio context:", e)).finally(() => {
          this.audioContext = null;
      });
    }
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  /**
   * Decodes and schedules a chunk of raw 16-bit PCM audio (Stereo, 44.1kHz)
   */
  public playChunk(base64Data: string) {
    if (!this.audioContext || !this.isPlaying || !this.gainNode) return;

    try {
      const binary = atob(base64Data);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      // Lyria returns Int16 raw PCM
      const int16Data = new Int16Array(bytes.buffer);
      
      // Stereo (2 channels)
      const channelCount = 2;
      const frameCount = int16Data.length / channelCount;
      
      const audioBuffer = this.audioContext.createBuffer(
        channelCount, 
        frameCount, 
        44100 // Match constructor sample rate
      );

      // De-interleave (L, R, L, R...) -> Planar
      for (let channel = 0; channel < channelCount; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
          // Convert Int16 (-32768 to 32767) to Float32 (-1.0 to 1.0)
          channelData[i] = int16Data[i * channelCount + channel] / 32768.0;
        }
      }

      // Schedule playback
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode);

      // Ensure seamless playback by scheduling next chunk at the exact end of the last
      const now = this.audioContext.currentTime;
      // If we fell behind (latency), jump to now
      if (this.nextStartTime < now) {
        this.nextStartTime = now;
      }

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;

    } catch (e) {
      console.error("Error decoding audio chunk", e);
    }
  }
}