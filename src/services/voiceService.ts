import { GoogleGenAI, Modality } from "@google/genai";

class VoiceService {
  private ai: GoogleGenAI;
  private isMuted: boolean = false;
  private hasInteracted: boolean = false;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  setInteracted() {
    this.hasInteracted = true;
  }

  private useNativeOnly: boolean = false;

  async speak(text: string) {
    if (this.isMuted) return;
    
    if (this.useNativeOnly) {
      this.speakNative(text);
      return;
    }

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        await this.playPcm(base64Audio);
      } else {
        this.speakNative(text);
      }
    } catch (error: any) {
      // Check if it's a quota error (429) or other API error
      const isQuotaError = error?.message?.includes("429") || 
                           error?.status === "RESOURCE_EXHAUSTED" ||
                           (typeof error === 'string' && error.includes("429"));
      
      if (isQuotaError) {
        console.warn("Gemini TTS Quota exceeded. Switching to native speech synthesis for this session.");
        this.useNativeOnly = true;
      } else {
        console.error("Voice Service Error:", error);
      }
      
      // Fallback to native speech synthesis
      this.speakNative(text);
    }
  }

  private speakNative(text: string) {
    if (!('speechSynthesis' in window)) {
      console.error("Speech synthesis not supported in this browser.");
      return;
    }

    const speak = () => {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      
      // Try to find a good English voice
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) 
                          || voices.find(v => v.lang.startsWith('en'))
                          || voices[0];
      
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      window.speechSynthesis.speak(utterance);
    };

    // If voices are already loaded, speak immediately
    if (window.speechSynthesis.getVoices().length > 0) {
      speak();
    } else {
      // Otherwise wait for them to load
      window.speechSynthesis.onvoiceschanged = () => {
        speak();
        // Remove listener to avoid multiple triggers
        window.speechSynthesis.onvoiceschanged = null;
      };
    }
  }

  private async playPcm(base64Data: string) {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      // Decode base64 to binary string
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // TTS returns 16-bit signed PCM (Little Endian)
      const pcmData = new Int16Array(bytes.buffer);
      const float32Data = new Float32Array(pcmData.length);
      
      // Normalize Int16 to Float32 (-1.0 to 1.0)
      for (let i = 0; i < pcmData.length; i++) {
        float32Data[i] = pcmData[i] / 32768;
      }

      const audioBuffer = audioContext.createBuffer(1, float32Data.length, 24000);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
      
      // Clean up context after playback
      source.onended = () => {
        audioContext.close();
      };
    } catch (err) {
      console.error("Audio Playback Error:", err);
    }
  }

  async welcome() {
    if (this.hasInteracted) return;
    this.hasInteracted = true;
    // "Talha Welcome you."
    await this.speak("Talha Welcome you.");
  }

  async pictureReceived() {
    await this.speak("Picture uploads successfully.");
  }

  async enhancementComplete() {
    await this.speak("Your enhancement complete.");
  }
}

export const voiceService = new VoiceService();
