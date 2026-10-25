import React from 'react';
import { ServiceStatus } from '../../types';
import { IconCheck } from './Icon';

interface StatusPillProps {
  status: ServiceStatus | string;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
  showPulse?: boolean;
}

export const StatusPill: React.FC<StatusPillProps> = ({
  status,
  className = '',
  size = 'sm',
  showPulse = true,
}) => {
  const sizeClasses = {
    xs: 'px-2 py-0.5 text-[11px] gap-1',
    sm: 'px-2.5 py-1 text-xs gap-1.5',
    md: 'px-3 py-1.5 text-sm gap-2',
  }[size];

  switch (status) {
    case ServiceStatus.Queued:
      return (
        <span
          id={`status-pill-${ServiceStatus.Queued.toLowerCase()}`}
          className={`inline-flex items-center font-bold rounded-full border shadow-2xs whitespace-nowrap bg-amber-50 text-amber-800 border-amber-300/90 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-700/80 ${sizeClasses} ${className}`}
        >
          <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0 ring-2 ring-amber-200 dark:ring-amber-900" />
          <span>Queued</span>
        </span>
      );

    case ServiceStatus.InProgress:
      return (
        <span
          id={`status-pill-inprogress`}
          className={`inline-flex items-center font-bold rounded-full border shadow-2xs whitespace-nowrap bg-blue-50 text-blue-800 border-blue-300/90 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-700/80 ${sizeClasses} ${className}`}
        >
          {showPulse ? (
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600 dark:bg-blue-400" />
            </span>
          ) : (
            <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 flex-shrink-0 ring-2 ring-blue-200 dark:ring-blue-900" />
          )}
          <span>In Progress</span>
        </span>
      );

    case ServiceStatus.Completed:
      return (
        <span
          id={`status-pill-${ServiceStatus.Completed.toLowerCase()}`}
          className={`inline-flex items-center font-bold rounded-full border shadow-2xs whitespace-nowrap bg-emerald-50 text-emerald-800 border-emerald-300/90 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-700/80 ${sizeClasses} ${className}`}
        >
          <IconCheck className="w-3 h-3 text-emerald-700 dark:text-emerald-300 flex-shrink-0 stroke-[3]" />
          <span>Completed</span>
        </span>
      );

    case ServiceStatus.Assigned:
      return (
        <span
          id={`status-pill-${ServiceStatus.Assigned.toLowerCase()}`}
          className={`inline-flex items-center font-bold rounded-full border shadow-2xs whitespace-nowrap bg-sky-50 text-sky-800 border-sky-300/90 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-700/80 ${sizeClasses} ${className}`}
        >
          <span className="w-2 h-2 rounded-full bg-sky-500 flex-shrink-0 ring-2 ring-sky-200 dark:ring-sky-900" />
          <span>Assigned</span>
        </span>
      );

    case ServiceStatus.Draft:
      return (
        <span
          id={`status-pill-${ServiceStatus.Draft.toLowerCase()}`}
          className={`inline-flex items-center font-bold rounded-full border shadow-2xs whitespace-nowrap bg-slate-100 text-slate-700 border-slate-300/90 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 ${sizeClasses} ${className}`}
        >
          <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
          <span>Draft</span>
        </span>
      );

    case ServiceStatus.Cancelled:
      return (
        <span
          id={`status-pill-${ServiceStatus.Cancelled.toLowerCase()}`}
          className={`inline-flex items-center font-bold rounded-full border shadow-2xs whitespace-nowrap bg-rose-50 text-rose-800 border-rose-300/90 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-700/80 ${sizeClasses} ${className}`}
        >
          <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0 ring-2 ring-rose-200 dark:ring-rose-900" />
          <span>Cancelled</span>
        </span>
      );

    default:
      return (
        <span
          id="status-pill-default"
          className={`inline-flex items-center font-bold rounded-full border shadow-2xs whitespace-nowrap bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 ${sizeClasses} ${className}`}
        >
          <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
          <span>{status || 'Unknown'}</span>
        </span>
      );
  }
};

export default StatusPill;
