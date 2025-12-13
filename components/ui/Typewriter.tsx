import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface TypewriterProps {
  text: string;
  speed?: number;
  className?: string;
}

export const Typewriter: React.FC<TypewriterProps> = ({ text, speed = 15, className }) => {
  const [displayedText, setDisplayedText] = useState('');
  const indexRef = useRef(0); // Utilisation d'une Ref pour garantir la stabilité de l'index

  useEffect(() => {
    // Reset complet au changement de texte
    indexRef.current = 0;
    setDisplayedText('');

    const timer = setInterval(() => {
      if (indexRef.current < text.length) {
        const char = text.charAt(indexRef.current);
        setDisplayedText((prev) => prev + char);
        indexRef.current++;
      } else {
        clearInterval(timer);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed]);

  return (
    <div className={className}>
      {displayedText}
      {/* Curseur en BLEU maintenant */}
      <motion.span
        animate={{ opacity: [0, 1, 0] }}
        transition={{ repeat: Infinity, duration: 0.8 }}
        className="inline-block w-2 h-4 bg-blue-500 ml-1 align-middle"
      />
    </div>
  );
};