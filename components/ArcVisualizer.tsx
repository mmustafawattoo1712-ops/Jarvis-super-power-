import React, { useEffect, useRef } from 'react';

interface ArcVisualizerProps {
  isActive: boolean;
  theme: 'BLUE' | 'RED';
  audioData: Uint8Array | null;
}

export const ArcVisualizer: React.FC<ArcVisualizerProps> = ({ isActive, theme, audioData }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const colorPrimary = theme === 'BLUE' ? '#00ccff' : '#ff3333';
  const colorSecondary = theme === 'BLUE' ? '#006688' : '#881111';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let rotation = 0;

    const draw = () => {
      if (!ctx) return;
      const { width, height } = canvas;
      const centerX = width / 2;
      const centerY = height / 2;
      
      ctx.clearRect(0, 0, width, height);
      
      // Base Rotation
      rotation += 0.01;

      // Glow effect
      ctx.shadowBlur = 15;
      ctx.shadowColor = colorPrimary;

      // 1. Outer Ring (Static-ish)
      ctx.beginPath();
      ctx.arc(centerX, centerY, 120, 0, Math.PI * 2);
      ctx.strokeStyle = colorSecondary;
      ctx.lineWidth = 2;
      ctx.stroke();

      // 2. Rotating Segments
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(rotation);
      
      for(let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, 100, i * (Math.PI * 2 / 3), i * (Math.PI * 2 / 3) + 1.5);
        ctx.strokeStyle = colorPrimary;
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      ctx.restore();

      // 3. Inner Core (Audio Reactive)
      const radius = 60;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? colorPrimary : '#111';
      ctx.globalAlpha = 0.2;
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Audio Waveform inside the core
      if (audioData && isActive) {
        ctx.beginPath();
        const sliceWidth = (Math.PI * 2) / audioData.length;
        let angle = 0;
        
        for(let i = 0; i < audioData.length; i++) {
          const v = audioData[i] / 128.0; // normalize
          const r = radius - 10 + (v * 20); // fluctuate radius
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;
          
          if(i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          
          angle += sliceWidth;
        }
        ctx.closePath();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Center Dot
      ctx.beginPath();
      ctx.arc(centerX, centerY, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => cancelAnimationFrame(animationId);
  }, [isActive, theme, audioData]);

  return (
    <div className="relative flex items-center justify-center p-10">
      <div className={`absolute inset-0 rounded-full opacity-20 blur-3xl ${theme === 'BLUE' ? 'bg-cyan-500' : 'bg-red-600'}`}></div>
      <canvas ref={canvasRef} width={300} height={300} className="relative z-10" />
    </div>
  );
};
