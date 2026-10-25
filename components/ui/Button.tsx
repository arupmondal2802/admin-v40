import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', size = 'md', className = '', onClick, ...props }) => {
  const baseClasses = "font-semibold tracking-normal rounded-lg transition-all duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center space-x-1.5 shadow-2xs hover:shadow-sm active:scale-[0.99]";

  const hasCustomBg = className.includes('bg-');
  const hasCustomText = className.includes('text-');

  const variantClasses = {
    primary: `${hasCustomBg ? '' : 'bg-brand-accent'} ${hasCustomText ? '' : 'text-slate-900'} font-bold hover:opacity-90 focus-visible:ring-brand-accent`,
    secondary: `${hasCustomBg ? '' : 'bg-slate-100 dark:bg-slate-800'} ${hasCustomText ? '' : 'text-slate-800 dark:text-white'} hover:bg-slate-200 border border-slate-200 focus-visible:ring-slate-500`,
    danger: `${hasCustomBg ? '' : 'bg-rose-600'} ${hasCustomText ? '' : 'text-white'} hover:bg-rose-700 focus-visible:ring-rose-600`,
    ghost: `bg-transparent ${hasCustomText ? '' : 'text-slate-700 dark:text-slate-200'} hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:ring-slate-500 shadow-none`
  };

  const sizeClasses = {
    sm: "py-2 px-3 text-xs font-semibold min-h-[36px]",
    md: "py-2.5 px-4 text-sm font-semibold min-h-[44px]"
  };

  return (
    <button className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`} onClick={onClick} {...props}>
      {children}
    </button>
  );
};

export default Button;