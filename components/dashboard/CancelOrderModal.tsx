import React, { useState, useEffect } from 'react';
import { Service, User } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { IconAlertTriangle, IconUser, IconClock, IconMapPin } from '../ui/Icon';
import { getGeographicalLocationStamp } from '../../utils/locationUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, locationStamp: string, timestamp: string) => void;
  service: Service | null;
  currentUser?: User | null;
}

export const CancelOrderModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onConfirm,
  service,
  currentUser
}) => {
  const [reason, setReason] = useState('');
  const [locationStamp, setLocationStamp] = useState('Fetching GPS Location...');
  const [timestamp, setTimestamp] = useState(new Date().toISOString());
  const [error, setError] = useState('');
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError('');
      const now = new Date().toISOString();
      setTimestamp(now);
      setIsLocating(true);

      getGeographicalLocationStamp(currentUser)
        .then((loc) => setLocationStamp(loc))
        .finally(() => setIsLocating(false));
    }
  }, [isOpen, currentUser]);

  if (!isOpen || !service) return null;

  const handleConfirm = () => {
    if (!reason.trim()) {
      setError('A reason for cancellation is required for audit records.');
      return;
    }
    onConfirm(reason.trim(), locationStamp, timestamp);
    onClose();
  };

  const loggerName = currentUser?.username || 'System User';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 pt-4 sm:pt-10 overflow-y-auto modal-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md modal-content">
        <Card>
          <div className="flex flex-col items-center text-center">
            <div className="p-3 bg-amber-100 dark:bg-amber-950/60 rounded-full mb-3">
              <IconAlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              Cancel Order #{service.submissionId}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Marking order as <strong>Cancelled</strong> for <strong className="font-semibold">{service.customerFirstName} {service.customerLastName}</strong> ({service.carBrandModel}).
            </p>
          </div>

          {/* Audit Data Display Box */}
          <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Audit Record Metadata
            </div>
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <IconUser className="w-3.5 h-3.5 text-brand-blue" />
              <span>Logger: <strong className="font-semibold">{loggerName}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <IconClock className="w-3.5 h-3.5 text-amber-500" />
              <span>Timestamp: <strong className="font-mono">{new Date(timestamp).toLocaleString()}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <IconMapPin className="w-3.5 h-3.5 text-rose-500" />
              <span>Location: <strong className="font-mono text-[11px]">{isLocating ? 'Acquiring GPS...' : locationStamp}</strong></span>
            </div>
          </div>

          {/* Required Cancellation Reason Input */}
          <div className="mt-4 space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Reason for Cancellation <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (e.target.value.trim()) setError('');
              }}
              placeholder="e.g. Customer requested cancellation, vehicle unavailable, out of service area..."
              className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
              rows={3}
            />
            {error && <p className="text-red-500 text-xs font-semibold">{error}</p>}
          </div>

          <div className="mt-5 pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
            <Button variant="ghost" onClick={onClose} size="sm">
              Keep Order Active
            </Button>
            <Button variant="primary" onClick={handleConfirm} size="sm" className="bg-amber-600 hover:bg-amber-700 text-white font-bold">
              Confirm Order Cancellation
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default CancelOrderModal;
