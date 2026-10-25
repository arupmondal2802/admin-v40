import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBgColor?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, iconBgColor = 'bg-slate-100' }) => {
  return (
    <div className="bg-white p-5 rounded-xl shadow-md flex items-center space-x-4 border border-slate-200/80 hover:shadow-lg hover:border-brand-accent/50 transition-all duration-300">
      <div className={`p-3 rounded-full ${iconBgColor}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-3xl font-bold text-brand-blue">{value}</p>
      </div>
    </div>
  );
};

export default StatCard;