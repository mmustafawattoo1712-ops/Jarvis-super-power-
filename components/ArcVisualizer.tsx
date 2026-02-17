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
    let rot1 = 0;
    let rot2 = 0;
    let rot3 = 0;

    const draw = () => {
      if (!ctx) return;
      const { width, height } = canvas;
      const centerX = width / 2;
      const centerY = height / 2;
      
      ctx.clearRect(0, 0, width, height);
      
      // Update Rotations
      rot1 += 0.01;
      rot2 -= 0.02;
      rot3 += 0.005;

      // Glow effect
      ctx.shadowBlur = 15;
      ctx.shadowColor = colorPrimary;

      // 1. Core Circle (Pulsing)
      const baseRadius = 50;
      let pulse = 0;
      if (audioData && isActive) {
        // Calculate average amplitude for pulse
        let sum = 0;
        for(let i=0; i<audioData.length; i++) sum += audioData[i];
        const avg = sum / audioData.length;
        pulse = avg / 5; // Scaling factor
      }
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius + pulse, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? colorPrimary : '#111';
      ctx.globalAlpha = 0.8;
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // 2. Inner Rotating Ring (Segmented)
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(rot1);
      ctx.strokeStyle = colorPrimary;
      ctx.lineWidth = 4;
      for(let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, 70, i * (Math.PI * 2 / 3), i * (Math.PI * 2 / 3) + 1);
        ctx.stroke();
      }
      ctx.restore();

      // 3. Middle Rotating Ring (Opposite direction, thinner)
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(rot2);
      ctx.strokeStyle = colorSecondary;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.arc(0, 0, 90, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // 4. Outer Ring (Static-ish with tick marks)
      ctx.strokeStyle = colorSecondary;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 120, 0, Math.PI * 2);
      ctx.stroke();

      // Audio Waveform Overlay
      if (audioData && isActive) {
        ctx.beginPath();
        const outerRadius = 140;
        const sliceWidth = (Math.PI * 2) / audioData.length;
        let angle = 0;
        
        for(let i = 0; i < audioData.length; i++) {
          const v = audioData[i] / 128.0; 
          const r = outerRadius + (v * 20);
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;
          
          if(i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          
          angle += sliceWidth;
        }
        ctx.strokeStyle = colorPrimary;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => cancelAnimationFrame(animationId);
  }, [isActive, theme, audioData]);

  return (
    <div className="relative flex items-center justify-center p-10">
      <div className={`absolute inset-0 rounded-full opacity-10 blur-3xl ${theme === 'BLUE' ? 'bg-cyan-500' : 'bg-red-600'}`}></div>
      <canvas ref={canvasRef} width={400} height={400} className="relative z-10" />
    </div>
  );
};