
import React, { useCallback, useState } from 'react';
import { UploadedImage } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface DropzoneProps {
  onImagesChange: (images: UploadedImage[]) => void;
  currentImages: UploadedImage[];
  maxImages: number;
  disabled: boolean;
}

const Dropzone: React.FC<DropzoneProps> = ({ onImagesChange, currentImages, maxImages, disabled }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const processFiles = (files: FileList | null) => {
    if (!files) return;
    if (currentImages.length >= maxImages) return;

    const newImages: UploadedImage[] = [];
    const remainingSlots = maxImages - currentImages.length;
    const count = Math.min(files.length, remainingSlots);

    let processedCount = 0;

    for (let i = 0; i < count; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        // Remove data URL prefix for base64 storage if needed, but keeping full url for preview
        // We need pure base64 for Gemini later
        const base64Clean = result.split(',')[1];

        newImages.push({
          id: uuidv4(), // Using a simple random string if uuid import fails, but here I'll just use random
          url: result,
          base64: base64Clean,
          mimeType: file.type
        });

        processedCount++;
        if (processedCount === count) {
           onImagesChange([...currentImages, ...newImages]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    processFiles(e.dataTransfer.files);
  }, [currentImages, maxImages, disabled, onImagesChange]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    processFiles(e.target.files);
  };

  return (
    <div className="w-full mb-8">
      <div 
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`
          relative h-[500px] rounded-xl border-2 border-dashed transition-all duration-500
          flex flex-col items-center justify-center overflow-hidden
          ${isDragOver ? 'border-[#ccff00] bg-[#ccff00]/10 scale-[1.02]' : 'border-neutral-800 bg-neutral-900/50'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-neutral-600'}
        `}
      >
        <input 
            type="file" 
            multiple 
            accept="image/*"
            onChange={handleFileInput}
            disabled={disabled}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />

        {currentImages.length === 0 ? (
          <div className="text-center p-6 pointer-events-none">
             <div className="w-20 h-20 mx-auto mb-6 rounded-full border border-[#ccff00] flex items-center justify-center shadow-[0_0_25px_rgba(204,255,0,0.2)]">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-[#ccff00]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
             </div>
             <h3 className="text-2xl font-medium text-white mb-2">Drop Visuals Here</h3>
             <p className="text-neutral-500 text-base font-mono">Upload 1-{maxImages} images</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 p-4 w-full h-full pointer-events-none">
            {currentImages.map((img, idx) => (
                <div key={idx} className="relative group w-full h-full rounded-lg overflow-hidden border border-white/10 shadow-lg">
                    <img src={img.url} alt="Upload" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-[#ccff00]/20 mix-blend-overlay" />
                </div>
            ))}
            {Array.from({ length: maxImages - currentImages.length }).map((_, idx) => (
                <div key={`empty-${idx}`} className="border border-white/5 rounded-lg bg-black/20 flex items-center justify-center">
                    <span className="text-neutral-700 text-xs font-mono">SLOT {currentImages.length + idx + 1}</span>
                </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dropzone;
