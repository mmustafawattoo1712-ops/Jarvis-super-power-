export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface SystemStatus {
  memory: number;
  cpu: number;
  network: string;
  securityLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  theme: 'BLUE' | 'RED';
}

export interface LogEntry {
  id: string;
  timestamp: string;
  source: 'SYSTEM' | 'USER' | 'J.A.R.V.I.S.';
  message: string;
}

// Minimal type definitions for the Gemini Live API as used in the service
export interface LiveConfig {
  model: string;
  systemInstruction?: string;
  responseModalities: 'AUDIO'[];
  speechConfig?: {
    voiceConfig?: {
      prebuiltVoiceConfig?: {
        voiceName: string;
      };
    };
  };
  tools?: Array<{ functionDeclarations: any[] }>;
}
