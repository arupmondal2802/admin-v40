import React from 'react';

interface SelfLearningInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  onNewValue: (value: string) => void;
  error?: string;
}

const SelfLearningInput: React.FC<SelfLearningInputProps> = ({
  label,
  id,
  value,
  onChange,
  suggestions,
  onNewValue,
  error,
  ...props
}) => {
  const datalistId = `${id}-suggestions`;

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const trimmedValue = e.target.value.trim();
    if (trimmedValue && !suggestions.find(s => s.toLowerCase() === trimmedValue.toLowerCase())) {
      onNewValue(trimmedValue);
    }
  };

  return (
    <div className="w-full">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        list={datalistId}
        className={`w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:border-brand-accent sm:text-sm`}
        {...props}
      />
      <datalist id={datalistId}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};

export default SelfLearningInput;