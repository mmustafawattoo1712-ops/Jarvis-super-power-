import { GoogleGenAI, LiveServerMessage, FunctionDeclaration, Type, Modality } from "@google/genai";
import { ConnectionState, SystemStatus } from "../types";
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from "../utils/audioUtils";

// Tool Definitions
const toggleThemeFunc: FunctionDeclaration = {
  name: 'toggleTheme',
  description: 'Toggles the interface theme color between Blue (Stealth) and Red (Combat/Mark 3).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      theme: { type: Type.STRING, enum: ['BLUE', 'RED'], description: 'The target theme color.' }
    },
    required: ['theme']
  }
};

const scanSystemFunc: FunctionDeclaration = {
  name: 'scanSystem',
  description: 'Scans the current system status, including memory, CPU, and network integrity.',
  parameters: { type: Type.OBJECT, properties: {} }
};

const searchDatabaseFunc: FunctionDeclaration = {
  name: 'searchDatabase',
  description: 'Searches the internal secure database for specific information.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'The search query.' }
    },
    required: ['query']
  }
};

const openAppFunc: FunctionDeclaration = {
  name: 'openApp',
  description: 'Opens external applications or websites on the device.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      appName: { 
        type: Type.STRING, 
        enum: ['YOUTUBE', 'GOOGLE', 'MAPS', 'PHONE', 'SMS', 'WHATSAPP', 'SPOTIFY', 'CAMERA'], 
        description: 'The name of the application to open.' 
      },
      query: { type: Type.STRING, description: 'Optional search query or phone number.' }
    },
    required: ['appName']
  }
};

const controlFlashlightFunc: FunctionDeclaration = {
  name: 'controlFlashlight',
  description: 'Turns the device flashlight (torch) on or off.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      state: { type: Type.STRING, enum: ['ON', 'OFF'], description: 'Desired state of the flashlight.' }
    },
    required: ['state']
  }
};

const sendNotificationFunc: FunctionDeclaration = {
  name: 'sendNotification',
  description: 'Sends a system notification to the user.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: 'Notification title' },
      body: { type: Type.STRING, description: 'Notification body text' }
    },
    required: ['title', 'body']
  }
};

export class JarvisService {
  private ai: GoogleGenAI;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private videoStream: MediaStream | null = null; // For flashlight
  private nextStartTime: number = 0;
  private sources: Set<AudioBufferSourceNode> = new Set();
  
  // VAD State
  private isSpeaking: boolean = false;
  private silenceTimer: any = null;

  // Callbacks
  public onStateChange: (state: ConnectionState) => void = () => {};
  public onAudioData: (frequencyData: Uint8Array) => void = () => {};
  public onLog: (text: string, source: 'SYSTEM' | 'J.A.R.V.I.S.') => void = () => {};
  public onSystemUpdate: (update: Partial<SystemStatus>) => void = () => {};
  public onUserSpeaking: (isSpeaking: boolean) => void = () => {};

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async connect() {
    try {
      this.updateState(ConnectionState.CONNECTING);
      
      // Request Notification Permission immediately
      if ('Notification' in window && Notification.permission !== 'granted') {
        await Notification.requestPermission();
      }

      // Initialize Audio Contexts
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      this.nextStartTime = 0;

      // Request Microphone
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      let sessionPromise: Promise<any>;
      
      sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: "You are J.A.R.V.I.S., a highly advanced AI system. You have full control over this device's apps and hardware. You can open apps like YouTube or Maps, control the flashlight, and send system notifications. You are helpful, precise, and have a dry British wit. Keep responses concise and spoken naturally.",
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } // Deep, authoritative voice
          },
          tools: [{ functionDeclarations: [toggleThemeFunc, scanSystemFunc, searchDatabaseFunc, openAppFunc, controlFlashlightFunc, sendNotificationFunc] }]
        },
        callbacks: {
          onopen: () => {
            this.handleOpen(sessionPromise);
          },
          onmessage: (msg) => {
            this.handleMessage(msg, sessionPromise);
          },
          onclose: this.handleClose.bind(this),
          onerror: this.handleError.bind(this)
        }
      });

    } catch (error) {
      console.error("Connection failed", error);
      this.updateState(ConnectionState.ERROR);
    }
  }

  private handleOpen(sessionPromise: Promise<any>) {
    this.updateState(ConnectionState.CONNECTED);
    this.onLog("Secure connection established. J.A.R.V.I.S. online.", "SYSTEM");
    this.startAudioInputStream(sessionPromise);
  }

  private startAudioInputStream(sessionPromise: Promise<any>) {
    if (!this.inputAudioContext || !this.stream) return;

    const source = this.inputAudioContext.createMediaStreamSource(this.stream);
    const processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmBlob = createPcmBlob(inputData);
      
      sessionPromise.then(session => {
        session.sendRealtimeInput({ media: pcmBlob });
      });

      // Visual Data
      const visualData = new Uint8Array(inputData.length);
      for(let i=0; i<inputData.length; i++) {
        visualData[i] = Math.abs(inputData[i]) * 255;
      }
      this.onAudioData(visualData.slice(0, 64));

      // Voice Activity Detection (VAD)
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      
      if (rms > 0.01) {
        if (!this.isSpeaking) {
          this.isSpeaking = true;
          this.onUserSpeaking(true);
        }
        if (this.silenceTimer) clearTimeout(this.silenceTimer);
        this.silenceTimer = setTimeout(() => {
          this.isSpeaking = false;
          this.onUserSpeaking(false);
        }, 400); 
      }
    };

    source.connect(processor);
    processor.connect(this.inputAudioContext.destination);
  }

  private async handleMessage(message: LiveServerMessage, sessionPromise: Promise<any>) {
    // 1. Handle Audio Output
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio && this.outputAudioContext) {
      this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
      
      const audioBuffer = await decodeAudioData(
        base64ToUint8Array(base64Audio),
        this.outputAudioContext
      );

      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      const gainNode = this.outputAudioContext.createGain();
      gainNode.gain.value = 1.2; 
      source.connect(gainNode);
      gainNode.connect(this.outputAudioContext.destination);

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
      this.sources.add(source);

      source.onended = () => this.sources.delete(source);
    }

    // 2. Handle Tool Calls
    if (message.toolCall) {
      for (const fc of message.toolCall.functionCalls) {
        this.onLog(`Executing protocol: ${fc.name}`, "SYSTEM");
        let result = {};

        if (fc.name === 'toggleTheme') {
          const theme = (fc.args as any).theme;
          this.onSystemUpdate({ theme });
          result = { status: 'success', message: `Theme changed to ${theme}` };
        } 
        else if (fc.name === 'scanSystem') {
          const mem = Math.floor(Math.random() * 20) + 40; 
          this.onSystemUpdate({ memory: mem, cpu: Math.floor(Math.random() * 50) + 10 });
          result = { memory: `${mem}TB`, integrity: '99.9%', threats: 'None detected' };
        }
        else if (fc.name === 'searchDatabase') {
           result = { matches: ['Project EXODUS', 'Stark Industries Archive 12-B'], access: 'GRANTED' };
        }
        else if (fc.name === 'openApp') {
          const appName = (fc.args as any).appName;
          const query = (fc.args as any).query || '';
          this.handleOpenApp(appName, query);
          result = { status: 'opened', app: appName };
        }
        else if (fc.name === 'controlFlashlight') {
          const state = (fc.args as any).state;
          await this.handleFlashlight(state === 'ON');
          result = { status: 'success', state: state };
        }
        else if (fc.name === 'sendNotification') {
          const { title, body } = fc.args as any;
          if (Notification.permission === 'granted') {
             new Notification(title, { body });
             result = { status: 'sent' };
          } else {
             result = { status: 'permission_denied' };
          }
        }

        sessionPromise.then(session => {
          session.sendToolResponse({
            functionResponses: {
              id: fc.id,
              name: fc.name,
              response: { result }
            }
          });
        });
      }
    }

    // 3. Handle Interruption
    if (message.serverContent?.interrupted) {
      this.onLog("Interruption detected. Halting output.", "SYSTEM");
      this.sources.forEach(s => s.stop());
      this.sources.clear();
      this.nextStartTime = 0;
    }
  }

  private handleOpenApp(appName: string, query: string) {
    let url = '';
    switch(appName) {
      case 'YOUTUBE': url = query ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` : 'https://www.youtube.com'; break;
      case 'GOOGLE': url = query ? `https://www.google.com/search?q=${encodeURIComponent(query)}` : 'https://www.google.com'; break;
      case 'MAPS': url = query ? `https://www.google.com/maps/search/${encodeURIComponent(query)}` : 'https://maps.google.com'; break;
      case 'PHONE': url = `tel:${query}`; break;
      case 'SMS': url = `sms:${query}`; break;
      case 'WHATSAPP': url = `https://wa.me/${query}`; break; // Universal link
      case 'SPOTIFY': url = 'spotify:'; break;
      default: return;
    }
    window.open(url, '_blank');
  }

  private async handleFlashlight(turnOn: boolean) {
    // If turning off and we have a stream, stop it
    if (!turnOn) {
      if (this.videoStream) {
        this.videoStream.getTracks().forEach(t => t.stop());
        this.videoStream = null;
      }
      return;
    }

    // If turning on
    try {
      if (!this.videoStream) {
        this.videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
      }
      
      const track = this.videoStream.getVideoTracks()[0];
      const capabilities = track.getCapabilities() as any; // Cast to any because capabilities can be diverse

      if (capabilities.torch) {
        await track.applyConstraints({
          advanced: [{ torch: true } as any]
        });
        this.onLog("Flashlight engaged.", "SYSTEM");
      } else {
        this.onLog("Flashlight not supported on this device/browser.", "SYSTEM");
      }
    } catch (e) {
      console.error("Flashlight error", e);
      this.onLog("Error accessing camera for flashlight.", "SYSTEM");
    }
  }

  private handleClose() {
    this.updateState(ConnectionState.DISCONNECTED);
    this.onLog("Connection terminated.", "SYSTEM");
  }

  private handleError(e: ErrorEvent) {
    console.error(e);
    this.updateState(ConnectionState.ERROR);
    this.onLog("Critical Error: Connection lost.", "SYSTEM");
  }

  private updateState(state: ConnectionState) {
    this.connectionState = state;
    this.onStateChange(state);
  }

  async disconnect() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    if (this.videoStream) {
      this.videoStream.getTracks().forEach(track => track.stop());
    }
    if (this.inputAudioContext) await this.inputAudioContext.close();
    if (this.outputAudioContext) await this.outputAudioContext.close();
    this.updateState(ConnectionState.DISCONNECTED);
  }
}