
import React, { useState, useEffect } from 'react';
import { Service, User } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { toISTDateString, getLocalTodayStr } from '../../utils/dateTimeUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  draftServices: Service[];
  users: Omit<User, 'password'>[];
  onSchedule: (serviceId: string, scheduledDate: string, assignedTo: string) => void;
}

const selectClasses = "w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-brand-accent sm:text-sm";

const ScheduleServiceModal: React.FC<Props> = ({ isOpen, onClose, draftServices, users, onSchedule }) => {
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [error, setError] = useState('');

  // Reset state when modal is opened/closed
  useEffect(() => {
    if (!isOpen) {
        setSelectedServiceId('');
        setSelectedDate('');
        setAssignedTo('');
        setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!selectedServiceId || !selectedDate || !assignedTo) {
      setError('All fields are required to schedule a service.');
      return;
    }
    onSchedule(selectedServiceId, toISTDateString(selectedDate), assignedTo);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50 p-4 pt-4 sm:pt-10 overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md">
        <Card title="Schedule a Service">
          <div className="space-y-4">
            <div>
              <label htmlFor="service-select" className="block text-sm font-medium text-slate-700 mb-1">Select Draft Service</label>
              <select id="service-select" value={selectedServiceId} onChange={(e) => setSelectedServiceId(e.target.value)} className={selectClasses}>
                <option value="">-- Choose a service --</option>
                {draftServices.map(s => (
                  <option key={s.submissionId} value={s.submissionId}>
                    {s.customerFirstName} {s.customerLastName} ({s.carNumber})
                  </option>
                ))}
              </select>
            </div>
            <Input 
                label="Schedule Date" 
                id="schedule-date" 
                type="date" 
                value={selectedDate} 
                onChange={(e) => setSelectedDate(e.target.value)}
                min={getLocalTodayStr()} // Prevent selecting past dates
            />
            <div>
              <label htmlFor="user-select" className="block text-sm font-medium text-slate-700 mb-1">Assign To</label>
              <select id="user-select" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={selectClasses}>
                <option value="">-- Assign a user --</option>
                {users.map(u => (
                  <option key={u.username} value={u.username}>{u.username}</option>
                ))}
              </select>
            </div>
            {error && <p className="text-red-500 text-sm text-center font-semibold pt-2">{error}</p>}
          </div>
          <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end space-x-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit}>Schedule Service</Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ScheduleServiceModal;
