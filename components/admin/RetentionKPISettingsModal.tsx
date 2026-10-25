import React, { useState, useEffect } from 'react';
import { RetentionKpiTargets } from '../../types';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (targets: RetentionKpiTargets) => void;
  currentTargets: RetentionKpiTargets;
}

const RetentionKPISettingsModal: React.FC<Props> = ({ isOpen, onClose, onSave, currentTargets }) => {
  const DEFAULT_KPI_TARGETS: RetentionKpiTargets = {
    monthlyFollowUps: 15,
    conversionRatePercentage: 40,
    monthlyRevenue: 25000,
  };

  const [targets, setTargets] = useState<RetentionKpiTargets>(() => currentTargets || DEFAULT_KPI_TARGETS);

  useEffect(() => {
    if (isOpen) {
      setTargets(currentTargets || DEFAULT_KPI_TARGETS);
    }
  }, [isOpen, currentTargets]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTargets(prev => ({ ...prev, [name]: Number(value) || 0 }));
  };

  const handleSave = () => {
    onSave(targets);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 modal-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg modal-content">
        <Card title="Set Retention KPI Targets">
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Set your monthly goals for the retention dashboard.</p>
            <Input
              label="Monthly Follow-ups Target"
              id="monthlyFollowUps"
              name="monthlyFollowUps"
              type="number"
              value={targets.monthlyFollowUps}
              onChange={handleChange}
            />
            <Input
              label="Conversion Rate Target (%)"
              id="conversionRatePercentage"
              name="conversionRatePercentage"
              type="number"
              value={targets.conversionRatePercentage}
              onChange={handleChange}
              min="0"
              max="100"
            />
            <Input
              label="Monthly Revenue from Follow-ups (₹)"
              id="monthlyRevenue"
              name="monthlyRevenue"
              type="number"
              value={targets.monthlyRevenue}
              onChange={handleChange}
            />
          </div>
          <div className="mt-6 flex justify-end space-x-2 border-t pt-4">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>Save Targets</Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default RetentionKPISettingsModal;