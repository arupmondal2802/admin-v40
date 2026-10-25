import React from 'react';
import { IconBell } from './Icon';

interface Props {
  unreadCount: number;
  onClick: () => void;
}

const NotificationBell: React.FC<Props> = ({ unreadCount, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="relative p-2.5 bg-slate-800/90 border border-slate-700/70 text-slate-200 hover:text-white hover:bg-slate-700/80 hover:border-slate-600 rounded-xl transition-all shadow-xs flex items-center justify-center group"
      aria-label={`View notifications. ${unreadCount} unread.`}
    >
      <IconBell className="w-5 h-5 transition-transform group-hover:scale-110" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-black rounded-full bg-rose-500 text-white shadow-xs border-2 border-slate-900">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};

export default NotificationBell;
