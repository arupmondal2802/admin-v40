import React, { useState, useEffect, memo } from 'react';
import { IconClock } from './Icon';

const RealTimeClock: React.FC = () => {
    const [time, setTime] = useState(() => new Date());

    useEffect(() => {
        let timerId: any = null;

        const startTimer = () => {
            if (timerId) clearInterval(timerId);
            setTime(new Date());
            timerId = setInterval(() => {
                if (typeof document !== 'undefined' && document.hidden) return;
                setTime(new Date());
            }, 1000);
        };

        const handleVisibilityChange = () => {
            if (typeof document !== 'undefined' && !document.hidden) {
                startTimer();
            }
        };

        startTimer();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (timerId) clearInterval(timerId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const timeZone = 'Asia/Kolkata';

    const formattedDate = time.toLocaleDateString('en-IN', {
        timeZone,
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });

    const formattedTime = time.toLocaleTimeString('en-IN', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });

    return (
        <div className="flex items-center gap-2.5 bg-slate-800/90 border border-slate-700/70 text-slate-100 px-3 py-1.5 rounded-xl shadow-xs hover:border-slate-600 transition-colors">
            <div className="relative flex items-center justify-center">
                <IconClock className="w-4 h-4 text-brand-accent flex-shrink-0" />
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
            </div>

            <div className="flex flex-col text-right leading-tight">
                <span className="text-xs font-mono font-bold tracking-tight text-white whitespace-nowrap">
                    {formattedTime}
                </span>
                <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap flex items-center justify-end gap-1">
                    <span>{formattedDate}</span>
                    <span className="bg-slate-700/80 text-brand-accent px-1 py-0.2 rounded text-[9px] font-bold">IST</span>
                </span>
            </div>
        </div>
    );
};

export default memo(RealTimeClock);
