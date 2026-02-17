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
  const bgColor = theme === 'BLUE' ? 'bg-cyan-900/20' : 'bg-red-900/20';

  return (
    <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-4 p-4 font-mono text-xs md:text-sm">
      
      {/* LEFT: System Diagnostics */}
      <div className={`border ${borderColor} ${bgColor} p-4 rounded-lg relative overflow-hidden h-64`}>
        <div className="absolute top-0 left-0 bg-current px-2 py-1 text-black font-bold uppercase">Sys_Diag</div>
        <div className="mt-8 space-y-4">
          
          <div>
            <div className="flex justify-between mb-1">
              <span>MEMORY_INTEGRITY</span>
              <span>{status.memory}%</span>
            </div>
            <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
              <div 
                className={`h-full ${theme === 'BLUE' ? 'bg-cyan-500' : 'bg-red-500'}`} 
                style={{ width: `${status.memory}%` }}
              ></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <span>CPU_LOAD</span>
              <span>{status.cpu}%</span>
            </div>
            <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
              <div 
                className={`h-full ${theme === 'BLUE' ? 'bg-cyan-500' : 'bg-red-500'}`} 
                style={{ width: `${status.cpu}%` }}
              ></div>
            </div>
          </div>

          <div className="flex justify-between border-b border-gray-700 pb-2">
            <span>NETWORK</span>
            <span className="text-white">{status.network}</span>
          </div>
          
          <div className="flex justify-between">
             <span>SECURITY</span>
             <span className={status.securityLevel === 'HIGH' ? 'text-green-400' : 'text-yellow-400'}>
               {status.securityLevel}
             </span>
          </div>
        </div>
      </div>

      {/* CENTER: Log Output */}
      <div className={`md:col-span-2 border ${borderColor} ${bgColor} p-4 rounded-lg relative h-64 flex flex-col`}>
        <div className="absolute top-0 right-0 bg-current px-2 py-1 text-black font-bold uppercase">Comm_Log</div>
        <div className="mt-6 flex-1 overflow-y-auto space-y-2 pr-2 font-mono" id="log-container">
          {logs.length === 0 && <span className="opacity-50">Waiting for input...</span>}
          {logs.map((log) => (
            <div key={log.id} className="flex gap-2">
              <span className="opacity-50">[{log.timestamp}]</span>
              <span className={`font-bold ${log.source === 'J.A.R.V.I.S.' ? 'text-white' : textColor}`}>
                {log.source}:
              </span>
              <span className="text-gray-300">{log.message}</span>
            </div>
          ))}
          {/* Scroll anchor */}
          <div className="h-0" />
        </div>
      </div>

    </div>
  );
};
