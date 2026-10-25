import React, { useState } from 'react';
import { IconChevronDown } from './Icon';

interface AccordionProps {
  title: string;
  children: React.ReactNode;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
}

const Accordion: React.FC<AccordionProps> = ({ title, children, summary, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden transition-shadow hover:shadow-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center p-4 bg-slate-50 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
        aria-expanded={isOpen}
      >
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          {summary && <div className="text-sm text-slate-600 hidden sm:block">{summary}</div>}
        </div>
        <div className="flex items-center space-x-2">
           {summary && <div className="text-sm text-slate-600 sm:hidden">{summary}</div>}
           <IconChevronDown className={`w-5 h-5 text-slate-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>
      <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-[5000px]' : 'max-h-0'}`}>
        <div className="p-4 border-t border-slate-200">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Accordion;