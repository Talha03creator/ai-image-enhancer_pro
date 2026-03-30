/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Upload, 
  Sparkles, 
  Image as ImageIcon, 
  Download, 
  RefreshCw, 
  ChevronRight, 
  History, 
  Maximize2, 
  Share2, 
  CheckCircle2, 
  AlertCircle,
  Zap,
  Smile,
  Home,
  Info,
  HelpCircle,
  User as UserIcon,
  Sun,
  Moon,
  Camera,
  Layers,
  Palette,
  Loader2,
  X,
  Check,
  Search,
  Menu,
  Linkedin,
  Mail,
  MessageSquare,
  Volume2,
  VolumeX,
  Trash2,
  ArrowUpRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AIHelpChat } from './components/AIHelpChat';
import { AuthModal } from './components/AuthModal';
import { ShowcaseItem } from './components/ShowcaseItem';
import { FAQItem } from './components/FAQItem';
import { HistoryItemCard } from './components/HistoryItemCard';
import { voiceService } from './services/voiceService';
import { 
  auth, 
  db, 
  loginWithGoogle, 
  logout, 
  onAuthStateChanged, 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  setDoc, 
  doc, 
  serverTimestamp, 
  handleFirestoreError, 
  OperationType,
  limit,
  User
} from './firebase';

// --- Error Boundary ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; errorInfo: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorInfo: '' };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message || String(error) };
  }

  render() {
    if (this.state.hasError) {
      let displayMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.errorInfo);
        if (parsed.error) displayMessage = `Database Error: ${parsed.error}`;
      } catch (e) {
        displayMessage = this.state.errorInfo;
      }

      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center">
          <div className="glass-dark p-12 rounded-3xl border border-white/10 max-w-md">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-6" />
            <h2 className="text-2xl font-black mb-4 uppercase tracking-tighter">System Error</h2>
            <p className="text-white/60 mb-8 leading-relaxed">{displayMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-brand-primary transition-all"
            >
              RELOAD APPLICATION
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Types ---
type Mode = 'auto' | 'portrait' | 'portrait_blur' | 'bw' | 'ultra_hd' | 'low_light' | 'hdr' | 'color_restore';

interface EnhancementMode {
  id: Mode;
  name: string;
  description: string;
  icon: React.ReactNode;
  premium?: boolean;
}

interface HistoryItem {
  id: string;
  name: string;
  original: string;
  enhanced: string;
  mode: Mode;
  timestamp: number;
  type: 'image';
}

interface QueuedFile {
  id: string;
  file: File;
  previewUrl: string;
  enhancedUrl?: string;
  recommendations?: string[];
  status: 'pending' | 'processing' | 'done' | 'error';
  statusText?: string;
  type: 'image';
  userName: string;
}

// --- Constants ---
const MODES: EnhancementMode[] = [
  { id: 'auto', name: 'Auto Enhance', description: 'Smart optimization for any photo', icon: <Sparkles className="w-5 h-5" /> },
  { id: 'portrait', name: 'Portrait', description: 'Soft skin and sharp facial details', icon: <UserIcon className="w-5 h-5" /> },
  { id: 'portrait_blur', name: 'Portrait + Blur', description: 'Focus on subject with soft background', icon: <Layers className="w-5 h-5" /> },
  { id: 'bw', name: 'B&W Classic', description: 'Timeless black and white conversion', icon: <Palette className="w-5 h-5" /> },
  { id: 'ultra_hd', name: 'Ultra HD', description: '2x Super-resolution & DSLR boost', icon: <Maximize2 className="w-5 h-5" />, premium: true },
  { id: 'low_light', name: 'Low-Light Fix', description: 'Rescue dark and noisy photos', icon: <Moon className="w-5 h-5" />, premium: true },
  { id: 'hdr', name: 'HDR Boost', description: 'Dynamic range and color depth', icon: <Sun className="w-5 h-5" />, premium: true },
  { id: 'color_restore', name: 'Color Restore', description: 'Vibrant colors for faded images', icon: <RefreshCw className="w-5 h-5" />, premium: true },
];

// --- Components ---

const ComparisonSlider = ({ before, after }: { before: string; after: string }) => {
  const [position, setPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!containerRef.current || (!isDragging && e.type !== 'mousemove' && e.type !== 'touchmove')) return;
    
    // If it's a mousemove/touchmove without dragging, we only want it to work if we're NOT using drag mode
    // But let's stick to drag mode for better control
    if (!isDragging && (e.type === 'mousemove' || e.type === 'touchmove')) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const relativeX = x - rect.left;
    const percentage = Math.max(0, Math.min(100, (relativeX / rect.width) * 100));
    setPosition(percentage);
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    handleMove(e);
  };

  useEffect(() => {
    const handleUp = () => setIsDragging(false);
    const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
      if (isDragging) handleMove(e);
    };

    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchend', handleUp);
    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('touchmove', handleGlobalMove);

    return () => {
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchend', handleUp);
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('touchmove', handleGlobalMove);
    };
  }, [isDragging]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full min-h-[400px] md:min-h-[500px] rounded-2xl overflow-hidden cursor-ew-resize select-none border border-white/10 group bg-black/40"
      onMouseDown={handleMouseDown}
      onTouchStart={handleMouseDown}
    >
      {/* After Media (Full background) */}
      <img src={after} alt="Enhanced" className="absolute inset-0 w-full h-full object-contain" />
      
      {/* Before Media (Clipped) */}
      <div 
        className="absolute inset-0 w-full h-full overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img src={before} alt="Original" className="absolute inset-0 w-full h-full object-contain" />
      </div>

      {/* Handle */}
      <div 
        className="absolute top-0 bottom-0 w-0.5 bg-white/50 z-20 group-hover:bg-white transition-colors"
        style={{ left: `${position}%` }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-2xl border-2 border-black/10 transition-transform group-hover:scale-110">
          <div className="flex gap-0.5">
            <div className="w-0.5 h-2.5 bg-black/40 rounded-full" />
            <div className="w-0.5 h-2.5 bg-black/40 rounded-full" />
          </div>
        </div>
        
        {/* Drag Indicator */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -mt-10 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          <span className="bg-black/80 backdrop-blur-md text-[10px] font-black text-white px-2 py-1 rounded border border-white/10 uppercase tracking-widest">
            Drag to compare
          </span>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-4 left-4 px-3 py-1.5 bg-black/60 backdrop-blur-xl rounded-xl text-[10px] font-black text-white/80 z-30 border border-white/10 tracking-[0.2em] shadow-2xl">
        ORIGINAL
      </div>
      <div className="absolute top-4 right-4 px-3 py-1.5 bg-brand-primary/90 backdrop-blur-xl rounded-xl text-[10px] font-black text-black z-30 border border-brand-primary/20 tracking-[0.2em] shadow-2xl">
        ENHANCED
      </div>
      
      {/* Overlay info */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="bg-black/60 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/10 flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-white/40 uppercase tracking-tighter">Current View</span>
            <span className="text-[10px] font-bold text-white tracking-widest">{Math.round(position)}% Original</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const ModeCard: React.FC<{ mode: EnhancementMode; selected: boolean; onSelect: () => void }> = ({ mode, selected, onSelect }) => (
  <motion.button
    whileHover={{ scale: 1.02, backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
    whileTap={{ scale: 0.98 }}
    onClick={onSelect}
    className={`relative flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-300 border ${
      selected 
        ? 'bg-brand-primary/15 border-brand-primary/50 shadow-[0_0_20px_rgba(0,242,255,0.1)]' 
        : 'bg-white/2 border-white/5 hover:border-white/20'
    }`}
  >
    <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-all duration-300 ${selected ? 'bg-brand-primary text-black' : 'bg-white/5 text-white/40'}`}>
      {React.isValidElement(mode.icon) && React.cloneElement(mode.icon as React.ReactElement<any>, { className: 'w-4 h-4' })}
    </div>
    <div className="min-w-0 flex-1">
      <h3 className={`font-bold text-[10px] uppercase tracking-wider truncate ${selected ? 'text-brand-primary' : 'text-white/90'}`}>
        {mode.name}
      </h3>
      <p className="text-[9px] text-white/30 truncate">
        {mode.description}
      </p>
    </div>
    {mode.premium && (
      <div className="absolute top-1.5 right-1.5">
        <Zap className={`w-2 h-2 ${selected ? 'text-brand-primary fill-brand-primary' : 'text-yellow-400/30'}`} />
      </div>
    )}
    {selected && (
      <motion.div 
        layoutId="active-mode-indicator"
        className="absolute -left-px top-1/2 -translate-y-1/2 w-0.5 h-4 bg-brand-primary rounded-full"
      />
    )}
  </motion.button>
);

const PolicyModal = ({ type, onClose }: { type: 'privacy' | 'terms', onClose: () => void }) => {
  const content = type === 'privacy' ? {
    title: 'Privacy Policy',
    sections: [
      { title: 'Data Collection', text: 'We collect images you upload for processing. These are used solely for the purpose of enhancement.' },
      { title: 'Data Usage', text: 'Images are processed using AI and are not stored permanently unless you choose to save them to your history.' },
      { title: 'Cookies', text: 'We use essential cookies for session management and to improve your experience.' },
      { title: 'Security', text: 'We use industry-standard security measures to protect your data during transmission and processing.' }
    ]
  } : {
    title: 'Terms of Service',
    sections: [
      { title: 'Usage', text: 'You must not upload illegal or harmful content. You are responsible for the content you upload.' },
      { title: 'Ownership', text: 'You retain ownership of your images. We do not claim any rights to your content.' },
      { title: 'Warranty', text: 'The service is provided "as is" without warranty of any kind.' },
      { title: 'Liability', text: 'We are not liable for any damages arising from the use of the service.' }
    ]
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="glass-dark w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-3xl p-8 border border-white/10"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-black tracking-tighter">{content.title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="space-y-8">
          {content.sections.map((section, i) => (
            <div key={i}>
              <h3 className="text-brand-primary font-bold uppercase tracking-widest text-xs mb-2">{section.title}</h3>
              <p className="text-white/60 leading-relaxed">{section.text}</p>
            </div>
          ))}
        </div>
        <button 
          onClick={onClose}
          className="mt-12 w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-brand-primary transition-colors"
        >
          CLOSE
        </button>
      </motion.div>
    </motion.div>
  );
};


// --- Main App Component ---

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [step, setStep] = useState<'intro' | 'upload' | 'processing' | 'result'>('intro');
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [selectedMode, setSelectedMode] = useState<Mode>('auto');
  const [faceEnhancement, setFaceEnhancement] = useState(true);
  const [backgroundBlur, setBackgroundBlur] = useState(false);
  const [colorPop, setColorPop] = useState(true);
  const [smartHdr, setSmartHdr] = useState(true);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilterMode, setHistoryFilterMode] = useState<Mode | 'all'>('all');
  const [isDragging, setIsDragging] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activePolicy, setActivePolicy] = useState<'privacy' | 'terms' | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const contactRef = useRef<HTMLDivElement>(null);
  const showcaseRef = useRef<HTMLDivElement>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      if (currentUser) {
        // Sync user profile
        setDoc(doc(db, 'users', currentUser.uid), {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
          createdAt: serverTimestamp()
        }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`));
      }
    });
    return () => unsubscribe();
  }, []);

  // History Sync
  useEffect(() => {
    if (!user || !isAuthReady) {
      setHistory([]);
      return;
    }

    const q = query(
      collection(db, 'history'),
      where('uid', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => doc.data() as HistoryItem);
      setHistory(items);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'history');
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
    if (step !== 'intro') {
      setStep('intro');
      setTimeout(() => {
        ref.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      ref.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const activeFile = queue[activeIndex];

  const filteredHistory = history.filter(item => {
    const matchesSearch = 
      item.name.toLowerCase().includes(historySearch.toLowerCase()) ||
      item.mode.replace('_', ' ').toLowerCase().includes(historySearch.toLowerCase());
    const matchesMode = historyFilterMode === 'all' || item.mode === historyFilterMode;
    return matchesSearch && matchesMode;
  });

  const handleDownloadHistoryItem = (item: HistoryItem) => {
    const link = document.createElement('a');
    link.href = item.enhanced;
    // Use .jpg as the server saves in high-quality JPEG by default
    const extension = item.enhanced.startsWith('data:image/png') ? 'png' : 'jpg';
    link.download = `talha-ai-${item.mode}-${Date.now()}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleReapplyHistoryItem = async (item: HistoryItem) => {
    try {
      const response = await fetch(item.original);
      const blob = await response.blob();
      const file = new File([blob], `reapplied-${item.id}.jpg`, { type: blob.type });
      
      const newFile: QueuedFile = {
        id: Math.random().toString(36).substring(7),
        file,
        previewUrl: URL.createObjectURL(file),
        status: 'pending',
        type: 'image',
        userName: 'Talha Ansari'
      };
      
      setQueue([newFile]);
      setActiveIndex(0);
      setSelectedMode(item.mode);
      setStep('upload');
      setShowHistory(false);
    } catch (error) {
      console.error("Failed to re-apply history item", error);
    }
  };

  // --- Effects ---
  useEffect(() => {
    const savedHistory = localStorage.getItem('talha_ai_history');
    if (savedHistory) setHistory(JSON.parse(savedHistory));
  }, []);

  useEffect(() => {
    localStorage.setItem('talha_ai_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    voiceService.setMuted(isMuted);
  }, [isMuted]);

  useEffect(() => {
    const handleFirstInteraction = () => {
      voiceService.welcome();
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);
    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, []);

  const handleModeChange = (modeId: Mode) => {
    setSelectedMode(modeId);
    if (queue.length > 0) {
      setQueue(prev => prev.map(f => ({ ...f, status: 'pending', statusText: 'Pending' })));
      setStep('upload');
    }
  };
  const handleFilesSelect = (files: FileList | File[]) => {
    const newFiles = Array.from(files).filter(f => 
      f.type.startsWith('image/') && 
      f.size <= 30 * 1024 * 1024
    );
    
    const tooLargeFiles = Array.from(files).filter(f => f.size > 4.5 * 1024 * 1024);
    if (tooLargeFiles.length > 0) {
      console.warn('Some files are over 4.5MB. Vercel deployments may fail to process these.');
    }

    if (newFiles.length === 0) {
      alert('Please upload valid image files (JPG, PNG) under 30MB');
      return;
    }
    
    const newQueuedFiles = newFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending' as const,
      type: 'image' as const,
      userName: 'Talha Ansari'
    }));

    setQueue(prev => {
      const updated = [...prev, ...newQueuedFiles];
      if (prev.length === 0) setActiveIndex(0);
      return updated;
    });
    if (step === 'intro' || step === 'result') setStep('upload');
    voiceService.pictureReceived();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelect(e.dataTransfer.files);
    }
  };

  const getErrorMessage = (error: unknown): string => {
    if (!(error instanceof Error)) return 'Unknown error';
    const msg = error.message.toLowerCase();
    
    if (msg.includes('413') || msg.includes('too large')) return 'Image too large (>4.5MB)';
    if (msg.includes('504') || msg.includes('timeout')) return 'Server timeout (10s limit)';
    if (msg.includes('500')) return 'Internal server error';
    if (msg.includes('401')) return 'Authentication required';
    if (msg.includes('403')) return 'Access denied';
    if (msg.includes('429')) return 'Too many requests';
    if (msg.includes('400')) return 'Invalid image data';
    if (msg.includes('502') || msg.includes('503')) return 'Server overloaded';
    if (msg.includes('network error') || msg.includes('failed to fetch')) return 'Network connection lost';
    if (msg.includes('quota')) return 'Daily limit reached';
    if (msg.includes('aborted')) return 'Request cancelled';
    if (msg.includes('format') || msg.includes('type')) return 'Unsupported format';
    
    return error.message.length > 30 ? error.message.substring(0, 27) + '...' : error.message;
  };

  const handleEnhanceAll = async () => {
    if (queue.length === 0) return;

    setStep('processing');
    setIsProcessingQueue(true);

    const newQueue = [...queue];
    
    for (let i = 0; i < newQueue.length; i++) {
      if (newQueue[i].status !== 'pending' && newQueue[i].status !== 'error') continue;
      
      setActiveIndex(i);
      
      setQueue(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'processing', statusText: 'Analyzing image flaws...' } : f));
      
      // Simulate analysis phase
      await new Promise(r => setTimeout(r, 1500));
      
      setQueue(prev => prev.map((f, idx) => idx === i ? { ...f, statusText: 'Detecting pixelation & noise...' } : f));
      await new Promise(r => setTimeout(r, 1500));

      setQueue(prev => prev.map((f, idx) => idx === i ? { ...f, statusText: 'Upscaling to 4K DSLR quality...' } : f));
      
      const formData = new FormData();
      formData.append('image', newQueue[i].file);
      formData.append('mode', selectedMode);
      formData.append('faceEnhancement', faceEnhancement.toString());
      formData.append('backgroundBlur', backgroundBlur.toString());
      formData.append('colorPop', colorPop.toString());
      formData.append('smartHdr', smartHdr.toString());

      try {
        const response = await fetch('/api/enhance', {
          method: 'POST',
          body: formData,
          headers: {
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          let errorData;
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            errorData = await response.json().catch(() => null);
          } else {
            const text = await response.text().catch(() => '');
            console.error('Non-JSON error response:', text);
            
            if (text.includes('Cookie check') || text.includes('Action required to load your app')) {
              errorData = { 
                message: 'Browser security settings are blocking the enhancement process. Please click the "Open in new tab" button at the top right of the preview or enable third-party cookies in your browser settings.' 
              };
            } else {
              errorData = { message: `Server error (${response.status}): ${response.statusText}` };
            }
          }
          
          console.error('Server error details:', errorData);
          const errorMessage = errorData?.message || errorData?.details || 'Enhancement failed';
          throw new Error(errorMessage);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text().catch(() => '');
          console.error('Unexpected non-JSON response:', text);
          
          if (text.includes('Cookie check') || text.includes('Action required to load your app')) {
            throw new Error('Browser security settings are blocking the enhancement process. Please click the "Open in new tab" button at the top right of the preview or enable third-party cookies in your browser settings.');
          }
          
          throw new Error('Server returned an invalid response format (HTML instead of JSON). This usually happens when a route is not found or the server crashes.');
        }

        const data = await response.json();
        
        setQueue(prev => prev.map((f, idx) => idx === i ? { 
          ...f, 
          status: 'done', 
          enhancedUrl: data.enhancedImageUrl,
          recommendations: data.recommendations,
          statusText: 'Done'
        } : f));
        
        const newItem: HistoryItem = {
          id: Date.now().toString() + newQueue[i].id,
          name: newQueue[i].file.name,
          original: newQueue[i].previewUrl,
          enhanced: data.enhancedImageUrl,
          mode: selectedMode,
          timestamp: Date.now(),
          type: newQueue[i].type,
        };
        
        // Save to Firestore if logged in
        if (user) {
          addDoc(collection(db, 'history'), {
            ...newItem,
            uid: user.uid
          }).catch(err => {
            console.error('Failed to save to history:', err);
            // Don't throw here as it's not awaited and we don't want to break the UI
          });
        } else {
          setHistory(prev => [newItem, ...prev].slice(0, 50));
        }
        
      } catch (error) {
        console.error('Enhancement error:', error);
        const errorMessage = getErrorMessage(error);
        
        setQueue(prev => prev.map((f, idx) => idx === i ? { 
          ...f, 
          status: 'error', 
          statusText: errorMessage
        } : f));
      }
    }
    
    setIsProcessingQueue(false);
    setStep('result');
    voiceService.enhancementComplete();
  };

          const handleDownloadAll = async () => {
    for (const qFile of queue) {
      if (qFile.enhancedUrl) {
        try {
          let url = qFile.enhancedUrl;
          let isObjectUrl = false;
          
          if (!qFile.enhancedUrl.startsWith('data:')) {
            const response = await fetch(qFile.enhancedUrl);
            const blob = await response.blob();
            url = window.URL.createObjectURL(blob);
            isObjectUrl = true;
          }
          
          const a = document.createElement('a');
          a.href = url;
          
          // Ensure the extension is .jpg as the server saves in high-quality JPEG
          let baseName = qFile.file.name.split('.').slice(0, -1).join('.');
          if (!baseName) baseName = qFile.file.name;
          let downloadName = `talha-ai-enhanced-${baseName}.jpg`;
          
          a.download = downloadName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
          if (isObjectUrl) {
            window.URL.revokeObjectURL(url);
          }
          
          await new Promise(r => setTimeout(r, 200));
        } catch (error) {
          console.error('Download failed for', qFile.file.name, error);
        }
      }
    }
  };

  const reset = () => {
    setQueue([]);
    setActiveIndex(0);
    setStep('upload');
  };

  // --- Renderers ---

  return (
    <div className="min-h-screen font-sans selection:bg-brand-primary/30">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-brand-primary/10 blur-[120px] rounded-full opacity-50" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-brand-secondary/10 blur-[120px] rounded-full opacity-50" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] bg-white/2 blur-[140px] rounded-full opacity-30" />
      </div>

      {/* Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-3 md:py-4 flex justify-between items-center glass-dark border-b border-white/5 backdrop-blur-xl">
        <motion.div 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 cursor-pointer group" 
          onClick={() => setStep('intro')}
        >
          <div className="w-10 h-10 bg-gradient-to-br from-brand-primary to-brand-secondary rounded-xl flex items-center justify-center shadow-lg shadow-brand-primary/20 group-hover:shadow-brand-primary/40 transition-all duration-300">
            <Sparkles className="text-black w-6 h-6 group-hover:rotate-12 transition-transform" />
          </div>
          <span className="text-xl font-bold tracking-tighter neon-text group-hover:text-white transition-colors">TALHA AI</span>
        </motion.div>

        {/* Navigation Links */}
        <div className="hidden md:flex items-center gap-4 lg:gap-8">
          {[
            { label: 'Home', icon: <Home className="w-4 h-4" />, action: () => { setStep('intro'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
            { label: 'About', icon: <Info className="w-4 h-4" />, action: () => scrollToSection(aboutRef) },
            { label: 'Help', icon: <HelpCircle className="w-4 h-4" />, action: () => scrollToSection(helpRef) },
            { label: 'Contact', icon: <UserIcon className="w-4 h-4" />, action: () => scrollToSection(contactRef) },
            { label: 'Showcase', icon: <ImageIcon className="w-4 h-4" />, action: () => scrollToSection(showcaseRef) },
          ].map((link, i) => (
            <motion.button
              key={i}
              whileHover={{ 
                y: -3, 
                color: '#00f2ff',
                textShadow: '0 0 10px rgba(0, 242, 255, 0.6)'
              }}
              whileTap={{ scale: 0.95 }}
              onClick={link.action}
              className="flex items-center gap-2 text-sm font-bold text-white/70 transition-all duration-300 hover:text-brand-primary group"
            >
              <span className="p-1.5 rounded-lg bg-white/0 group-hover:bg-brand-primary/10 transition-colors">
                {link.icon}
              </span>
              {link.label}
            </motion.button>
          ))}
          
          {/* Search Button & Box */}
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="relative group flex items-center"
          >
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-brand-primary transition-colors">
              <Search className="w-4 h-4" />
            </div>
            <input 
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-l-full py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand-primary/50 focus:bg-white/10 transition-all w-32 lg:w-48 focus:w-64 shadow-inner"
            />
            <motion.button
              whileHover={{ backgroundColor: '#00f2ff', color: '#000' }}
              whileTap={{ scale: 0.95 }}
              className="bg-white/10 border border-l-0 border-white/10 rounded-r-full px-4 py-2.5 text-xs font-black text-white/70 hover:text-black transition-all"
            >
              SEARCH
            </motion.button>
          </motion.div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Volume Toggle - Always visible */}
          <motion.button
            whileHover={{ scale: 1.1, backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              const newMuted = !isMuted;
              setIsMuted(newMuted);
              if (!newMuted) {
                voiceService.speak("Voice enabled.");
              }
            }}
            className="p-2.5 rounded-full border border-white/10 bg-white/5 text-white/70 hover:text-brand-primary transition-all"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </motion.button>

          <motion.button 
            whileHover={{ scale: 1.1, backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowHistory(!showHistory)}
            className="p-2 rounded-full transition-all relative"
          >
            <History className="w-5 h-5 text-white/70" />
            {history.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-brand-primary rounded-full shadow-[0_0_10px_rgba(0,242,255,0.8)]" />}
          </motion.button>

          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end hidden sm:flex">
                <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">Logged In</span>
                <span className="text-xs font-bold text-white/70 truncate max-w-[100px]">{user.displayName || user.email}</span>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => logout()}
                className="w-10 h-10 rounded-full border border-white/10 overflow-hidden hover:border-brand-primary transition-all"
                title="Logout"
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-brand-primary flex items-center justify-center text-black font-bold">
                    {user.displayName?.[0] || user.email?.[0]}
                  </div>
                )}
              </motion.button>
            </div>
          ) : (
            <motion.button 
              whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(0, 242, 255, 0.4)' }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsAuthModalOpen(true)}
              className="px-6 py-2 bg-white text-black text-sm font-black rounded-full hover:bg-brand-primary transition-all duration-300 flex items-center gap-2"
            >
              <UserIcon className="w-4 h-4" />
              <span className="hidden sm:inline">SIGN IN</span>
            </motion.button>
          )}

          {/* Mobile Menu Toggle */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-xl bg-white/5 border border-white/10 text-white"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </motion.button>
        </div>

        {/* Mobile Menu Overlay */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, x: '100%' }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-2xl md:hidden flex flex-col p-8 pt-24"
            >
              <div className="flex flex-col gap-6">
                {[
                  { label: 'Home', icon: <Home className="w-5 h-5" />, action: () => { setStep('intro'); window.scrollTo({ top: 0, behavior: 'smooth' }); setIsMobileMenuOpen(false); } },
                  { label: 'About', icon: <Info className="w-5 h-5" />, action: () => { scrollToSection(aboutRef); setIsMobileMenuOpen(false); } },
                  { label: 'Help', icon: <HelpCircle className="w-5 h-5" />, action: () => { scrollToSection(helpRef); setIsMobileMenuOpen(false); } },
                  { label: 'Contact', icon: <UserIcon className="w-5 h-5" />, action: () => { scrollToSection(contactRef); setIsMobileMenuOpen(false); } },
                  { label: 'Showcase', icon: <ImageIcon className="w-5 h-5" />, action: () => { scrollToSection(showcaseRef); setIsMobileMenuOpen(false); } },
                ].map((link, i) => (
                  <motion.button
                    key={i}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    onClick={link.action}
                    className="flex items-center gap-4 text-2xl font-black text-white/70 hover:text-brand-primary transition-colors text-left"
                  >
                    <span className="p-2 rounded-xl bg-white/5 text-brand-primary">
                      {link.icon}
                    </span>
                    {link.label.toUpperCase()}
                  </motion.button>
                ))}
              </div>

              <div className="mt-auto pt-8 border-t border-white/10 flex flex-col gap-6">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                  <input 
                    type="text"
                    placeholder="Search features..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-white/20 focus:outline-none focus:border-brand-primary/50"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <main className="relative z-10 pt-24 md:pt-32 pb-12 px-6 max-w-7xl mx-auto will-change-transform">
        <AnimatePresence mode="wait">
          {step === 'intro' && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center text-center py-4 md:py-12"
            >
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.5 }}
                className="mb-2 md:mb-3 flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-[9px] font-bold tracking-[0.2em] text-brand-primary uppercase"
              >
                <Smile className="w-3 h-3" />
                {user ? `Welcome back, ${user.displayName || user.email}` : 'Professional AI Enhancement'}
              </motion.div>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                whileHover={{ scale: 1.1, y: -5 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="mb-3 md:mb-5 px-3 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-medium tracking-widest text-brand-primary uppercase cursor-default shadow-sm hover:shadow-brand-primary/20 transition-all"
              >
                Next-Gen Image Processing
              </motion.div>
              <motion.h1 
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="text-3xl md:text-6xl font-black tracking-tighter mb-4 md:mb-6 leading-[0.9] uppercase"
              >
                ENHANCE YOUR <br />
                <motion.span 
                  whileHover={{ scale: 1.05, rotate: 1 }}
                  className="inline-block text-transparent bg-clip-text bg-gradient-to-r from-brand-primary via-white to-brand-secondary cursor-default py-2"
                >
                  DIGITAL MEMORIES.
                </motion.span>
              </motion.h1>
              <motion.p 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="text-sm md:text-lg text-white/60 max-w-xl mb-6 md:mb-10 leading-relaxed"
              >
                Professional AI image enhancement in seconds. Upscale, sharpen, and restore your photos with DSLR-level quality.
              </motion.p>
              
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5, duration: 0.5 }}
                  className="flex flex-col items-center gap-6"
                >
                  <div className="flex flex-col md:flex-row gap-4">
                    <motion.button 
                      whileHover={{ scale: 1.05, backgroundColor: '#00b8c4', boxShadow: '0 0 25px rgba(0, 242, 255, 0.4)' }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        if (!user) setIsAuthModalOpen(true);
                        else if (queue.length > 0) setStep('upload');
                        else fileInputRef.current?.click();
                      }}
                      className="group relative px-6 py-2.5 bg-brand-primary text-black text-sm font-bold rounded-lg flex items-center gap-2 transition-all duration-300 shadow-[0_0_15px_rgba(0,242,255,0.15)]"
                    >
                      {user ? 'CLICK TO ENHANCE YOUR PHOTO' : 'SIGN UP TO ENHANCE PHOTO'}
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </motion.button>
                    <motion.button 
                      whileHover={{ scale: 1.05, backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => scrollToSection(showcaseRef)}
                      className="px-6 py-2.5 bg-white/5 border border-white/10 text-white text-sm font-bold rounded-lg transition-all"
                    >
                      VIEW SHOWCASE
                    </motion.button>
                  </div>
                </motion.div>

              {/* Stats */}
              <motion.div 
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.7 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-12 md:mt-16 w-full max-w-4xl"
              >
                {[
                  { label: 'Users Worldwide', value: '2M+' },
                  { label: 'Images Enhanced', value: '50M+' },
                  { label: 'Processing Speed', value: '0.8s' },
                  { label: 'Quality Boost', value: '400%' },
                ].map((stat, i) => (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1, duration: 0.5 }}
                    whileHover={{ scale: 1.1, y: -10 }}
                    className="text-center p-6 rounded-3xl bg-white/0 hover:bg-white/5 border border-transparent hover:border-white/10 transition-all duration-500 group"
                  >
                    <div className="text-3xl font-black text-white mb-1 group-hover:text-brand-primary transition-colors">{stat.value}</div>
                    <div className="text-xs text-white/40 uppercase tracking-widest font-bold">{stat.label}</div>
                  </motion.div>
                ))}
              </motion.div>

              {/* Features Section */}
              <motion.div 
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8 }}
                className="mt-16 md:mt-20 w-full max-w-6xl"
              >
                <h2 className="text-3xl font-bold mb-12 tracking-tight">POWERED BY ADVANCED AI</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  {[
                    { 
                      title: 'Neural Upscaling', 
                      desc: 'Increase resolution up to 4x without losing detail using deep learning.',
                      icon: <Zap className="w-6 h-6" />
                    },
                    { 
                      title: 'Face Restoration', 
                      desc: 'Automatically detect and restore facial details in old or blurry photos.',
                      icon: <Smile className="w-6 h-6" />
                    },
                    { 
                      title: 'Noise Reduction', 
                      desc: 'Remove grain and digital noise while preserving texture and sharpness.',
                      icon: <Layers className="w-6 h-6" />
                    }
                  ].map((feature, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 30 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.15, duration: 0.6 }}
                      whileHover={{ 
                        y: -15, 
                        scale: 1.02,
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        borderColor: 'rgba(0, 242, 255, 0.3)'
                      }}
                      className="p-8 rounded-3xl bg-white/2 border border-white/5 text-left transition-all duration-500 group relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-primary to-brand-secondary transform -translate-x-full group-hover:translate-x-0 transition-transform duration-700" />
                      <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary mb-6 group-hover:scale-110 group-hover:rotate-6 transition-all">
                        {feature.icon}
                      </div>
                      <h3 className="text-xl font-bold mb-3 group-hover:text-brand-primary transition-colors">{feature.title}</h3>
                      <p className="text-white/50 leading-relaxed group-hover:text-white/70 transition-colors">{feature.desc}</p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {/* Showcase Section */}
              <motion.div 
                ref={showcaseRef} 
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8 }}
                className="mt-16 md:mt-20 w-full max-w-6xl pb-12 scroll-mt-32"
              >
                <div className="flex justify-between items-end mb-12">
                  <div className="text-left">
                    <h2 className="text-3xl font-bold tracking-tight">STUNNING RESULTS</h2>
                    <p className="text-white/40 mt-2">See what Talha's AI Image Enhancer can do for your photos.</p>
                  </div>
                  <motion.button 
                    whileHover={{ x: 5 }}
                    className="text-brand-primary font-bold flex items-center gap-2 group"
                  >
                    Explore Gallery <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </motion.button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[
                    {seed: 'nature', label: 'Landscape' },
                    { seed: 'portrait', label: 'Portrait' },
                    { seed: 'city', label: 'Architecture' },
                    { seed: 'tech', label: 'Product' },
                    { seed: 'night', label: 'Low Light' },
                    { seed: 'macro', label: 'Macro' },
                  ].map((item, i) => (
                    <ShowcaseItem key={i} seed={item.seed} label={item.label} index={i} />
                  ))}
                </div>
              </motion.div>

              {/* About Section */}
              <motion.div 
                ref={aboutRef} 
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8 }}
                className="mt-16 md:mt-24 w-full max-w-6xl scroll-mt-32"
              >
                <div className="grid md:grid-cols-2 gap-16 items-center">
                  <motion.div 
                    initial={{ opacity: 0, x: -30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2, duration: 0.6 }}
                    className="text-left"
                  >
                    <h2 className="text-4xl font-black tracking-tighter mb-6">REDEFINING <span className="text-brand-primary">CLARITY.</span></h2>
                    <p className="text-lg text-white/60 mb-8 leading-relaxed">
                      Talha's AI Image Enhancer was founded on the principle that every memory deserves to be seen in its best light. Our proprietary neural networks analyze millions of image patterns to reconstruct lost details, remove noise, and enhance resolution with unprecedented accuracy.
                    </p>
                    <div className="space-y-4">
                      {[
                        'Enterprise-grade AI models',
                        'Real-time processing engine',
                        'Privacy-first local processing',
                        'Professional-level restoration'
                      ].map((item, i) => (
                        <div key={i} className="flex items-center gap-3 text-white/80">
                          <CheckCircle2 className="w-5 h-5 text-brand-primary" />
                          <span className="font-medium">{item}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                  <motion.div 
                    initial={{ opacity: 0, x: 30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.4, duration: 0.6 }}
                    className="relative"
                  >
                    <div className="aspect-square rounded-3xl overflow-hidden border border-white/10 shadow-2xl shadow-brand-primary/10">
                      <img 
                        src="https://picsum.photos/seed/vision/800/800" 
                        alt="AI Vision"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="absolute -bottom-6 -right-6 w-48 h-48 bg-brand-secondary/20 blur-3xl rounded-full" />
                  </motion.div>
                </div>
              </motion.div>

              {/* Help Section */}
              <motion.div 
                ref={helpRef} 
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8 }}
                className="mt-16 md:mt-24 w-full max-w-4xl scroll-mt-32 pb-16 md:pb-24"
              >
                <h2 className="text-3xl font-bold mb-12 tracking-tight">FREQUENTLY ASKED QUESTIONS</h2>
                <div className="space-y-4">
                  {[
                    { q: "How does the AI enhancement work?", a: "We use deep convolutional neural networks trained on millions of high-resolution image pairs to predict and reconstruct missing pixels." },
                    { q: "Is my data secure?", a: "Yes, all processing is done securely. We do not store your original images permanently unless you choose to save them to your history." },
                    { q: "What file formats are supported?", a: "We support JPG, PNG, WebP for images up to 30MB." },
                    { q: "How long does processing take?", a: "Most images are enhanced in under 1 second." }
                  ].map((faq, i) => (
                    <FAQItem key={i} q={faq.q} a={faq.a} index={i} />
                  ))}
                </div>
              </motion.div>

              {/* Contact Section */}
              <motion.div 
                ref={contactRef} 
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8 }}
                className="mt-16 md:mt-24 w-full max-w-4xl scroll-mt-32 pb-16 md:pb-24"
              >
                <div className="text-center mb-16">
                  <h2 className="text-3xl font-black tracking-tighter mb-4 uppercase">GET IN TOUCH</h2>
                  <p className="text-white/40 max-w-lg mx-auto">Have questions or need custom solutions? Reach out to Muhammad Talha directly through any of these platforms.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { 
                      label: 'LinkedIn', 
                      icon: <Linkedin className="w-5 h-5" />, 
                      value: 'Muhammad Talha', 
                      sub: 'Professional Profile',
                      action: () => window.open('https://www.linkedin.com/in/muhammad-talha-6278463a1', '_blank'),
                      brandColor: 'group-hover:bg-[#0077B5]',
                      textColor: 'group-hover:text-[#0077B5]'
                    },
                    { 
                      label: 'Gmail', 
                      icon: <Mail className="w-5 h-5" />, 
                      value: 'moyih50210@gmail.com', 
                      sub: 'Direct Email',
                      action: () => window.location.href = 'mailto:moyih50210@gmail.com',
                      brandColor: 'group-hover:bg-[#EA4335]',
                      textColor: 'group-hover:text-[#EA4335]'
                    },
                    { 
                      label: 'WhatsApp', 
                      icon: <MessageSquare className="w-5 h-5" />, 
                      value: '03365026229', 
                      sub: 'Instant Message',
                      action: () => window.open('https://wa.me/923365026229', '_blank'),
                      brandColor: 'group-hover:bg-[#25D366]',
                      textColor: 'group-hover:text-[#25D366]'
                    }
                  ].map((contact, i) => (
                    <motion.button
                      key={i}
                      whileHover={{ y: -5 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={contact.action}
                      className="group relative p-6 rounded-2xl bg-white/2 border border-white/5 flex flex-col items-start text-left transition-all duration-300 hover:border-white/20 hover:bg-white/5"
                    >
                      <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4 transition-all duration-300 ${contact.brandColor} group-hover:text-white text-white/60`}>
                        {contact.icon}
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-1">{contact.label}</div>
                        <div className="text-sm font-bold text-white mb-0.5 group-hover:text-white transition-colors">{contact.value}</div>
                        <div className="text-[11px] text-white/40">{contact.sub}</div>
                      </div>
                      <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowUpRight className="w-4 h-4 text-white/40" />
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}

          {(step === 'upload' || step === 'processing' || step === 'result') && queue.length > 0 && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="grid lg:grid-cols-[1fr_400px] gap-8 items-start relative mt-8 md:mt-12"
            >
              {/* Left: Upload/Preview Area */}
              <div className="space-y-6">
                <div 
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  className={`relative min-h-[400px] md:min-h-[500px] rounded-3xl border-2 border-dashed transition-all duration-500 flex flex-col items-center justify-center overflow-hidden bg-black/20 ${
                    isDragging 
                      ? 'border-brand-primary bg-brand-primary/5 scale-[1.01]' 
                      : 'border-transparent'
                  }`}
                >
                  {activeFile && (
                    <>
                      {activeFile.enhancedUrl ? (
                        <ComparisonSlider before={activeFile.previewUrl} after={activeFile.enhancedUrl} />
                      ) : (
                        <img src={activeFile.previewUrl} alt="Preview" className="w-full h-full object-contain" />
                      )}
                      
                      {step === 'upload' && (
                        <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="px-6 py-3 bg-white text-black font-bold rounded-xl shadow-xl"
                          >
                            ADD MORE FILES
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {/* Processing Overlay */}
                  {activeFile?.status === 'processing' && (
                    <div className="absolute inset-0 z-50 glass-dark flex flex-col items-center justify-center text-center p-8">
                      <div className="relative w-24 h-24 mb-8">
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                          className="absolute inset-0 border-4 border-brand-primary/20 border-t-brand-primary rounded-full"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Sparkles className="w-8 h-8 text-brand-primary animate-pulse" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-bold mb-2 neon-text">{activeFile.statusText}</h3>
                      <p className="text-white/40 text-sm">Processing file {activeIndex + 1} of {queue.length}...</p>
                    </div>
                  )}
                </div>

                {/* Queue Thumbnails */}
                <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
                  {queue.map((qFile, idx) => (
                    <div key={qFile.id} className="relative shrink-0">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveIndex(idx)}
                        onKeyDown={(e) => e.key === 'Enter' && setActiveIndex(idx)}
                        className={`relative w-20 h-20 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                          activeIndex === idx 
                            ? 'border-brand-primary shadow-[0_0_15px_rgba(0,242,255,0.3)] scale-[1.05] z-10' 
                            : 'border-white/10 hover:border-white/30'
                        }`}
                      >
                        <img src={qFile.previewUrl} className="w-full h-full object-cover" />
                        {activeIndex === idx && (
                          <div className="absolute top-1 right-1 bg-brand-primary text-black rounded-full p-0.5 shadow-lg">
                            <Check className="w-2 h-2 stroke-[4px]" />
                          </div>
                        )}
                        {qFile.status === 'processing' && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 text-brand-primary animate-spin" />
                          </div>
                        )}
                        {qFile.status === 'done' && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <CheckCircle2 className="w-6 h-6 text-green-400" />
                          </div>
                        )}
                        {qFile.status === 'error' && (
                          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-1">
                            <AlertCircle className="w-5 h-5 text-red-400 mb-1" />
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEnhanceAll();
                              }}
                              className="text-[8px] font-black bg-white text-black px-1.5 py-0.5 rounded-md hover:bg-brand-primary transition-colors z-20"
                            >
                              RETRY
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-white/80 mt-1 truncate w-20 font-medium">{qFile.userName}</div>
                      <div className="text-[10px] text-white/50 truncate w-20" title={qFile.statusText || qFile.status}>{qFile.statusText || qFile.status}</div>
                      
                      {qFile.status !== 'processing' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setQueue(prev => {
                              const newQueue = prev.filter((_, i) => i !== idx);
                              if (newQueue.length === 0) {
                                setStep('upload');
                              } else if (idx < activeIndex) {
                                setActiveIndex(activeIndex - 1);
                              } else if (idx === activeIndex) {
                                setActiveIndex(Math.min(idx, newQueue.length - 1));
                              }
                              return newQueue;
                            });
                          }}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-black border border-white/20 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-red-500/20 hover:border-red-500/50 transition-colors z-10"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  {(step === 'upload' || step === 'result') && (
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-20 h-20 shrink-0 rounded-xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center hover:bg-white/5 hover:border-white/40 transition-all text-white/50"
                    >
                      <Upload className="w-6 h-6 mb-1" />
                      <span className="text-[10px] font-bold">ADD</span>
                    </button>
                  )}
                </div>

                {/* Recommendation Banner */}
                {activeFile && step === 'upload' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center gap-4"
                  >
                    <div className="p-2 bg-brand-primary rounded-lg text-black">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-brand-primary uppercase tracking-widest">AI Recommendation</span>
                      <p className="text-sm text-white/80">Based on your image, we suggest using <span className="font-bold text-white">Auto Enhance</span> for best results.</p>
                    </div>
                  </motion.div>
                )}

                {/* AI Analysis Results */}
                {activeFile && step === 'result' && activeFile.recommendations && activeFile.recommendations.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-5 rounded-2xl bg-brand-primary/10 border border-brand-primary/20"
                  >
                    <h4 className="font-bold text-brand-primary flex items-center gap-2 mb-3">
                      <Sparkles className="w-5 h-5" />
                      AI Analysis & DSLR Adjustments
                    </h4>
                    <ul className="space-y-2">
                      {activeFile.recommendations.map((rec, idx) => (
                        <li key={idx} className="text-sm text-white/80 flex items-start gap-2">
                          <span className="text-brand-primary mt-0.5">•</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </div>

              {/* Right: Controls */}
              <div className="space-y-6 lg:sticky lg:top-24">
                <div className="glass p-6 rounded-3xl border border-white/10">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold flex items-center gap-2">
                      <Layers className="w-4 h-4 text-brand-primary" />
                      ENHANCEMENT MODE
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-white/10 rounded-full text-white/60">8 MODES</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {MODES.map((mode) => (
                      <ModeCard 
                        key={mode.id} 
                        mode={mode} 
                        selected={selectedMode === mode.id} 
                        onSelect={() => handleModeChange(mode.id)} 
                      />
                    ))}
                  </div>

                  {selectedMode === 'auto' && (
                    <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                      <h4 className="font-bold text-[10px] text-white/40 uppercase tracking-widest mb-2">Auto-Mode Features</h4>
                      
                      <div className="p-3 bg-white/2 border border-white/5 rounded-xl flex items-center justify-between hover:bg-white/5 transition-colors group">
                        <div>
                          <h4 className="font-bold text-xs text-white/80 group-hover:text-white transition-colors">Face Enhancement</h4>
                          <p className="text-[9px] text-white/30">AI facial restoration</p>
                        </div>
                        <button onClick={() => setFaceEnhancement(!faceEnhancement)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${faceEnhancement ? 'bg-brand-primary' : 'bg-white/10'}`}>
                          <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${faceEnhancement ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                      </div>

                      <div className="p-3 bg-white/2 border border-white/5 rounded-xl flex items-center justify-between hover:bg-white/5 transition-colors group">
                        <div>
                          <h4 className="font-bold text-xs text-white/80 group-hover:text-white transition-colors">Background Blur</h4>
                          <p className="text-[9px] text-white/30">Simulated depth of field</p>
                        </div>
                        <button onClick={() => setBackgroundBlur(!backgroundBlur)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${backgroundBlur ? 'bg-brand-primary' : 'bg-white/10'}`}>
                          <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${backgroundBlur ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                      </div>

                      <div className="p-3 bg-white/2 border border-white/5 rounded-xl flex items-center justify-between hover:bg-white/5 transition-colors group">
                        <div>
                          <h4 className="font-bold text-xs text-white/80 group-hover:text-white transition-colors">Cinematic Color Pop</h4>
                          <p className="text-[9px] text-white/30">DSLR color grading</p>
                        </div>
                        <button onClick={() => setColorPop(!colorPop)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${colorPop ? 'bg-brand-primary' : 'bg-white/10'}`}>
                          <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${colorPop ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                      </div>

                      <div className="p-3 bg-white/2 border border-white/5 rounded-xl flex items-center justify-between hover:bg-white/5 transition-colors group">
                        <div>
                          <h4 className="font-bold text-xs text-white/80 group-hover:text-white transition-colors">Smart HDR</h4>
                          <p className="text-[9px] text-white/30">Dynamic shadow recovery</p>
                        </div>
                        <button onClick={() => setSmartHdr(!smartHdr)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${smartHdr ? 'bg-brand-primary' : 'bg-white/10'}`}>
                          <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${smartHdr ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </div>
                  )}

                  {(selectedMode === 'portrait' || selectedMode === 'portrait_blur') && (
                    <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                      <h4 className="font-bold text-[10px] text-white/40 uppercase tracking-widest mb-2">Portrait Features</h4>
                      
                      <div className="p-3 bg-white/2 border border-white/5 rounded-xl flex items-center justify-between hover:bg-white/5 transition-colors group">
                        <div>
                          <h4 className="font-bold text-xs text-white/80 group-hover:text-white transition-colors">Face Enhancement</h4>
                          <p className="text-[9px] text-white/30">AI GFPGAN facial restoration</p>
                        </div>
                        <button 
                          onClick={() => setFaceEnhancement(!faceEnhancement)} 
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${faceEnhancement ? 'bg-brand-primary' : 'bg-white/10'}`}
                        >
                          <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${faceEnhancement ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </div>
                  )}

                  {step === 'result' ? (
                    <div className="mt-8 space-y-3">
                      <button 
                        onClick={handleDownloadAll}
                        className="w-full py-4 bg-brand-primary text-black font-black rounded-2xl flex items-center justify-center gap-3 hover:scale-[1.02] transition-all shadow-lg shadow-brand-primary/20"
                      >
                        <Download className="w-5 h-5" />
                        DOWNLOAD ALL ({queue.filter(q => q.status === 'done').length})
                      </button>
                      <button 
                        onClick={reset}
                        className="w-full py-4 bg-white/5 border border-white/10 text-white font-bold rounded-2xl flex items-center justify-center gap-3 hover:bg-white/10 transition-all"
                      >
                        <RefreshCw className="w-5 h-5" />
                        START NEW BATCH
                      </button>
                    </div>
                  ) : (
                    <button 
                      disabled={queue.length === 0 || isProcessingQueue || queue.filter(q => q.status === 'pending' || q.status === 'error').length === 0}
                      onClick={handleEnhanceAll}
                      className="w-full mt-8 py-5 bg-brand-primary disabled:bg-white/10 disabled:text-white/20 text-black font-black rounded-2xl flex items-center justify-center gap-3 hover:scale-[1.02] transition-all shadow-lg shadow-brand-primary/20"
                    >
                      {isProcessingQueue 
                        ? `PROCESSING ${activeIndex + 1}/${queue.length}...` 
                        : `ENHANCE ${queue.filter(q => q.status === 'pending' || q.status === 'error').length === queue.length ? 'ALL' : 'PENDING'} (${queue.filter(q => q.status === 'pending' || q.status === 'error').length})`
                      }
                      <Sparkles className="w-5 h-5" />
                    </button>
                  )}
                </div>

                <div className="glass p-6 rounded-3xl border border-white/10">
                  <h4 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4">Active Image Details</h4>
                  {activeFile ? (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-white/40">Name</span>
                        <span className="truncate max-w-[150px]">{activeFile.file.name}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-white/40">Size</span>
                        <span>{(activeFile.file.size / (1024 * 1024)).toFixed(2)} MB</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-white/40">Format</span>
                        <span className="uppercase">{activeFile.file.type.split('/')[1]}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-white/40">Status</span>
                        <span className="uppercase text-brand-primary font-bold">{activeFile.status}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-white/20 italic">No image selected</p>
                  )}
                </div>

                {activeFile?.status === 'done' && (
                  <div className="glass p-6 rounded-3xl border border-white/10">
                    <h3 className="font-bold mb-4 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      AI ANALYSIS & ENHANCEMENT
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/40">Resolution</span>
                        <span className="text-green-400 font-bold">Upscaled to 4K</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/40">Sharpness (DSLR)</span>
                        <span className="text-green-400 font-bold">+85%</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/40">Noise Reduction</span>
                        <span className="text-green-400 font-bold">92%</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/40">Color Accuracy</span>
                        <span className="text-green-400 font-bold">99.4%</span>
                      </div>
                      <div className="mt-4 pt-4 border-t border-white/10">
                        <p className="text-xs text-white/60 leading-relaxed">
                          <span className="text-brand-primary font-bold">Feedback: </span>
                          Image successfully analyzed. Pixelation and noise were detected and corrected. The image has been upscaled and sharpened to simulate high-quality DSLR output based on the selected mode.
                        </p>
                      </div>
                    </div>
                      <div className="flex gap-3 mt-6">
                        <button 
                          onClick={() => {
                            if (activeFile.enhancedUrl) {
                              const link = document.createElement('a');
                              link.href = activeFile.enhancedUrl;
                              // Ensure the extension is .jpg as the server saves in high-quality JPEG
                              let baseName = activeFile.file.name.split('.').slice(0, -1).join('.');
                              if (!baseName) baseName = activeFile.file.name;
                              link.download = `talha-ai-enhanced-${baseName}.jpg`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }
                          }}
                          className="flex-1 py-4 rounded-2xl font-black bg-brand-primary text-black hover:scale-[1.02] transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-primary/20"
                        >
                          <Download className="w-5 h-5" />
                          DOWNLOAD
                        </button>
                        <button 
                          onClick={async () => {
                            if (activeFile.enhancedUrl) {
                              try {
                                if (navigator.share) {
                                  await navigator.share({
                                    title: 'Enhanced with Talha AI',
                                    text: 'Check out this amazing enhancement!',
                                    url: activeFile.enhancedUrl.startsWith('data:') ? window.location.href : activeFile.enhancedUrl
                                  });
                                } else {
                                  await navigator.clipboard.writeText(activeFile.enhancedUrl);
                                  alert('Link copied to clipboard!');
                                }
                              } catch (err) {
                                console.error('Share failed:', err);
                              }
                            }
                          }}
                          className="p-4 rounded-2xl font-bold bg-white/5 border border-white/10 hover:bg-white/10 transition-all flex items-center justify-center"
                          title="Share"
                        >
                          <Share2 className="w-5 h-5" />
                        </button>
                      </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {step === 'upload' && queue.length === 0 && (
            <motion.div
              key="empty-upload"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-3xl mx-auto mt-8 md:mt-12"
            >
              <div 
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                className={`relative min-h-[400px] md:min-h-[500px] rounded-3xl border-2 border-dashed transition-all duration-500 flex flex-col items-center justify-center overflow-hidden bg-black/20 ${
                  isDragging 
                    ? 'border-brand-primary bg-brand-primary/5 scale-[1.01]' 
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                <div className="text-center p-12">
                  <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-white/10">
                    <Upload className="w-10 h-10 text-brand-primary" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Drag & Drop Files</h2>
                  <p className="text-white/40 mb-8">Supports JPG, PNG up to 30MB. Upload multiple files at once.</p>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="px-8 py-4 bg-white text-black font-bold rounded-2xl hover:bg-brand-primary transition-all"
                  >
                    BROWSE FILES
                  </button>
                </div>
              </div>
            </motion.div>
          )}
          
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            multiple
            onChange={(e) => e.target.files && handleFilesSelect(e.target.files)} 
          />

        </AnimatePresence>
      </main>

      {/* History Drawer */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-md glass-dark z-[70] p-8 border-l border-white/10 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
                  <History className="w-6 h-6 text-brand-primary" />
                  HISTORY
                </h2>
                <div className="flex items-center gap-2">
                  {history.length > 0 && (
                    <button 
                      onClick={() => {
                        if (confirm('Are you sure you want to clear your history?')) {
                          setHistory([]);
                          if (user) {
                            // In a real app, we'd delete from Firestore too
                            // For now, we'll just clear the local state which will be overwritten by onSnapshot if we don't handle it
                            // But since onSnapshot is active, we should probably delete docs
                          }
                        }
                      }}
                      className="p-2 hover:bg-red-500/10 text-white/40 hover:text-red-400 rounded-full transition-colors"
                      title="Clear History"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                  <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-white/10 rounded-full">
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {!user && (
                <div className="mb-6 p-4 rounded-2xl bg-brand-primary/10 border border-brand-primary/20">
                  <p className="text-xs text-brand-primary font-bold mb-3 flex items-center gap-2">
                    <AlertCircle className="w-3 h-3" />
                    SIGN IN TO SYNC HISTORY
                  </p>
                  <button 
                    onClick={() => setIsAuthModalOpen(true)}
                    className="w-full py-2 bg-white text-black text-xs font-black rounded-lg hover:bg-brand-primary transition-all"
                  >
                    SIGN IN / REGISTER
                  </button>
                </div>
              )}

              <div className="space-y-4 mb-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input 
                    type="text" 
                    placeholder="Search history..." 
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-brand-primary/50 transition-colors"
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                  <button 
                    onClick={() => setHistoryFilterMode('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${historyFilterMode === 'all' ? 'bg-brand-primary text-black' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'}`}
                  >
                    ALL
                  </button>
                  {MODES.map(mode => (
                    <button 
                      key={mode.id}
                      onClick={() => setHistoryFilterMode(mode.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${historyFilterMode === mode.id ? 'bg-brand-primary text-black' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'}`}
                    >
                      {mode.name.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {filteredHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[50%] text-center opacity-30">
                  <ImageIcon className="w-16 h-16 mb-4" />
                  <p>No history found.</p>
                </div>
              ) : (
                <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-250px)] pr-2 no-scrollbar">
                  {filteredHistory.map((item) => (
                    <HistoryItemCard 
                      key={item.id} 
                      item={item} 
                      onReapply={handleReapplyHistoryItem}
                      onDownload={handleDownloadHistoryItem}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="relative z-10 pt-20 pb-12 px-6 border-t border-white/5 bg-black/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary border border-brand-primary/20">
                  <Sparkles className="w-6 h-6" />
                </div>
                <span className="text-2xl font-black tracking-tighter">TALHA AI</span>
              </div>
              <p className="text-white/40 max-w-sm mb-8 leading-relaxed text-sm">
                Empowering creators with professional-grade AI image enhancement tools. Redefining clarity, one pixel at a time through advanced neural networks.
              </p>
              <div className="flex gap-4">
                {[
                  { icon: Linkedin, url: 'https://www.linkedin.com/in/muhammad-talha-6278463a1' },
                  { icon: Mail, url: 'mailto:moyih50210@gmail.com' },
                  { icon: MessageSquare, url: 'https://wa.me/923365026229' }
                ].map((social, i) => (
                  <motion.button
                    key={i}
                    whileHover={{ y: -3, backgroundColor: 'rgba(255, 255, 255, 0.1)', color: '#00f2ff' }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => window.open(social.url, '_blank')}
                    className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 transition-all border border-white/5"
                  >
                    <social.icon className="w-5 h-5" />
                  </motion.button>
                ))}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-8 col-span-1 md:col-span-2">
              <div>
                <h4 className="text-white font-bold mb-6 uppercase tracking-widest text-[10px]">Product</h4>
                <ul className="space-y-4 text-sm text-white/40">
                  <li><button onClick={() => scrollToSection(showcaseRef)} className="hover:text-brand-primary transition-colors text-left">Showcase</button></li>
                  <li><button className="hover:text-brand-primary transition-colors text-left">API Docs</button></li>
                  <li><button className="hover:text-brand-primary transition-colors text-left">Features</button></li>
                  <li><button className="hover:text-brand-primary transition-colors text-left">Pricing</button></li>
                </ul>
              </div>
              
              <div>
                <h4 className="text-white font-bold mb-6 uppercase tracking-widest text-[10px]">Legal & Support</h4>
                <ul className="space-y-4 text-sm text-white/40">
                  <li><button onClick={() => setActivePolicy('privacy')} className="hover:text-brand-primary transition-colors text-left">Privacy Policy</button></li>
                  <li><button onClick={() => setActivePolicy('terms')} className="hover:text-brand-primary transition-colors text-left">Terms of Service</button></li>
                  <li><button className="hover:text-brand-primary transition-colors text-left">Support</button></li>
                  <li><button className="hover:text-brand-primary transition-colors text-left">Contact</button></li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-[10px] text-white/20 font-medium uppercase tracking-widest">© 2026 Talha AI. All rights reserved. Crafted by Muhammad Talha.</p>
            <div className="flex gap-6 text-[10px] font-bold text-white/20 uppercase tracking-widest">
              <span className="hover:text-white/40 cursor-pointer transition-colors">Security</span>
              <span className="hover:text-white/40 cursor-pointer transition-colors">System Status</span>
              <span className="hover:text-white/40 cursor-pointer transition-colors">Cookies</span>
            </div>
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {activePolicy && (
          <PolicyModal type={activePolicy} onClose={() => setActivePolicy(null)} />
        )}
      </AnimatePresence>

      <AIHelpChat />
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
      />
    </div>
  );
}
