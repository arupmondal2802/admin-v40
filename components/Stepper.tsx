import React from 'react';
import { IconCheck } from './ui/Icon';

interface Step {
  name: string;
}

interface StepperProps {
  steps: Step[];
  currentStepIndex: number;
  onStepClick: (index: number) => void;
  isClickable?: boolean;
}

const Stepper: React.FC<StepperProps> = ({ steps, currentStepIndex, onStepClick, isClickable = false }) => {
  return (
    <div className="hide-scrollbar -mx-4 px-4 overflow-x-auto">
      <nav aria-label="Progress" className="min-w-[480px] sm:min-w-full">
        <div className="flex items-start">
          {steps.map((step, stepIdx) => (
            <React.Fragment key={step.name}>
              <div className="flex flex-col items-center pt-1 basis-28">
                <button
                  onClick={() => onStepClick(stepIdx)}
                  className={`relative flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full transition-colors duration-300
                    ${stepIdx < currentStepIndex ? 'bg-brand-accent hover:bg-brand-accent/90' : ''}
                    ${stepIdx === currentStepIndex ? 'border-2 border-brand-accent bg-white' : ''}
                    ${stepIdx > currentStepIndex ? 'border-2 border-slate-300 bg-white hover:border-slate-400' : ''}
                    ${isClickable || stepIdx < currentStepIndex ? 'cursor-pointer' : 'cursor-default'}
                  `}
                  disabled={!isClickable && stepIdx > currentStepIndex}
                >
                  {stepIdx < currentStepIndex ? (
                    <IconCheck className="h-5 w-5 sm:h-6 sm:w-6 text-brand-blue" aria-hidden="true" />
                  ) : stepIdx === currentStepIndex ? (
                    <span className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-brand-accent" aria-hidden="true" />
                  ) : (
                    <span className={`text-sm font-semibold ${isClickable ? 'text-slate-500 group-hover:text-slate-700' : 'text-slate-400'}`}>{stepIdx + 1}</span>
                  )}
                </button>
                <p className={`mt-2 text-center text-[11px] font-semibold sm:text-xs
                  ${stepIdx === currentStepIndex ? 'text-brand-blue' : 'text-slate-500'}
                `}>
                  {step.name}
                </p>
              </div>

              {stepIdx !== steps.length - 1 && (
                <div className={`flex-1 h-1 mt-3 sm:mt-4 transition-colors duration-300
                  ${stepIdx < currentStepIndex ? 'bg-brand-accent' : 'bg-slate-200'}
                `}/>
              )}
            </React.Fragment>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default Stepper;