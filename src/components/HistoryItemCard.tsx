import React from 'react';
import { Download } from 'lucide-react';

interface HistoryItem {
  id: string;
  name: string;
  original: string;
  enhanced: string;
  mode: string;
  timestamp: number;
  type: 'image';
}

interface HistoryItemCardProps {
  item: HistoryItem;
  onReapply: (item: HistoryItem) => void;
  onDownload: (item: HistoryItem) => void;
}

export const HistoryItemCard = React.memo(({ item, onReapply, onDownload }: HistoryItemCardProps) => (
  <div className="group relative aspect-video rounded-2xl overflow-hidden border border-white/10 hover:border-brand-primary/50 transition-all bg-black/40">
    <img 
      src={item.enhanced} 
      alt="History" 
      loading="lazy"
      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" 
    />
    
    {/* Top Actions */}
    <div className="absolute top-0 left-0 right-0 p-3 flex justify-between items-start opacity-0 group-hover:opacity-100 transition-all translate-y-[-10px] group-hover:translate-y-0 bg-gradient-to-b from-black/80 to-transparent">
      <button 
        onClick={() => onReapply(item)}
        className="px-3 py-1.5 bg-brand-primary text-black text-[10px] font-black rounded-lg hover:bg-white transition-colors uppercase tracking-widest"
      >
        RE-APPLY
      </button>
      <div className="flex gap-2">
        <button 
          onClick={() => onDownload(item)}
          className="p-2 bg-black/50 backdrop-blur-md border border-white/20 rounded-lg text-white hover:bg-brand-primary hover:text-black transition-all"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
    </div>

    {/* Bottom Info */}
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 translate-y-[10px] group-hover:translate-y-0 transition-all">
      <div className="flex justify-between items-end">
        <div className="flex-1 min-w-0">
          <span className="text-white font-bold text-sm block truncate mb-0.5">{item.name}</span>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-brand-primary px-1.5 py-0.5 rounded bg-brand-primary/10 border border-brand-primary/20">
              {item.mode.replace('_', ' ')}
            </span>
            <span className="text-[9px] text-white/40 font-medium">
              {new Date(item.timestamp).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
));
