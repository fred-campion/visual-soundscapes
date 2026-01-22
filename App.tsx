import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Upload, Play, Pause, Sparkles, Disc, X, Volume2, Share2, ArrowRight, Layers, RefreshCw, MoveRight, Music, Plus, Pen, ChevronUp, ChevronDown } from 'lucide-react';
import { fuseImages, analyzeVibe, LyriaManager, generateGifSearchTerm, fetchGifs, generateTitle } from './services/gemini';
import { VibeAnalysis } from './types';
import { v4 as uuidv4 } from 'uuid';

// --- STYLES & ANIMATIONS ---
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;700;800&family=Inter:wght@300;400;500;600&display=swap');

  :root {
    --bg-paper: #ffffff;
    --bg-subtle: #f4f4f5;
    --text-primary: #18181b;
    --text-secondary: #71717a;
    --accent: #6d28d9;
    --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  }

  body {
    background-color: var(--bg-paper);
    color: var(--text-primary);
    font-family: 'Inter', sans-serif;
    overflow-x: hidden;
    margin: 0;
  }

  h1, h2, h3, .display-font { font-family: 'Syne', sans-serif; }

  /* --- UTILITIES --- */
  .no-scrollbar::-webkit-scrollbar { display: none; }
  .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

  /* --- ANIMATIONS --- */
  @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .animate-spin-slow { animation: spin-slow 4s linear infinite; }

  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-5px); }
  }

  @keyframes float-up {
    0% { transform: translateY(0); opacity: 0; }
    10% { opacity: .4; }
    90% { transform: translateY(-120vh); opacity: .5; }
    100% { transform: translateY(-120vh); opacity: 0; }
  }
  .animate-float-up { animation: float-up linear infinite; }

  .glass-panel {
    background: rgba(255, 255, 255, 0.6);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(0, 0, 0, 0.05);
  }

  .magnetic-btn {
    transition: transform 0.2s var(--ease-out-expo), box-shadow 0.3s ease;
  }
  .magnetic-btn:hover { transform: scale(1.02); }
  .magnetic-btn:active { transform: scale(0.98); }

  /* Photo Card Interactions - Raw Image Style */
  .photo-card {
    transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.3s ease;
    will-change: transform;
    box-shadow: 0 10px 30px rgba(0,0,0,0.15);
  }
  .photo-card:hover {
    z-index: 50 !important;
    transform: scale(1.05) rotate(0deg) !important;
    box-shadow: 0 25px 50px rgba(0,0,0,0.25);
  }
  .photo-card.is-dragging {
    opacity: 0.8;
    transform: scale(0.95) !important;
    cursor: grabbing;
    box-shadow: 0 40px 80px rgba(0,0,0,0.3);
  }

  /* Genre Bar Animation */
  @keyframes fill-bar { from { width: 0%; } to { width: var(--w); } }
  .genre-bar { animation: fill-bar 1s ease-out forwards; }

  /* Waveform Animation */
  @keyframes wave {
    0%, 100% { height: 10%; opacity: 0.5; }
    50% { height: 100%; opacity: 1; }
  }
  .wave-bar { animation: wave 1s ease-in-out infinite; }
`;

// --- TYPES ---
interface PhotoData {
  id: string;
  src: string;
  x: string;
  y: string;
  rotation: number;
  scale: number;
  // Status removed - simplified to just presence in array
  base64: string;
  mimeType: string;
}

// --- COMPONENTS ---

// 1a. Initial Upload Section (Full Screen)
const UploadSection = ({ onUpload, onGenerate, onDrop, errorMessage }: { onUpload: () => void, onGenerate: () => void, onDrop: (e: React.DragEvent) => void, errorMessage: string }) => (
    <div 
        className="absolute inset-0 flex flex-col items-center justify-center bg-white z-[60] animate-in fade-in duration-500"
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={onDrop}
    >
        <div className="text-center space-y-8 max-w-full px-6">
            <h1 className="text-6xl md:text-8xl font-bold display-font tracking-tighter text-black mb-2 text-center w-full">
                <a href="https://soundscapes.hellofredd.ie" className="hover:text-neutral-700 transition-colors">
                  <span className="block">Visual<br></br>Soundscapes</span>
                </a>
            </h1>
            <p className="text-neutral-500 text-lg font-light tracking-wide w-full mx-auto">
                Turn images into a personalized, infinite audio stream.
            </p>
            
            <div className="pt-8 flex flex-col items-center gap-4">
                <button 
                    onClick={onUpload}
                    className="magnetic-btn h-16 px-10 bg-black text-white rounded-full flex items-center gap-3 text-lg font-bold shadow-2xl hover:bg-neutral-800 transition-all"
                >
                    <Upload size={20} />
                    <span>Upload up to 6 images</span>
                </button>
                
                {errorMessage && (
                    <div className="text-red-500 text-sm font-medium mt-4 animate-in fade-in slide-in-from-top-2">
                        {errorMessage}
                    </div>
                )}
            </div>
        </div>
    </div>
);

// 1. Single Photo Component (Raw Style)
const Photo: React.FC<{ photo: PhotoData; onDragStart: (e: React.DragEvent, photo: PhotoData) => void; onRemove?: (id: string) => void }> = ({ photo, onDragStart, onRemove }) => (
  <div
    draggable
    onDragStart={(e) => onDragStart(e, photo)}
    className="photo-card absolute w-32 h-40 md:w-40 md:h-52 cursor-grab active:cursor-grabbing bg-neutral-200 group"
    style={{
      top: photo.y,
      left: photo.x,
      transform: `rotate(${photo.rotation}deg) scale(${photo.scale})`,
    }}
  >
    <img 
      src={photo.src} 
      alt="image" 
      className="w-full h-full object-cover pointer-events-none select-none" 
    />
    
    {/* Gradient Overlay */}
    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

    {/* Remove Button (Visible on Hover) */}
    {onRemove && (
        <button 
            onClick={(e) => { e.stopPropagation(); onRemove(photo.id); }}
            className="absolute -top-3 -right-3 w-8 h-8 bg-black text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:scale-110 z-50"
        >
            <X size={14} />
        </button>
    )}
  </div>
);

// 2. Active Mix Lightbox (Unified)
const ActiveMixLightbox = ({ 
    photos, 
    setPhotos, 
    onAddImages,
    onRegenerate,
    onFilesDropped
}: {
    photos: PhotoData[];
    setPhotos: React.Dispatch<React.SetStateAction<PhotoData[]>>;
    onAddImages: () => void;
    onRegenerate: () => void;
    onFilesDropped: (files: FileList) => void;
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    
    const handleDragStart = (e: React.DragEvent, photo: PhotoData) => {
        e.dataTransfer.setData("photoId", photo.id);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move"; // or "copy" depending on context, but "move" for reordering
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // 1. Handle File Uploads (New Images)
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onFilesDropped(e.dataTransfer.files);
            return;
        }

        // 2. Handle Moving Existing Photos
        const photoId = e.dataTransfer.getData("photoId");
        if (photoId && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();

            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;

            // Clamp values to keep inside mostly (0-100%)
            const clampedX = Math.max(0, Math.min(90, x)); // 90% to avoid right overflow
            const clampedY = Math.max(0, Math.min(80, y)); // 80% to avoid bottom overflow

            setPhotos(prev => prev.map(p => {
                if (p.id === photoId) {
                    return { ...p, x: `${clampedX}%`, y: `${clampedY}%` };
                }
                return p;
            }));
        }
    };

    const handleRemove = (id: string) => {
        setPhotos(prev => prev.filter(p => p.id !== id));
    };

    return (
        <div 
            ref={containerRef}
            className="relative w-full flex-1 bg-white border-t border-neutral-100 transition-colors overflow-hidden"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
            
            {/* Header / Controls */}
            <div className="absolute top-0 left-0 w-full p-6 z-40 flex justify-end items-center pointer-events-none">
                <div className="flex gap-3 pointer-events-auto">
                    <button 
                        onClick={onAddImages}
                        className="magnetic-btn h-10 px-5 bg-white border border-neutral-200 text-black rounded-full flex items-center gap-2 shadow-sm hover:shadow-md hover:bg-neutral-50 transition text-xs font-bold uppercase tracking-wide"
                    >
                        <Plus size={14} />
                        <span>Add Images</span>
                    </button>
                    {/* Regenerate button removed */}
                </div>
            </div>

            <div className="absolute top-6 left-6 z-40 pointer-events-none">
                    <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">{photos.length} Image(s) Uploaded</span>
    
            </div>

            {/* Photos Container */}
            <div className="relative w-full h-full">
                {photos.map(p => (
                    <Photo 
                        key={p.id} 
                        photo={p} 
                        onDragStart={handleDragStart} 
                        onRemove={handleRemove}
                    />
                ))}
                
                {photos.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                        <p className="text-sm font-medium tracking-wide text-black uppercase">No active images</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// 2.5 Lightbox Toggle & Resizable Divider
const LightboxToggle = ({ 
    isOpen, 
    onToggle, 
    onResize 
}: { 
    isOpen: boolean; 
    onToggle: () => void; 
    onResize: (newHeight: number) => void;
}) => {
    const handleMouseDown = (e: React.MouseEvent) => {
        // Only allow resize when open
        if (!isOpen) return;
        e.preventDefault();
        
        const handleMouseMove = (moveEvent: MouseEvent) => {
            const newHeight = (moveEvent.clientY / window.innerHeight) * 100;
            // Limit range to prevent overlapping (min 55%, max 80%)
            if (newHeight > 55 && newHeight < 80) {
                onResize(newHeight);
            }
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };
    
    return (
        <div 
            className={`absolute left-6 z-40 relative flex items-center justify-left ${isOpen ? 'cursor-ns-resize' : 'cursor-pointer'}`}
            onMouseDown={handleMouseDown}
        >
            {/* Toggle Chip */}
            <button 
                onClick={onToggle}
                className="absolute px-4 py-1 bg-white border border-neutral-200 rounded-full flex items-center gap-2 shadow-sm hover:shadow-md hover:bg-neutral-50 transition text-xs font-bold uppercase tracking-wide text-neutral-600 z-10"
            >
                {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                <span>Your Images</span>
            </button>
            
            {/* Resize indicator (only when open) */}
            {isOpen && (
                <div className="absolute inset-x-0 -top-2 -bottom-2 cursor-ns-resize z-0 bg-transparent hover:bg-purple-600/10 transition-colors"></div>
            )}
        </div>
    );
};

// 2.7 Floating Background
const FloatingBackground = ({ gifIds }: { gifIds: string[] }) => {
    
    const items = useMemo(() => {
        if (gifIds.length === 0) return [];

        // Increase density by duplicating the list
        const DENSITY_MULTIPLIER = 3; 
        const expandedIds = Array(DENSITY_MULTIPLIER).fill(gifIds).flat();

        // Create evenly distributed slots for horizontal position (5% to 90%)
        const slots = Array.from({ length: expandedIds.length }, (_, i) => 
            (i * (85 / Math.max(expandedIds.length, 1))) + 5
        );
        // Shuffle slots so the sequence isn't linear
        const shuffledSlots = slots.sort(() => Math.random() - 0.5);

        return expandedIds.map((id, i) => {
            // Random size: 60px to 200px (Only smaller than original 200px)
            const size = Math.floor(Math.random() * 141) + 60;
            
            // Parallax effect: Bigger (closer) items move faster (shorter duration)
            // Range: 15s (fastest/closest) to 25s (slowest/farthest)
            const speedFactor = size / 200; // 0.3 to 1.0
            const duration = 30 - (speedFactor * 15); // Result: ~15s to ~25s
            
            return {
                id,
                size,
                left: shuffledSlots[i] + (Math.random() * 8 - 4), // Slot + Jitter
                duration,
                delay: i * (15 / expandedIds.length), // Distribute start times based on total expanded count
                zIndex: Math.floor(size) // Depth sorting
            };
        });
    }, [gifIds]);
    
    return (
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
            {items.map((item, i) => (
                <div 
                    key={`${item.id}-${i}`}
                    className="absolute top-[100%] animate-float-up"
                    style={{
                        left: `${item.left}%`,
                        height: `${item.size}px`,
                        width: 'auto',
                        animationDuration: `${item.duration}s`,
                        animationDelay: `${item.delay}s`,
                        opacity: Math.max(0.5, item.size / 200), // Fade smaller items
                        zIndex: item.zIndex
                    }}
                >
                    <img 
                        src={`https://i.giphy.com/media/${item.id}/giphy.gif`} 
                        className="h-full w-auto" 
                        alt=""
                    />
                </div>
            ))}
        </div>
    );
};


// 3. Player Section
const PlayerSection = ({ 
    isActive, 
    height,
    generatedResult,
    genreWeights,
    isPlaying,
    isBuffering,
    onPlayPause,
    onGenreWeightChange,
    onGenreRename,
    gifIds,
    title
}: {
    isActive: boolean;
    height: number;
    generatedResult: { albumArtUrl: string; vibe: VibeAnalysis } | null;
    genreWeights: Record<string, number>;
    isPlaying: boolean;
    isBuffering: boolean;
    onPlayPause: () => void;
    onGenreWeightChange: (genre: string, val: number) => void;
    onGenreRename: (oldName: string, newName: string) => void;
    gifIds: string[];
    title: string;
}) => {
    
    if (!isActive) return null;

    return (
        <div 
            className="w-full bg-white relative flex flex-col animate-in slide-in-from-bottom-20 duration-1000 fade-in fill-mode-forwards border-t border-neutral-100 overflow-hidden"
            style={{ height: `${height}vh` }}
        >
            {/* Floating Stickers Background */}
            <FloatingBackground gifIds={gifIds} />
            
            {/* Main Content Container */}
            <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-16 md:gap-24 px-8 z-10 relative">
                
                {/* Left: Interactive Record Player */}
                <div className="flex flex-col items-center">
                    <div className="relative group cursor-pointer perspective-container" onClick={onPlayPause}>
                        
                        {/* The Vinyl Record (Spins continuously when playing) */}
                        <div className={`absolute inset-[-10%] rounded-full shadow-2xl transition-all duration-1000 flex items-center justify-center overflow-hidden ${isPlaying ? 'animate-spin-slow' : ''}`}
                             style={{
                                 background: 'conic-gradient(from 0deg, #1a1a1a 0%, #2a2a2a 10%, #1a1a1a 20%, #3a3a3a 30%, #1a1a1a 40%, #000000 50%, #1a1a1a 60%, #2a2a2a 70%, #1a1a1a 80%, #3a3a3a 90%, #1a1a1a 100%)'
                             }}
                        >
                            {/* Record grooves - repeating radial gradient */}
                            <div className="absolute inset-0 rounded-full opacity-40" 
                                 style={{
                                     background: 'repeating-radial-gradient(#000 0, #000 2px, transparent 3px, transparent 4px)'
                                 }}
                            ></div>
                            
                            {/* Shine effect */}
                            <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent rounded-full pointer-events-none"></div>

                            {/* Center label area */}
                            <div className="w-40 h-40 bg-purple-600 rounded-full flex items-center justify-center relative shadow-inner">
                                <div className="absolute inset-0 rounded-full border-4 border-black/20"></div>
                                <div className="w-4 h-4 bg-black rounded-full shadow-sm z-10"></div>
                                <div className="absolute top-2 bottom-2 left-2 right-2 rounded-full border border-white/20"></div>
                                <span className="text-xs font-bold text-black/50 tracking-widest absolute bottom-6">VS-2024</span>
                            </div>
                        </div>
                        
                        {/* The Album Cover (Static or Subtle Float) */}
                        <div className={`relative w-80 h-80 md:w-[500px] md:h-[500px] bg-neutral-100 shadow-xl z-10 overflow-hidden transition-transform duration-500 ${isPlaying ? 'scale-95' : 'scale-100'}`}>
                             {generatedResult?.albumArtUrl && (
                                <img src={generatedResult.albumArtUrl} className="w-full h-full object-cover" />
                             )}
                             {/* Play/Pause Overlay */}
                             <div className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="bg-white/90 p-8 rounded-full shadow-lg backdrop-blur">
                                    {isPlaying ? <Pause className="text-black" size={32} /> : (isBuffering ? <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin" /> : <Play className="text-black ml-1" size={32} />)}
                                </div>
                             </div>
                        </div>
                    </div>
                </div>

                {/* Right: Meta, Controls & Genres */}
                <div className="w-full max-w-2xl space-y-12 bg-white/90 backdrop-blur-md rounded-3xl p-8 md:p-12 shadow-2xl">
                    
                    {/* Header & Title */}
                    <div className="text-center md:text-left">
                        <h2 className="text-6xl md:text-8xl font-bold display-font leading-none mb-1 text-black">
                            {title.split(' ').map((word, i) => (
                                <React.Fragment key={i}>
                                    {word}<br/>
                                </React.Fragment>
                            ))}
                        </h2>
                    </div>

                    {/* Live Waveform Animation */}
                    <div className="space-y-3 relative">
                        <div className="flex items-center gap-2">
                             <div className={`w-3 h-3 rounded-full ${isPlaying ? 'bg-red-500 animate-pulse' : (isBuffering ? 'bg-yellow-500 animate-pulse' : 'bg-neutral-300')}`}></div>
                             <span className={`text-sm font-bold tracking-widest uppercase ${isPlaying ? 'text-red-500' : (isBuffering ? 'text-yellow-500' : 'text-neutral-300')}`}>
                                {isPlaying ? "LIVE" : (isBuffering ? "TUNING IN..." : "OFFLINE")}
                             </span>
                        </div>
                        
                        <div className={`h-16 flex items-center justify-between gap-1 overflow-hidden relative ${isBuffering ? 'opacity-40' : 'opacity-100'} transition-opacity duration-300`}>
                             {isBuffering && (
                                <div className="absolute inset-0 flex items-center justify-center z-10">
                                    <div className="bg-white/80 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-neutral-100">
                                        <span className="text-xs font-bold tracking-[0.2em] text-black uppercase animate-pulse">Connecting to stream...</span>
                                    </div>
                                </div>
                             )}

                             {Array.from({ length: 40 }).map((_, i) => (
                                <div 
                                    key={i} 
                                    className={`w-1.5 rounded-full ${isPlaying ? 'wave-bar bg-neutral-800' : 'bg-neutral-200 h-1.5'}`}
                                    style={{ 
                                        height: isPlaying ? '100%' : '10%',
                                        animationDelay: `${Math.random() * 0.5}s`,
                                        animationDuration: `${0.4 + Math.random() * 0.6}s`
                                    }}
                                ></div>
                             ))}
                        </div>
                    </div>

                    {/* Genre DNA Visualization */}
                    <div className="pt-8 border-t border-neutral-100">
                        <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-6 flex items-center gap-3">
                            <Music size={16} /> Mixing Console
                        </h3>
                        
                        <div className="space-y-6">
                            {Object.entries(genreWeights).map(([genre, weight], i) => (
                                <div key={i} className="group relative">
                                    <div className="flex justify-between text-base mb-2 items-center">
                                        <div className="relative flex-1 mr-4 overflow-hidden">
                                            <input 
                                                defaultValue={genre}
                                                onBlur={(e) => onGenreRename(genre, e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                                className="text-neutral-800 font-bold bg-transparent border-b border-transparent hover:border-neutral-300 focus:border-black outline-none w-full truncate"
                                                title={genre}
                                            />
                                        </div>
                                        <span className="text-neutral-400 font-mono text-sm">{(weight * 100).toFixed(0)}%</span>
                                    </div>
                                    <div className="w-full h-2 bg-neutral-100 rounded-full overflow-visible relative group/slider">
                                        <div 
                                            className={`h-full bg-purple-600 transition-all duration-1000 genre-bar rounded-full`} 
                                            style={{ width: `${weight * 100}%` }}
                                        ></div>
                                        <input 
                                            type="range"
                                            min="0" max="1" step="0.05"
                                            value={weight}
                                            onChange={(e) => onGenreWeightChange(genre, Number(e.target.value))}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        />
                                        {/* Knob Indicator */}
                                        <div 
                                            className="absolute top-1/2 -mt-3 w-6 h-6 bg-white border-2 border-purple-600 rounded-full shadow-md pointer-events-none transition-all duration-100 group-hover/slider:scale-110"
                                            style={{ left: `calc(${weight * 100}% - 12px)` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MAIN APP ---

const App = () => {
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [appState, setAppState] = useState<'upload' | 'input' | 'generating' | 'player'>('upload');
  const [playerHeight, setPlayerHeight] = useState(65); // Default height 65%
  
  // Real Logic State
  const [generatedResult, setGeneratedResult] = useState<{ albumArtUrl: string; vibe: VibeAnalysis } | null>(null);
  const [genreWeights, setGenreWeights] = useState<Record<string, number>>({});
  const [title, setTitle] = useState<string>("Visual Soundscapes");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false); // New State for buffering
  const [gifIds, setGifIds] = useState<string[]>([]);
  const [loadingStatus, setLoadingStatus] = useState<string>("Initializing..."); 
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lyria Session Manager
  const lyriaRef = useRef<LyriaManager | null>(null);

  // Cleanup
  useEffect(() => {
    return () => {
        if (lyriaRef.current) {
            lyriaRef.current.disconnect();
        }
    };
  }, []);

  const handleAddImages = () => {
    fileInputRef.current?.click();
  };

  const processFiles = (files: FileList) => {
    if (!files || files.length === 0) return;

    const newPhotos: PhotoData[] = [];
    const count = files.length;
    let processedCount = 0;

    for (let i = 0; i < count; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = ev.target?.result as string;
            const base64Clean = result.split(',')[1];

            newPhotos.push({
                id: uuidv4(),
                src: result,
                x: (Math.random() * 40 + 5) + '%',
                y: (Math.random() * 60 + 5) + '%',
                rotation: Math.random() * 20 - 10,
                scale: 0.9,
                base64: base64Clean,
                mimeType: file.type
            });

            processedCount++;
            if (processedCount === count) {
                // Simplified Logic: Just add to the array. 
                // If this is the initial upload, trigger synth.
                
                if (appState === 'upload') {
                     setPhotos(newPhotos);
                     handleSynthesize(newPhotos);
                } else {
                     // Just add to existing
                     setPhotos(prev => [...prev, ...newPhotos]);
                }
            }
        };
        reader.readAsDataURL(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
        processFiles(e.target.files);
    }
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
        processFiles(e.dataTransfer.files);
    }
  };

  const handleSynthesize = async (photosOverride?: PhotoData[]) => {
    // Simplified: Use override or current state. All photos are active.
    const photosToUse = photosOverride || photos;
    
    if (photosToUse.length === 0) return;

    setAppState('generating');
    setLoadingStatus("Combining visuals..."); 
    setErrorMessage("");
    
    // Disconnect existing
    if (lyriaRef.current) {
        lyriaRef.current.disconnect();
        lyriaRef.current = null;
    }
    setIsPlaying(false);
    setIsBuffering(false);

    try {
        // 1. Fuse
        const uploadImages = photosToUse.map(p => ({
            id: p.id,
            url: p.src,
            base64: p.base64,
            mimeType: p.mimeType
        }));
        
        const fusedUrl = await fuseImages(uploadImages);
        
        setLoadingStatus("Analyzing visuals..."); 

        // 2. Analyze
        const vibe = await analyzeVibe(fusedUrl);
        
        setLoadingStatus("Synthesizing..."); 

        // 2.5 Generate GIF Theme (Parallel to Vibe but waited)
        const gifSearchTerm = await generateGifSearchTerm(fusedUrl);
        const newGifIds = await fetchGifs(gifSearchTerm);
        if (newGifIds.length > 0) {
            setGifIds(newGifIds);
        }

        // 2.6 Generate Title
        const newTitle = await generateTitle(fusedUrl, Object.keys(vibe.genres));
        setTitle(newTitle);

        setGeneratedResult({ albumArtUrl: fusedUrl, vibe });
        setGenreWeights(vibe.genres);

        setLoadingStatus("Initializing audio engine..."); 

        // 3. Connect Lyria
        const manager = new LyriaManager();
        lyriaRef.current = manager;
        
        // Start buffering state
        setIsBuffering(true);

        // Pass callback to set isPlaying ONLY when audio chunks actually start arriving
        await manager.connect(vibe, () => {
            console.log("Audio started flowing - Starting visuals");
            setIsPlaying(true);
            setIsBuffering(false);
        });
        
        // We switch to player view immediately, but animations wait for the callback above
        setAppState('player');

    } catch (e: any) {
        console.error(e);
        setErrorMessage(e.message || "Unexpected error. Please try again.");
        // If error, return to appropriate state
        setAppState(appState === 'upload' ? 'upload' : 'player'); // Fallback to player if we were regenerating
        
        // If we fell back to upload because of an error, clear the photos so they can try again or see the error clearly
        if (appState === 'upload') {
            setPhotos([]);
        }
        setIsBuffering(false);
    }
  };

  const handleRegenerate = () => {
    // Re-run synthesis with currently active photos
    handleSynthesize();
  };

  const togglePlayPause = () => {
      if (!lyriaRef.current && !generatedResult) return;
      
      // If we are currently playing OR in the middle of buffering (connecting),
      // we treat this click as a "Stop".
      if (isPlaying || isBuffering) {
          lyriaRef.current?.disconnect(); // Lyria doesn't really pause, so we disconnect
          setIsPlaying(false);
          setIsBuffering(false);
      } else {
          // Re-connect with current state
          if (generatedResult) {
               // We need to re-initialize if we disconnected
               setIsBuffering(true);
               const manager = new LyriaManager();
               lyriaRef.current = manager;
               manager.connect({ genres: genreWeights }, () => {
                   // Ensure we don't start playing if user cancelled in the meantime
                   if (lyriaRef.current === manager) {
                       setIsPlaying(true);
                       setIsBuffering(false);
                   }
               });
          }
      }
  };

  const handleMixChange = (genre: string, newValue: number) => {
    const newWeights = { ...genreWeights, [genre]: newValue };
    setGenreWeights(newWeights);
    lyriaRef.current?.updateMix(newWeights);
  };

  const handleGenreRename = (oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) return;
    const newWeights: Record<string, number> = {};
    Object.entries(genreWeights).forEach(([k, v]) => {
        if (k === oldName) newWeights[newName] = v as number;
        else newWeights[k] = v as number;
    });
    setGenreWeights(newWeights);
    lyriaRef.current?.updateMix(newWeights);
  };

  // Helper for dynamic loading text
  const getEstimatedWait = () => {
    switch (loadingStatus) {
      case "Combining visuals...":
        return "Estimate: 90 secs";
      case "Analyzing visuals...":
        return "Estimate: 60 secs";
      case "Synthesizing...":
        return "Estimate: 30 secs";
      case "Initializing audio...":
        return "Almost ready...";
      default:
        return "Estimate: 90 secs";
    }
  };

  return (
    <>
      <style>{styles}</style>
      
      {/* Hidden File Input */}
      <input 
        type="file" 
        multiple 
        accept="image/*" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden"
      />

      {/* Container */}
      <div className="fixed inset-0 flex flex-col bg-white pb-12">
        
        {/* Navigation / Header - Minimal */}
        <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start z-50 pointer-events-none">
            <a 
                href="https://soundscapes.hellofredd.ie"
                className="text-black font-bold tracking-widest text-sm display-font pointer-events-auto hover:opacity-70 transition-opacity"
            >
                VISUAL SOUNDSCAPES
            </a>
            {/* Removed top error message since we moved it to the center */}
        </div>

        {/* 1. Initial Upload Section */}
        {appState === 'upload' && (
            <UploadSection 
                onUpload={handleAddImages} 
                onGenerate={() => handleSynthesize()}
                onDrop={handleDrop}
                errorMessage={errorMessage}
            />
        )}

        {/* 2. Player Section (Now Above Lightbox) */}
        <PlayerSection 
            isActive={appState === 'player'} 
            height={isLightboxOpen ? playerHeight : 94}
            generatedResult={generatedResult}
            genreWeights={genreWeights}
            isPlaying={isPlaying}
            isBuffering={isBuffering}
            onPlayPause={togglePlayPause}
            onGenreWeightChange={handleMixChange}
            onGenreRename={handleGenreRename}
            gifIds={gifIds}
            title={title}
        />

        {/* 2.5 Lightbox Toggle */}
        {appState === 'player' && (
            <LightboxToggle 
                isOpen={isLightboxOpen} 
                onToggle={() => setIsLightboxOpen(!isLightboxOpen)} 
                onResize={setPlayerHeight} 
            />
        )}

        {/* 3. Active Mix Lightbox (Only visible when toggled open) */}
        {appState === 'player' && isLightboxOpen && (
            <ActiveMixLightbox 
                photos={photos} 
                setPhotos={setPhotos} 
                onAddImages={handleAddImages}
                onRegenerate={handleRegenerate}
                onFilesDropped={processFiles}
            />
        )}

        {/* 4. Loading Interstitial (Overlay) */}
        {appState === 'generating' && (
            <div className="absolute inset-0 z-[60] bg-white flex flex-col items-center justify-center animate-in fade-in duration-300 overflow-hidden">
                {/* Floating Images Background */}
                <div className="absolute inset-0 z-0">
                    {photos.map((photo, i) => (
                        <div 
                            key={photo.id}
                            className="absolute w-40 h-52 bg-neutral-100 shadow-2xl opacity-60 animate-in zoom-in duration-700 fill-mode-forwards"
                            style={{
                                top: photo.y,
                                left: photo.x,
                                transform: `rotate(${photo.rotation}deg) scale(0.8)`,
                                animationDelay: `${i * 0.1}s`
                            }}
                        >
                            <img src={photo.src} className="w-full h-full object-cover" />
                        </div>
                    ))}
                </div>

                {/* Central Loader */}
                <div className="relative z-10 flex flex-col items-center justify-center bg-white/80 backdrop-blur-xl p-12 rounded-full shadow-[0_0_100px_rgba(255,255,255,1)] text-center">
                    <div className="w-16 h-16 border-4 border-neutral-100 border-t-black rounded-full animate-spin"></div>
                    <p className="mt-6 text-xs font-bold tracking-[0.3em] animate-pulse text-black uppercase">{loadingStatus}</p>
                    <p className="mt-3 text-[10px] text-neutral-500 font-medium tracking-wide uppercase">{getEstimatedWait()}</p>
                </div>
            </div>
        )}
        
        {/* Footer */}
        <div className="fixed bottom-0 left-0 w-full h-12 flex items-center justify-center bg-white z-[70]">
            <a 
                href="http://hellofredd.ie" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-black text-sm display-font"
            >
                HELLOFREDD.IE
            </a>
        </div>
        
      </div>
    </>
  );
};

export default App;