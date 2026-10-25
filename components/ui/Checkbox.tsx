import React from 'react';
import { IconCheck } from './Icon';

interface CheckboxProps {
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  id: string;
}

const Checkbox: React.FC<CheckboxProps> = ({ label, checked, onChange, id }) => {

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
  };

  return (
    <label htmlFor={id} className="flex items-start p-4 bg-yellow-50 border border-yellow-200 rounded-lg cursor-pointer hover:bg-yellow-100 transition-colors">
      <div className="flex-shrink-0 mt-1">
        <input
          id={id}
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={handleChange}
        />
        <div className={`
          w-6 h-6 border-2 rounded-md
          transition-colors duration-200
          peer-checked:bg-brand-accent peer-checked:border-brand-accent
          border-slate-400 bg-white
          flex items-center justify-center
        `}>
          <IconCheck className={`
            w-5 h-5 text-brand-blue
            transition-transform duration-200 ease-in-out
            scale-0 peer-checked:scale-100
          `} />
        </div>
      </div>
      <span className="ml-3 text-sm text-yellow-800">
        {label}
      </span>
    </label>
  );
};

export default Checkbox;