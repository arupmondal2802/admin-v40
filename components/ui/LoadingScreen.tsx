import React, { useEffect, useState } from 'react';

const MESSAGES = [
  'Loading application data...',
  'Connecting to cloud...',
  'Fetching latest records...',
  'Almost ready...',
];

const LoadingScreen: React.FC = () => {
  const [msgIndex, setMsgIndex] = useState(0);
  const [dots, setDots] = useState('');

  useEffect(() => {
    const msgTimer = setInterval(() => {
      setMsgIndex(prev => Math.min(prev + 1, MESSAGES.length - 1));
    }, 1800);
    return () => clearInterval(msgTimer);
  }, []);

  useEffect(() => {
    const dotTimer = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
    }, 400);
    return () => clearInterval(dotTimer);
  }, []);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-brand-blue to-slate-900 flex flex-col items-center justify-center z-[100]">
      {/* Logo + brand */}
      <div className="flex items-center space-x-4 mb-10 animate-pulse">
        <div className="bg-white rounded-2xl p-3 shadow-2xl shadow-black/30">
          <img
            src="https://pub-d1d6c35dc7024f819f155246a42ea32b.r2.dev/Website%20Assets/logo/bigengine%203.png"
            alt="A Big Engine Logo"
            className="w-14 h-14 object-contain"
          />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight uppercase">
          <span className="text-white">A Big </span>
          <span className="text-brand-accent">Engine</span>
        </h1>
      </div>

      {/* Animated bar */}
      <div className="w-56 h-1 bg-white/10 rounded-full overflow-hidden mb-6">
        <div className="h-full bg-brand-accent rounded-full animate-[loading-bar_2s_ease-in-out_infinite]" />
      </div>

      {/* Status message */}
      <p className="text-white/60 text-sm font-medium tracking-wide transition-all duration-500">
        {MESSAGES[msgIndex]}<span className="opacity-70 w-4 inline-block text-left">{dots}</span>
      </p>

      <style>{`
        @keyframes loading-bar {
          0%   { width: 0%;   margin-left: 0; }
          50%  { width: 70%;  margin-left: 15%; }
          100% { width: 0%;   margin-left: 100%; }
        }
      `}</style>
    </div>
  );
};

export default LoadingScreen;
