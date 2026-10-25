
import React, { useState, useEffect } from 'react';
import { Service, User } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  service: Service;
  users: Omit<User, 'password'>[];
  onAssign: (serviceId: string, assignedTo: string, secondaryAssignee?: string) => void;
}

const selectClasses = "w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-brand-accent sm:text-sm";

const AssignOrderModal: React.FC<Props> = ({ isOpen, onClose, service, users, onAssign }) => {
  const [assignedTo, setAssignedTo] = useState('');
  const [secondaryAssignee, setSecondaryAssignee] = useState('');
  const [error, setError] = useState('');

  const availableUsers = users.filter(u => u.role !== 'admin' && u.role !== 'manager');

  useEffect(() => {
    if (isOpen) {
        // Try to load draft from memory or default to existing / first available
        const draftKey = `assign_draft_${service.submissionId}`;
        const draftSecondaryKey = `assign_secondary_draft_${service.submissionId}`;
        const savedDraft = localStorage.getItem(draftKey);
        const savedSecondaryDraft = localStorage.getItem(draftSecondaryKey);
        
        if (savedDraft) {
            setAssignedTo(savedDraft);
        } else if (service.assignedTo) {
            setAssignedTo(service.assignedTo);
        } else if (availableUsers.length > 0) {
            setAssignedTo(availableUsers[0].username);
        } else {
            setAssignedTo('');
        }

        if (savedSecondaryDraft) {
            setSecondaryAssignee(savedSecondaryDraft);
        } else if (service.secondaryAssignee) {
            setSecondaryAssignee(service.secondaryAssignee);
        } else {
            setSecondaryAssignee('');
        }
        setError('');
    }
  }, [isOpen, availableUsers, service.submissionId, service.assignedTo, service.secondaryAssignee]);

  const handleUserChange = (val: string) => {
      setAssignedTo(val);
      localStorage.setItem(`assign_draft_${service.submissionId}`, val);
  };

  const handleSecondaryChange = (val: string) => {
      setSecondaryAssignee(val);
      localStorage.setItem(`assign_secondary_draft_${service.submissionId}`, val);
  };

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!assignedTo) {
      setError('You must select a primary user to assign the service.');
      return;
    }
    onAssign(service.submissionId, assignedTo, secondaryAssignee || undefined);
    localStorage.removeItem(`assign_draft_${service.submissionId}`);
    localStorage.removeItem(`assign_secondary_draft_${service.submissionId}`);
    onClose();
  };
  
  const handleCancel = () => {
     onClose();
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50 p-4 pt-4 sm:pt-10 overflow-y-auto modal-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md modal-content">
        <Card title={`Assign Order for ${service.customerFirstName}`}>
          <div className="space-y-4">
            <p className="text-slate-600 text-sm">Assign primary technician and an optional additional helper / labour for this service.</p>
            <div>
              <label htmlFor="user-select" className="block text-sm font-medium text-slate-700 mb-1">Primary Technician / Lead</label>
              <select id="user-select" value={assignedTo} onChange={(e) => handleUserChange(e.target.value)} className={selectClasses}>
                <option value="">-- Assign a primary user --</option>
                {availableUsers.map(u => (
                  <option key={u.username} value={u.username}>🔧 {u.username}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="secondary-user-select" className="block text-sm font-medium text-slate-700 mb-1">Additional Helper / Technician / Labour (Optional)</label>
              <select id="secondary-user-select" value={secondaryAssignee} onChange={(e) => handleSecondaryChange(e.target.value)} className={selectClasses}>
                <option value="">-- None (Single Assignment) --</option>
                {availableUsers.filter(u => u.username !== assignedTo).map(u => (
                  <option key={u.username} value={u.username}>🤝 {u.username}</option>
                ))}
              </select>
            </div>

            {error && <p className="text-red-500 text-sm text-center font-semibold pt-2">{error}</p>}
          </div>
          <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end space-x-2">
            <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
            <Button onClick={handleSubmit}>Confirm Assignment</Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AssignOrderModal;
