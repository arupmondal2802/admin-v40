import React, { useState, useEffect } from 'react';
import { Service } from '../types';
import Card from './ui/Card';
import Button from './ui/Button';
import { IconLoader, IconSparkles, IconAlertTriangle } from './ui/Icon';

interface SummaryModalProps {
  service: Service;
  onClose: () => void;
}

export const SummaryModal: React.FC<SummaryModalProps> = ({ service, onClose }) => {
  const [summary, setSummary] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSummary = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/.netlify/functions/summarize-service', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(service),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || `Request failed with status ${response.status}`);
        }

        setSummary(data.summary);
      } catch (err) {
        if (err instanceof Error) {
            setError(err.message);
        } else {
            setError('An unknown error occurred while generating the summary.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchSummary();
  }, [service]);
  
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center p-8 space-y-4">
          <IconLoader className="w-12 h-12 text-brand-accent animate-spin" />
          <p className="text-slate-600 font-semibold">Generating AI Summary...</p>
        </div>
      );
    }

    if (error) {
       return (
        <div className="flex flex-col items-center justify-center p-8 space-y-4 text-center">
          <IconAlertTriangle className="w-12 h-12 text-red-500" />
          <p className="text-red-700 font-semibold">Failed to Generate Summary</p>
          <p className="text-sm text-red-600 bg-red-100 p-2 rounded-md">{error}</p>
        </div>
      );
    }

    return (
        <div className="text-base text-slate-700 leading-relaxed whitespace-pre-wrap p-2">
            {summary}
        </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 modal-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg modal-content">
        <Card title="AI Service Summary" className="w-full max-w-lg">
           <div className="flex items-start space-x-4 p-4 min-h-[150px]">
                <div className="flex-shrink-0">
                    <IconSparkles className="w-8 h-8 text-brand-accent" />
                </div>
                <div className="flex-grow">
                    {renderContent()}
                </div>
           </div>
           <div className="mt-6 flex justify-end space-x-3 p-4 bg-slate-50 border-t">
              <Button variant="secondary" onClick={onClose}>Close</Button>
           </div>
        </Card>
      </div>
    </div>
  );
};