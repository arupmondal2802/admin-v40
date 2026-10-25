import React from 'react';
import { AppNotification } from '../../types';
import Button from '../ui/Button';

interface Props {
  notifications: AppNotification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClose: () => void;
  onViewAll?: () => void;
}

const timeSince = (date: Date): string => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return `${Math.floor(interval)}y ago`;
    interval = seconds / 2592000;
    if (interval > 1) return `${Math.floor(interval)}mo ago`;
    interval = seconds / 86400;
    if (interval > 1) return `${Math.floor(interval)}d ago`;
    interval = seconds / 3600;
    if (interval > 1) return `${Math.floor(interval)}h ago`;
    interval = seconds / 60;
    if (interval > 1) return `${Math.floor(interval)}m ago`;
    return `${Math.floor(seconds)}s ago`;
}


const NotificationHistory: React.FC<Props> = ({ notifications, onMarkAsRead, onMarkAllAsRead, onClose, onViewAll }) => {
  return (
    <>
        <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden="true"></div>
        <div className="absolute top-12 right-0 w-80 max-w-[calc(100vw-100px)] sm:max-w-sm bg-white rounded-lg shadow-xl border border-slate-200 z-40">
            <div className="flex justify-between items-center p-3 border-b border-slate-200 bg-slate-50 rounded-t-lg">
                <h3 className="font-semibold text-slate-700">Notifications</h3>
                <Button variant="ghost" size="sm" onClick={onMarkAllAsRead}>Mark all as read</Button>
            </div>
            <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {notifications.length > 0 ? (
                    notifications.map(notification => (
                        <li key={notification.id}>
                            <button 
                                className="w-full text-left p-3 hover:bg-slate-50 focus:outline-none focus:bg-slate-50 transition-colors"
                                onClick={() => onMarkAsRead(notification.id)}
                            >
                                <div className="flex items-start space-x-3">
                                    {!notification.isRead && <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></div>}
                                    <div className={`flex-grow ${notification.isRead ? 'pl-5' : ''}`}>
                                        <p className={`text-sm ${notification.isRead ? 'text-slate-500' : 'text-slate-800 font-medium'}`}>
                                            {notification.message}
                                        </p>
                                        <p className="text-xs text-slate-400 mt-1">{timeSince(new Date(notification.timestamp))}</p>
                                    </div>
                                </div>
                            </button>
                        </li>
                    ))
                ) : (
                    <li className="p-6 text-center text-sm text-slate-500">
                        You have no notifications.
                    </li>
                )}
            </ul>
            {onViewAll && (
                <div className="p-2.5 border-t border-slate-100 bg-slate-50 text-center rounded-b-lg">
                    <button 
                        onClick={onViewAll} 
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                    >
                        Manage Service Reminders &rarr;
                    </button>
                </div>
            )}
        </div>
    </>
  );
};

export default NotificationHistory;
