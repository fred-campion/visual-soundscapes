
import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  analyser?: AnalyserNode | null;
  isPlaying: boolean;
  primaryColor: string;
}

const Visualizer: React.FC<VisualizerProps> = ({ analyser, isPlaying, primaryColor }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Buffer setup for real-time data
    let dataArray: Uint8Array = new Uint8Array(0);
    let bufferLength = 0;

    if (analyser) {
        bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
    }

    const render = () => {
      // Resize
      canvas.width = canvas.parentElement?.clientWidth || 300;
      canvas.height = canvas.parentElement?.clientHeight || 150;

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      if (!isPlaying || !analyser) {
        // Idle line
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        return;
      }

      // Get real audio data
      analyser.getByteTimeDomainData(dataArray as Uint8Array<ArrayBuffer>);

      // Active Waveform
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = primaryColor;
      
      // Create a glow effect
      ctx.shadowBlur = 10;
      ctx.shadowColor = primaryColor;

      const sliceWidth = width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0; // Normalize 0-255 to 0.0-2.0
        const y = v * height / 2;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);

        x += sliceWidth;
      }
      
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
      ctx.shadowBlur = 0; // Reset

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [analyser, isPlaying, primaryColor]);

  return (
    <canvas ref={canvasRef} className="w-full h-full block" />
  );
};

export default Visualizer;
