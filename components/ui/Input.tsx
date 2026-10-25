import React from 'react';
import { FormErrorValue } from '../../types';

// FIX: To resolve the type conflict with the native 'prefix' attribute,
// Omit it from the standard InputHTMLAttributes and then add our custom definition for it.
interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label: string;
  error?: FormErrorValue | string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

const Input: React.FC<InputProps> = (props) => {
  // By destructuring here instead of the function signature, we make the separation
  // of custom props from native input attributes more explicit, which can help prevent
  // issues where an object (like an icon in `suffix`) is accidentally passed to the DOM.
  const { label, error, prefix, suffix, className, ...rest } = props;

  return (
    <div className="w-full">
      <label htmlFor={rest.id} className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
        {label}
      </label>
      <div className="relative rounded-lg shadow-xs">
        {prefix && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">{prefix}</span>
          </div>
        )}
        <input
          className={`w-full px-3.5 py-2.5 bg-white dark:bg-slate-900/90 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700/80 rounded-lg placeholder-slate-400 dark:placeholder-slate-500 font-medium text-sm tracking-tight focus:outline-none focus:ring-2 focus:ring-brand-accent/60 focus:border-brand-accent transition-all ${prefix ? 'pl-10' : ''} ${suffix ? 'pr-10' : ''} ${error ? 'border-red-500 focus:ring-red-500/30' : ''} ${className || ''}`}
          {...rest}
        />
        {suffix && (
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                {suffix}
            </div>
        )}
      </div>
      {error && typeof error === 'string' && <p className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
};

export default Input;