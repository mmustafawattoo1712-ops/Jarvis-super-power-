import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ConnectionState, SystemStatus, LogEntry } from './types';
import { JarvisService } from './services/jarvisService';
import { ArcVisualizer } from './components/ArcVisualizer';
import { InfoPanel } from './components/InfoPanel';

const App: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    memory: 45,
    cpu: 12,
    network: 'SECURE',
    securityLevel: 'HIGH',
    theme: 'BLUE'
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [audioData, setAudioData] = useState<Uint8Array | null>(null);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const jarvisRef = useRef<JarvisService | null>(null);

  const addLog = useCallback((message: string, source: 'SYSTEM' | 'USER' | 'J.A.R.V.I.S.') => {
    setLogs(prev => [
      ...prev, 
      { 
        id: Math.random().toString(36).substring(7), 
        timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' }), 
        source, 
        message 
      }
    ].slice(-50));
  }, []);

  useEffect(() => {
    const service = new JarvisService();
    jarvisRef.current = service;

    service.onStateChange = (state) => setConnectionState(state);
    service.onLog = (msg, src) => addLog(msg, src);
    service.onSystemUpdate = (update) => setSystemStatus(prev => ({ ...prev, ...update }));
    service.onAudioData = (data) => setAudioData(data);
    service.onUserSpeaking = (speaking) => setIsUserSpeaking(speaking);

    addLog("J.A.R.V.I.S. Protocol Online. Waiting for command.", "SYSTEM");

    service.initWakeWordDetection();
    service.startWakeWordDetection();

    // Clock Timer
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);

    return () => {
      service.disconnect();
      clearInterval(timer);
    };
  }, [addLog]);

  const handleToggleConnection = async () => {
    if (!jarvisRef.current) return;
    if (connectionState === ConnectionState.CONNECTED || connectionState === ConnectionState.CONNECTING) {
      await jarvisRef.current.disconnect();
    } else {
      await jarvisRef.current.connect();
    }
  };

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING;
  
  const activeTheme = isUserSpeaking ? 'RED' : systemStatus.theme;
  const themeColor = activeTheme === 'BLUE' ? 'text-cyan-400' : 'text-red-500';
  const gridColor = activeTheme === 'BLUE' ? 'rgba(6, 182, 212, 0.1)' : 'rgba(239, 68, 68, 0.1)';

  return (
    <div className={`min-h-screen bg-black ${themeColor} font-rajdhani overflow-hidden relative selection:bg-cyan-500/30 flex flex-col`}>
      
      {/* Background Grid */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(${gridColor} 1px, transparent 1px), 
            linear-gradient(90deg, ${gridColor} 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          maskImage: 'radial-gradient(circle at center, black 40%, transparent 100%)' // Inverted mask for corners
        }}
      />
      
      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,black_100%)] z-0"></div>

      {/* Main UI Layer */}
      <main className="relative z-10 flex-1 flex flex-col p-4 md:p-8 justify-between">
        
        {/* Top Header */}
        <header className="flex justify-between items-start border-b border-white/10 pb-4">
          <div className="flex flex-col">
            <h1 className="text-4xl md:text-6xl font-orbitron font-bold tracking-widest leading-none">
              J.A.R.V.I.S.
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] tracking-[0.5em] opacity-70 border px-1 border-current">MARK II</span>
              <span className="text-[10px] opacity-50">AIzaSy... API LINKED</span>
            </div>
          </div>
          
          <div className="text-right font-mono flex flex-col items-end">
             <div className="text-3xl font-bold">{currentTime.toLocaleTimeString([], {hour12: false})}</div>
             <div className="text-xs opacity-60 tracking-widest">{currentTime.toLocaleDateString()}</div>
             <div className={`mt-2 text-sm font-bold flex items-center gap-2 ${isConnected ? 'animate-pulse' : ''}`}>
               {isConnected && <div className="w-2 h-2 rounded-full bg-current"></div>}
               {connectionState}
             </div>
          </div>
        </header>

        {/* Center Visualizer Area */}
        <div className="flex-1 flex flex-col items-center justify-center relative min-h-[400px]">
           {/* Decorative Brackets */}
           <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-64 border-l border-r border-white/20 opacity-30 w-full max-w-3xl pointer-events-none"></div>

           <div className="relative group cursor-pointer transition-transform duration-500 hover:scale-105" onClick={handleToggleConnection}>
              <ArcVisualizer 
                isActive={isConnected} 
                theme={activeTheme} 
                audioData={audioData}
              />
              
              {/* Start Overlay */}
              {!isConnected && !isConnecting && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="backdrop-blur-sm bg-black/50 border border-current px-6 py-2 rounded text-sm tracking-widest hover:bg-white/10 transition-colors">
                    INITIALIZE SYSTEM
                  </div>
                </div>
              )}
           </div>

           <div className="absolute bottom-10 font-mono text-xs tracking-[0.3em] opacity-50">
              {isUserSpeaking ? ">>> ANALYZING AUDIO INPUT <<<" : ">>> STANDBY MODE <<<"}
           </div>
        </div>

        {/* Bottom Panel */}
        <InfoPanel logs={logs} status={systemStatus} theme={activeTheme} />

      </main>
    </div>
  );
};

export default App;