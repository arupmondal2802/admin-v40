import React from 'react';

export interface HorizontalProgressBarProps {
  value: number;
  target: number;
  label?: string;
  subLabel?: string;
  unit?: string;
  size?: 'sm' | 'md' | 'lg';
  colorScheme?: 'auto' | 'indigo' | 'emerald' | 'amber' | 'blue' | 'purple';
  showPercentage?: boolean;
  showValues?: boolean;
  showMarker?: boolean;
  formatValue?: (val: number) => string;
  formatTarget?: (val: number) => string;
  className?: string;
  badge?: React.ReactNode;
}

export const HorizontalProgressBar: React.FC<HorizontalProgressBarProps> = ({
  value,
  target,
  label,
  subLabel,
  unit = '',
  size = 'md',
  colorScheme = 'auto',
  showPercentage = true,
  showValues = true,
  showMarker = true,
  formatValue,
  formatTarget,
  className = '',
  badge,
}) => {
  const safeTarget = Math.max(1, target || 1);
  const safeValue = Math.max(0, value || 0);
  const percentage = Math.round((safeValue / safeTarget) * 100);
  const clampedWidth = Math.min(100, percentage);

  const formattedVal = formatValue ? formatValue(safeValue) : `${safeValue.toLocaleString('en-IN')}${unit ? ` ${unit}` : ''}`;
  const formattedTgt = formatTarget ? formatTarget(safeTarget) : `${safeTarget.toLocaleString('en-IN')}${unit ? ` ${unit}` : ''}`;

  // Determine progress bar fill color
  const getGradient = () => {
    if (colorScheme !== 'auto') {
      switch (colorScheme) {
        case 'indigo':
          return 'bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700';
        case 'emerald':
          return 'bg-gradient-to-r from-emerald-500 to-emerald-600';
        case 'amber':
          return 'bg-gradient-to-r from-amber-400 to-amber-500';
        case 'blue':
          return 'bg-gradient-to-r from-sky-500 to-blue-600';
        case 'purple':
          return 'bg-gradient-to-r from-purple-500 to-indigo-600';
      }
    }

    // Auto mode based on percentage against KPI target threshold
    if (percentage >= 100) {
      return 'bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600';
    }
    if (percentage >= 75) {
      return 'bg-gradient-to-r from-blue-500 via-indigo-500 to-indigo-600';
    }
    if (percentage >= 45) {
      return 'bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500';
    }
    return 'bg-gradient-to-r from-rose-400 via-red-400 to-rose-500';
  };

  const getStatusBadge = () => {
    if (badge) return badge;
    if (percentage >= 100) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <span>✓</span> Target Met ({percentage}%)
        </span>
      );
    }
    if (percentage >= 75) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
          On Track ({percentage}%)
        </span>
      );
    }
    if (percentage >= 45) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
          In Progress ({percentage}%)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
        Needs Push ({percentage}%)
      </span>
    );
  };

  const barHeight = size === 'sm' ? 'h-2' : size === 'lg' ? 'h-4' : 'h-2.5';

  return (
    <div className={`w-full ${className}`}>
      {(label || showValues || showPercentage) && (
        <div className="flex justify-between items-center mb-1.5 flex-wrap gap-1">
          <div className="flex items-center gap-2">
            {label && <span className="text-xs font-bold text-slate-700">{label}</span>}
            {subLabel && <span className="text-[11px] text-slate-400">({subLabel})</span>}
          </div>

          <div className="flex items-center gap-2">
            {showValues && (
              <div className="text-xs font-mono">
                <span className="font-black text-slate-800">{formattedVal}</span>
                <span className="text-slate-400 font-sans mx-1">/</span>
                <span className="text-slate-500 font-semibold" title="KPI Target Threshold">{formattedTgt} target</span>
              </div>
            )}
            {showPercentage && getStatusBadge()}
          </div>
        </div>
      )}

      {/* Progress Track */}
      <div 
        className={`w-full bg-slate-100 rounded-full ${barHeight} overflow-hidden relative p-0.5 border border-slate-200 shadow-inner`}
        role="progressbar"
        aria-valuenow={safeValue}
        aria-valuemin={0}
        aria-valuemax={safeTarget}
        aria-label={label || 'KPI Target Progress'}
      >
        {/* Fill bar */}
        <div
          className={`${barHeight} rounded-full ${getGradient()} transition-all duration-500 ease-out shadow-xs`}
          style={{ width: `${clampedWidth}%` }}
        />

        {/* Target threshold indicator notch at 100% */}
        {showMarker && percentage < 100 && (
          <div 
            className="absolute right-0 top-0 bottom-0 w-0.5 bg-slate-400/50 z-10 pointer-events-none" 
            title="100% Target Threshold"
          />
        )}
      </div>

      {/* Extra helper text if exceeded */}
      {percentage > 100 && (
        <p className="text-[10px] text-emerald-600 font-bold mt-1 text-right">
          +{safeValue - safeTarget} {unit || 'orders'} (+{percentage - 100}%) beyond target goal
        </p>
      )}
    </div>
  );
};

export default HorizontalProgressBar;
