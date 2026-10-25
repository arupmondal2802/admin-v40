import React from 'react';

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  iconBg: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, iconBg }) => {
  return (
    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-xs border border-slate-200/80 dark:border-slate-800 flex items-center space-x-4 transition-all hover:shadow-md">
      <div className={`p-3.5 rounded-xl ${iconBg} shadow-xs`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight tabular-nums mt-0.5">{value}</p>
      </div>
    </div>
  );
};

export default StatCard;
