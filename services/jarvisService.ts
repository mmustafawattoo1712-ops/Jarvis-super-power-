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
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private videoStream: MediaStream | null = null; 
  private nextStartTime: number = 0;
  private sources: Set<AudioBufferSourceNode> = new Set();
  
  // VAD State
  private isSpeaking: boolean = false;
  private silenceTimer: any = null;

  // Wake Word State
  private recognition: any = null;
  private isWakeWordActive: boolean = false;

  // Callbacks
  public onStateChange: (state: ConnectionState) => void = () => {};
  public onAudioData: (frequencyData: Uint8Array) => void = () => {};
  public onLog: (text: string, source: 'SYSTEM' | 'J.A.R.V.I.S.' | 'USER') => void = () => {};
  public onSystemUpdate: (update: Partial<SystemStatus>) => void = () => {};
  public onUserSpeaking: (isSpeaking: boolean) => void = () => {};

  constructor() {
    // Client initialized in connect()
  }

  // --- WAKE WORD LOGIC ---
  initWakeWordDetection() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      this.onLog("VOICE RECOGNITION SYSTEM OFFLINE: Browser not supported.", "SYSTEM");
      return;
    }
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
        // console.log("Wake word detection active");
    };

    this.recognition.onresult = (event: any) => {
       const lastResultIndex = event.results.length - 1;
       const transcript = event.results[lastResultIndex][0].transcript.trim().toLowerCase();
       
       if (
           transcript.includes('hello jarvis') || 
           transcript.includes('jarvis') || 
           transcript.includes('wake up') || 
           transcript.includes('system') ||
           transcript.includes('activate')
       ) {
          this.onLog(`Voice Auth Recognized: "${transcript}"`, "USER");
          this.connect(); 
       }
    };

    this.recognition.onerror = (event: any) => {
       // Silently handle errors to prevent log spamming, unless critical
    };
    
    this.recognition.onend = () => {
       // Only restart if we are truly disconnected and explicitly want to listen
       if (this.isWakeWordActive && this.connectionState === ConnectionState.DISCONNECTED) {
           setTimeout(() => {
               try { 
                 if (this.isWakeWordActive && this.connectionState === ConnectionState.DISCONNECTED) {
                    this.recognition.start(); 
                 }
               } catch(e) {}
           }, 1000);
       }
    };
  }
  
  startWakeWordDetection() {
    if (this.connectionState === ConnectionState.CONNECTED || this.connectionState === ConnectionState.CONNECTING) return;
    
    this.isWakeWordActive = true;
    try {
      this.recognition?.start();
      this.onLog("Standby mode engaged. Listening for 'Activate System'...", "SYSTEM");
    } catch (e) {
      // Ignore if already started
    }
  }

  stopWakeWordDetection() {
    this.isWakeWordActive = false;
    try {
      this.recognition?.stop();
    } catch(e) {}
  }
  // -----------------------

  async connect() {
    if (!process.env.API_KEY) {
      this.onLog("CRITICAL FAILURE: API_KEY is missing in environment.", "SYSTEM");
      this.updateState(ConnectionState.ERROR);
      return;
    }

    try {
      // 1. Stop Wake Word Listener
      this.stopWakeWordDetection();
      
      // CRITICAL: Add generous delay to allow microphone hardware to be released by SpeechRecognition
      // Some mobile devices are slow to release the resource.
      await new Promise(resolve => setTimeout(resolve, 800));

      this.updateState(ConnectionState.CONNECTING);
      this.onLog("Initializing Neural Uplink...", "SYSTEM");

      // Initialize Audio Contexts
      // Use fallback for AudioContext creation to handle browser differences
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.inputAudioContext = new AudioContextClass({ sampleRate: 16000 });
      this.outputAudioContext = new AudioContextClass({ sampleRate: 24000 });
      this.nextStartTime = 0;

      // Ensure Output Context is Running (User Interaction Requirement)
      if (this.outputAudioContext && this.outputAudioContext.state === 'suspended') {
        await this.outputAudioContext.resume();
      }

      // Request Microphone with Fallback Strategy
      try {
        try {
            // Attempt 1: High quality settings
            this.stream = await navigator.mediaDevices.getUserMedia({ 
              audio: {
                channelCount: 1,
                echoCancellation: true,
                autoGainControl: true,
                noiseSuppression: true
              } 
            });
        } catch (err) {
            console.warn("High-quality audio constraints failed, falling back to basic audio.");
            // Attempt 2: Basic settings
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        this.onLog("Audio Input Sensors: ONLINE", "SYSTEM");
      } catch (e) {
        this.onLog(`MIC ERROR: ${(e as Error).name} - ${(e as Error).message}`, "SYSTEM");
        throw new Error("Microphone access denied or device busy. Please check permissions.");
      }
      
      // Initialize GoogleGenAI
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let sessionPromise: Promise<any>;

      this.onLog("Authenticating with Gemini Matrix...", "SYSTEM");

      // Connect to Live API
      sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO], 
          systemInstruction: `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), a highly advanced AI assistant.
          Your persona is polite, witty, slightly formal (British butler style), and incredibly efficient.
          Keep responses concise and helpful. 
          When asked to perform a task (scan system, change theme, open app), confirm briefly and execute the function.`,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } }
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
          onclose: (e) => this.handleClose(e),
          onerror: (e) => this.handleError(e)
        }
      });

    } catch (error) {
      console.error("Connection failed", error);
      this.updateState(ConnectionState.ERROR);
      this.onLog(`Connection Failure: ${(error as Error).message}`, "SYSTEM");
      this.disconnect();
    }
  }

  private handleOpen(sessionPromise: Promise<any>) {
    this.updateState(ConnectionState.CONNECTED);
    this.onLog("Uplink Established. Systems Online.", "SYSTEM");
    this.startAudioInputStream(sessionPromise);
  }

  private startAudioInputStream(sessionPromise: Promise<any>) {
    if (!this.inputAudioContext || !this.stream) return;

    // Ensure context is running before creating sources
    if (this.inputAudioContext.state === 'suspended') {
      this.inputAudioContext.resume().catch(e => console.error("Failed to resume input context:", e));
    }

    const source = this.inputAudioContext.createMediaStreamSource(this.stream);
    const processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      // Safety check if we are still connected
      if (this.connectionState !== ConnectionState.CONNECTED) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcmBlob = createPcmBlob(inputData);
      
      sessionPromise.then(session => {
        session.sendRealtimeInput({ media: pcmBlob });
      }).catch(err => {
         // Connection might be closed, ignore
      });

      // Visual Data Update
      const visualData = new Uint8Array(inputData.length);
      for(let i=0; i<inputData.length; i++) {
        visualData[i] = Math.abs(inputData[i]) * 255;
      }
      this.onAudioData(visualData.slice(0, 64));

      // Simple VAD
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
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    
    if (base64Audio && this.outputAudioContext) {
      try {
        if (this.outputAudioContext.state === 'suspended') {
          await this.outputAudioContext.resume();
        }

        const audioData = base64ToUint8Array(base64Audio);
        this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
        
        const audioBuffer = await decodeAudioData(audioData, this.outputAudioContext);
        const source = this.outputAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputAudioContext.destination);
        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
        this.sources.add(source);
        source.onended = () => this.sources.delete(source);
      } catch (err) {
        console.error("Audio Playback Error:", err);
      }
    }

    if (message.toolCall) {
      for (const fc of message.toolCall.functionCalls) {
        this.onLog(`Protocol Executed: ${fc.name}`, "SYSTEM");
        let result = {};

        // Execute Tool Logic
        if (fc.name === 'toggleTheme') {
          const theme = (fc.args as any).theme;
          this.onSystemUpdate({ theme });
          result = { status: 'success' };
        } 
        else if (fc.name === 'scanSystem') {
          this.onSystemUpdate({ memory: 88, cpu: 12 });
          result = { memory: '88TB', status: 'OPTIMAL' };
        }
        else if (fc.name === 'openApp') {
          this.handleOpenApp((fc.args as any).appName, (fc.args as any).query);
          result = { status: 'opened' };
        }
        else if (fc.name === 'controlFlashlight') {
           this.handleFlashlight((fc.args as any).state === 'ON');
           result = { status: 'success' };
        }
        else if (fc.name === 'sendNotification') {
          if (Notification.permission === 'granted') new Notification((fc.args as any).title, { body: (fc.args as any).body });
          result = { status: 'sent' };
        }
        
        // Send Response
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

    if (message.serverContent?.interrupted) {
      this.onLog("Interruption detected.", "SYSTEM");
      this.sources.forEach(s => s.stop());
      this.sources.clear();
      this.nextStartTime = 0;
    }
  }

  private handleOpenApp(appName: string, query: string = '') {
    let url = '';
    switch(appName) {
      case 'YOUTUBE': url = query ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` : 'https://www.youtube.com'; break;
      case 'GOOGLE': url = query ? `https://www.google.com/search?q=${encodeURIComponent(query)}` : 'https://www.google.com'; break;
      case 'MAPS': url = query ? `https://www.google.com/maps/search/${encodeURIComponent(query)}` : 'https://maps.google.com'; break;
      case 'PHONE': url = `tel:${query}`; break;
      case 'SMS': url = `sms:${query}`; break;
      case 'WHATSAPP': url = `https://wa.me/${query}`; break; 
      default: return;
    }
    window.open(url, '_blank');
  }

  private async handleFlashlight(turnOn: boolean) {
    if (!turnOn) {
      if (this.videoStream) {
        this.videoStream.getTracks().forEach(t => t.stop());
        this.videoStream = null;
      }
      return;
    }
    try {
      this.videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const track = this.videoStream.getVideoTracks()[0];
      await track.applyConstraints({ advanced: [{ torch: true } as any] });
      this.onLog("Flashlight engaged.", "SYSTEM");
    } catch (e) {
      this.onLog("Flashlight hardware unavailable.", "SYSTEM");
    }
  }

  private handleClose(e: CloseEvent) {
    this.updateState(ConnectionState.DISCONNECTED);
    this.onLog(`Link Severed (Code ${e.code}). Re-engaging standby.`, "SYSTEM");
    this.startWakeWordDetection();
  }

  private handleError(e: ErrorEvent) {
    this.updateState(ConnectionState.ERROR);
    this.onLog("Critical Error: Connection lost.", "SYSTEM");
    this.startWakeWordDetection();
  }

  private updateState(state: ConnectionState) {
    this.connectionState = state;
    this.onStateChange(state);
  }

  async disconnect() {
    this.stopWakeWordDetection();
    
    // Stop all tracks
    if (this.stream) {
        this.stream.getTracks().forEach(track => {
            track.stop();
        });
        this.stream = null;
    }
    if (this.videoStream) {
        this.videoStream.getTracks().forEach(track => {
            track.stop();
        });
        this.videoStream = null;
    }
    
    // Close contexts
    if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') {
        await this.inputAudioContext.close();
        this.inputAudioContext = null;
    }
    if (this.outputAudioContext && this.outputAudioContext.state !== 'closed') {
        await this.outputAudioContext.close();
        this.outputAudioContext = null;
    }
    
    this.updateState(ConnectionState.DISCONNECTED);
    this.startWakeWordDetection();
  }
}