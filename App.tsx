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
    network: 'SECURE (Local)',
    securityLevel: 'HIGH',
    theme: 'BLUE'
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [audioData, setAudioData] = useState<Uint8Array | null>(null);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  
  // Use a ref to keep the service instance persistent across renders
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
    ].slice(-50)); // Keep last 50 logs
  }, []);

  useEffect(() => {
    // Initialize Service on Mount
    const service = new JarvisService();
    jarvisRef.current = service;

    // Bind callbacks
    service.onStateChange = (state) => setConnectionState(state);
    service.onLog = (msg, src) => addLog(msg, src);
    service.onSystemUpdate = (update) => setSystemStatus(prev => ({ ...prev, ...update }));
    service.onAudioData = (data) => setAudioData(data);
    service.onUserSpeaking = (speaking) => setIsUserSpeaking(speaking);

    // Initial log
    addLog("System initialized. Waiting for user authorization.", "SYSTEM");

    return () => {
      service.disconnect();
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
  
  // Dynamic theme based on voice activity or system setting
  const activeTheme = isUserSpeaking ? 'RED' : systemStatus.theme;

  const themeColor = activeTheme === 'BLUE' ? 'text-cyan-400' : 'text-red-500';
  const buttonBorder = activeTheme === 'BLUE' ? 'border-cyan-500 hover:bg-cyan-500/20' : 'border-red-600 hover:bg-red-600/20';
  
  // Background grid colors
  const gridColor = activeTheme === 'BLUE' ? '#003344' : '#441111';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-black selection:bg-cyan-900 selection:text-white">
      
      {/* Background Grid */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: `linear-gradient(${gridColor} 1px, transparent 1px), linear-gradient(90deg, ${gridColor} 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }}
      />
      
      <div className="z-10 w-full max-w-5xl flex flex-col items-center gap-8 p-4">
        
        {/* Header */}
        <header className="w-full flex justify-between items-end border-b border-gray-800 pb-4 mb-4">
          <div>
            <h1 className={`text-4xl md:text-6xl font-tech font-bold tracking-tighter ${themeColor} transition-colors duration-300`}>
              J.A.R.V.I.S.
            </h1>
            <p className="text-gray-500 text-xs tracking-[0.3em] mt-1">JUST A RATHER VERY INTELLIGENT SYSTEM</p>
          </div>
          <div className="text-right">
             <div className="text-xs text-gray-400 mb-1">STATUS</div>
             <div className={`text-xl font-mono font-bold ${isConnected ? 'text-green-400' : 'text-gray-600'}`}>
               {connectionState}
             </div>
          </div>
        </header>

        {/* Visualizer Core */}
        <div className="relative group cursor-pointer" onClick={handleToggleConnection}>
          <ArcVisualizer 
            isActive={isConnected} 
            theme={activeTheme} 
            audioData={audioData}
          />
          
          {/* Central Button Overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
             {!isConnected && !isConnecting && (
               <span className={`animate-pulse font-mono text-xs ${themeColor}`}>INITIATE</span>
             )}
             {isConnecting && (
                <span className={`animate-spin w-8 h-8 border-2 border-t-transparent rounded-full ${activeTheme === 'BLUE' ? 'border-cyan-400' : 'border-red-500'}`}></span>
             )}
          </div>
        </div>

        {/* Control Button */}
        <button
          onClick={handleToggleConnection}
          disabled={isConnecting}
          className={`
            relative px-8 py-3 bg-transparent border-2 ${buttonBorder} 
            ${themeColor} font-bold tracking-widest uppercase transition-all duration-300
            hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
            group overflow-hidden
          `}
        >
          <span className="relative z-10">
            {isConnected ? 'Terminate Session' : 'Establish Uplink'}
          </span>
          {/* Hover Fill Effect */}
          <div className={`absolute inset-0 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300 ease-out ${activeTheme === 'BLUE' ? 'bg-cyan-900/40' : 'bg-red-900/40'}`}></div>
        </button>

        {/* Info Panels */}
        <InfoPanel logs={logs} status={systemStatus} theme={activeTheme} />

        {/* Footer */}
        <div className="text-gray-600 text-xs font-mono mt-8 opacity-50 text-center max-w-lg">
          WARNING: SYSTEM RUNNING IN RESTRICTED WEB ENVIRONMENT. ACCESS TO MOBILE HARDWARE IS SIMULATED. 
          <br/>
          GEMINI 2.5 LIVE API // NATIVE AUDIO // REALTIME WEBSOCKET
        </div>

      </div>
    </div>
  );
};

export default App;