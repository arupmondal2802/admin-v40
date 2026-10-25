import React, { useState, useEffect } from 'react';
import { Service, User } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { toISTDateString } from '../../utils/dateTimeUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  service: Service;
  date: Date;
  users: Omit<User, 'password'>[];
  onSchedule: (serviceId: string, scheduledDate: string, assignedTo: string, secondaryAssignee?: string) => void;
}

const selectClasses = "w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-brand-accent sm:text-sm";

const ScheduleOnDropModal: React.FC<Props> = ({ isOpen, onClose, service, date, users, onSchedule }) => {
  const [assignedTo, setAssignedTo] = useState('');
  const [secondaryAssignee, setSecondaryAssignee] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      // Pre-select existing or first user if available
      if (service.assignedTo) {
        setAssignedTo(service.assignedTo);
      } else if (users.length > 0) {
        setAssignedTo(users[0].username);
      } else {
        setAssignedTo('');
      }
      setSecondaryAssignee(service.secondaryAssignee || '');
    }
  }, [isOpen, users, service.assignedTo, service.secondaryAssignee]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!assignedTo) {
      setError('You must select a user to assign the service.');
      return;
    }
    const dateString = toISTDateString(date);
    onSchedule(service.submissionId, dateString, assignedTo, secondaryAssignee || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50 p-4 pt-4 sm:pt-10 overflow-y-auto modal-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md modal-content">
        <Card title="Schedule & Assign Order">
          <div className="space-y-4">
            <p className="text-slate-600">
              You are scheduling the service for <strong className="font-semibold text-slate-800">{service.customerFirstName}</strong> on <strong className="font-semibold text-slate-800">{date.toLocaleDateString()}</strong>.
            </p>
            <p className="text-sm text-slate-500 bg-slate-100 p-2 rounded-md">
                {service.carBrandModel} ({service.carNumber})
            </p>
            <div>
              <label htmlFor="user-select" className="block text-sm font-medium text-slate-700 mb-1">Primary Technician / Lead</label>
              <select id="user-select" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={selectClasses}>
                <option value="">-- Assign a primary user --</option>
                {users.map(u => (
                  <option key={u.username} value={u.username}>🔧 {u.username}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="secondary-user-select" className="block text-sm font-medium text-slate-700 mb-1">Additional Helper / Technician / Labour (Optional)</label>
              <select id="secondary-user-select" value={secondaryAssignee} onChange={(e) => setSecondaryAssignee(e.target.value)} className={selectClasses}>
                <option value="">-- None (Single Assignment) --</option>
                {users.filter(u => u.username !== assignedTo).map(u => (
                  <option key={u.username} value={u.username}>🤝 {u.username}</option>
                ))}
              </select>
            </div>

            {error && <p className="text-red-500 text-sm text-center font-semibold pt-2">{error}</p>}
          </div>
          <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end space-x-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit}>Confirm Schedule</Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ScheduleOnDropModal;