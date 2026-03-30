import React from 'react';
import { motion } from 'motion/react';

interface ShowcaseItemProps {
  seed: string;
  label: string;
  index: number;
}

export const ShowcaseItem = React.memo(({ seed, label, index }: ShowcaseItemProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ 
      delay: index * 0.1, 
      duration: 0.5,
      ease: "easeOut"
    }}
    whileHover={{ 
      scale: 1.03,
      boxShadow: "0 0 40px rgba(0, 242, 255, 0.2)",
      borderColor: "rgba(0, 242, 255, 0.4)",
      transition: { type: "spring", stiffness: 400, damping: 17 }
    }}
    className="relative aspect-[4/3] rounded-3xl overflow-hidden group cursor-pointer bg-white/5 border border-white/5 transition-colors duration-300"
  >
    <img 
      src={`https://picsum.photos/seed/${seed}/800/600`} 
      alt={label}
      loading="lazy"
      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
      referrerPolicy="no-referrer"
    />
    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-8 text-left">
      <div className="text-brand-primary font-bold text-xs tracking-widest uppercase mb-1">Enhanced</div>
      <div className="text-xl font-bold text-white">{label}</div>
    </div>
    <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-[10px] font-bold text-white/70 uppercase tracking-widest">
      Before / After
    </div>
  </motion.div>
));
