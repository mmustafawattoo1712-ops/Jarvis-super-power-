import React from 'react';
import { LogEntry, SystemStatus } from '../types';

interface InfoPanelProps {
  logs: LogEntry[];
  status: SystemStatus;
  theme: 'BLUE' | 'RED';
}

export const InfoPanel: React.FC<InfoPanelProps> = ({ logs, status, theme }) => {
  const borderColor = theme === 'BLUE' ? 'border-cyan-500' : 'border-red-600';
  const textColor = theme === 'BLUE' ? 'text-cyan-400' : 'text-red-400';
  const bgColor = theme === 'BLUE' ? 'bg-cyan-900/10' : 'bg-red-900/10';

  return (
    <div className="w-full h-48 grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
      
      {/* LEFT: System Diagnostics */}
      <div className={`border-t border-l ${borderColor} ${bgColor} p-4 rounded-tl-xl relative overflow-hidden flex flex-col justify-between backdrop-blur-sm`}>
        <div className="absolute top-0 right-0 p-1 opacity-50 text-[10px]">SYS_DIAGNOSTICS</div>
        
        <div className="space-y-3 mt-2">
          <div>
            <div className="flex justify-between mb-1 opacity-80">
              <span>MEM_INTEGRITY</span>
              <span>{status.memory}%</span>
            </div>
            <div className="w-full bg-gray-900/50 h-1">
              <div className={`h-full ${theme === 'BLUE' ? 'bg-cyan-500' : 'bg-red-500'}`} style={{ width: `${status.memory}%` }}></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-1 opacity-80">
              <span>CPU_LOAD</span>
              <span>{status.cpu}%</span>
            </div>
            <div className="w-full bg-gray-900/50 h-1">
              <div className={`h-full ${theme === 'BLUE' ? 'bg-cyan-500' : 'bg-red-500'}`} style={{ width: `${status.cpu}%` }}></div>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-end mt-2">
           <div className="flex flex-col">
              <span className="opacity-50">NET_STATUS</span>
              <span className="font-bold">{status.network}</span>
           </div>
           <div className={`px-2 py-0.5 border ${borderColor} text-[10px]`}>
              SEC_LEVEL: {status.securityLevel}
           </div>
        </div>
      </div>

      {/* CENTER: Log Output */}
      <div className={`md:col-span-2 border-t border-r ${borderColor} ${bgColor} p-4 rounded-tr-xl relative flex flex-col backdrop-blur-sm`}>
        <div className="absolute top-0 right-0 p-1 opacity-50 text-[10px]">COMM_LOG_UPLINK</div>
        <div className="flex-1 overflow-y-auto space-y-1 font-mono pr-2 custom-scrollbar">
          {logs.slice().reverse().map((log) => (
            <div key={log.id} className="flex gap-2 text-[11px] hover:bg-white/5">
              <span className="opacity-40">[{log.timestamp}]</span>
              <span className={`font-bold ${log.source === 'J.A.R.V.I.S.' ? 'text-white' : textColor} w-16 text-right`}>
                {log.source}:
              </span>
              <span className="text-gray-300 flex-1">{log.message}</span>
            </div>
          ))}
          {logs.length === 0 && <div className="opacity-30 mt-4 text-center"> > NO ACTIVE TRANSMISSIONS</div>}
        </div>
      </div>

    </div>
  );
};