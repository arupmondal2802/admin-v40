import React, { useState, useEffect } from 'react';
import { Service, User } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { IconAlertTriangle, IconTrash, IconMapPin, IconUser, IconClock } from '../ui/Icon';
import { getGeographicalLocationStamp } from '../../utils/locationUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, locationStamp: string, timestamp: string) => void;
  service: Service | null;
  currentUser?: User | null;
  isPermanent?: boolean;
}

const DeleteConfirmationModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onConfirm,
  service,
  currentUser,
  isPermanent = false
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
        .then((loc) => {
          setLocationStamp(loc);
        })
        .finally(() => {
          setIsLocating(false);
        });
    }
  }, [isOpen, currentUser]);

  if (!isOpen || !service) return null;

  const handleConfirm = () => {
    if (!reason.trim()) {
      setError('A reason for deletion is required for audit compliance.');
      return;
    }
    onConfirm(reason.trim(), locationStamp, timestamp);
    onClose();
  };

  const loggerName = currentUser?.username || 'System Admin';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 pt-4 sm:pt-10 overflow-y-auto modal-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md modal-content">
        <Card>
          <div className="flex flex-col items-center text-center">
            <div className="p-3 bg-red-100 rounded-full mb-3">
              <IconAlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              {isPermanent ? "Confirm Permanent Deletion" : "Delete / Move to Trash"}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Deleting Order #{service.submissionId} for <strong className="font-semibold text-slate-900 dark:text-slate-100">{service.customerFirstName} {service.customerLastName}</strong> ({service.carBrandModel}).
            </p>
          </div>

          {/* Audit Logging Info Box */}
          <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Audit Data Captured
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

          {/* Required Deletion Reason Input */}
          <div className="mt-4 space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Reason for Deletion <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (e.target.value.trim()) setError('');
              }}
              placeholder="e.g. Duplicate order entry, customer canceled before dispatch, erroneous entry..."
              className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500"
              rows={3}
            />
            {error && <p className="text-red-500 text-xs font-semibold">{error}</p>}
          </div>

          {isPermanent ? (
            <p className="mt-3 font-bold text-red-700 bg-red-100 dark:bg-red-950/60 dark:text-red-300 p-2.5 rounded-lg text-xs">
              This action is irreversible. All associated data will be deleted permanently.
            </p>
          ) : (
            <p className="mt-3 text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 p-2.5 rounded-lg">
              You can restore this item later from the Trash view.
            </p>
          )}

          <div className="mt-5 pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
            <Button variant="ghost" onClick={onClose} size="sm">Cancel</Button>
            <Button variant="danger" onClick={handleConfirm} size="sm">
              <IconTrash className="w-4 h-4 mr-1.5" />
              {isPermanent ? "Delete Permanently" : "Confirm Deletion"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DeleteConfirmationModal;
