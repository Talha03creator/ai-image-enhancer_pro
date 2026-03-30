import React from 'react';
import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';

interface FAQItemProps {
  q: string;
  a: string;
  index: number;
}

export const FAQItem = React.memo(({ q, a, index }: FAQItemProps) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    whileInView={{ opacity: 1, x: 0 }}
    viewport={{ once: true }}
    transition={{ delay: index * 0.1, duration: 0.5 }}
    whileHover={{ scale: 1.01, backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
    className="p-6 rounded-2xl bg-white/2 border border-white/5 text-left transition-all cursor-pointer group"
  >
    <h3 className="text-lg font-bold mb-2 group-hover:text-brand-primary transition-colors flex justify-between items-center">
      {q}
      <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all" />
    </h3>
    <p className="text-white/40 text-sm leading-relaxed">{a}</p>
  </motion.div>
));
