import React, { useMemo, useState } from 'react';
import { Service, ServiceStatus } from '../types';
import { isCircularDependency } from '../services/dependencyService';
import Button from './ui/Button';
import { IconPlus, IconTrash } from './ui/Icon';

interface DependencyManagerProps {
    service: Service;
    allSubmissions: Service[];
    onUpdateDependencies: (newDeps: string[]) => void;
}

const DependencyManager: React.FC<DependencyManagerProps> = ({ service, allSubmissions, onUpdateDependencies }) => {
    const [selectedDep, setSelectedDep] = useState('');
    const [error, setError] = useState('');

    const potentialDependencies = useMemo(() => {
        return allSubmissions.filter(s => {
            // Cannot depend on itself
            if (s.submissionId === service.submissionId) return false;
            // Cannot add an existing dependency
            if (service.dependsOn?.includes(s.submissionId)) return false;
            // Cannot depend on a completed or draft task (no point)
            if (s.status === ServiceStatus.Completed || s.status === ServiceStatus.Draft) return false;
            // Cannot create a circular dependency
            if (isCircularDependency(service.submissionId, s.submissionId, allSubmissions)) return false;
            
            return true;
        }).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [allSubmissions, service]);
    
    const currentDependencies = useMemo(() => {
        return (service.dependsOn || [])
            .map(id => allSubmissions.find(s => s.submissionId === id))
            .filter((s): s is Service => !!s);
    }, [service.dependsOn, allSubmissions]);

    const handleAddDependency = () => {
        if (!selectedDep) {
            setError('Please select a task to add as a dependency.');
            return;
        }
        setError('');
        const newDeps = [...(service.dependsOn || []), selectedDep];
        onUpdateDependencies(newDeps);
        setSelectedDep('');
    };

    const handleRemoveDependency = (idToRemove: string) => {
        const newDeps = (service.dependsOn || []).filter(id => id !== idToRemove);
        onUpdateDependencies(newDeps);
    };

    return (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Task Dependencies</h3>
            <p className="text-sm text-slate-600 mb-4">This task cannot be started until all of its prerequisite tasks are completed.</p>
            
            <div className="space-y-2 mb-4">
                {currentDependencies.length > 0 ? (
                    currentDependencies.map(dep => (
                        <div key={dep.submissionId} className="flex items-center justify-between p-2 bg-white border rounded-md">
                            <div>
                                <p className="font-semibold text-slate-700">#{dep.appointmentId?.split('-').pop()} - {dep.customerFirstName}</p>
                                <p className="text-xs text-slate-500">{dep.serviceSelection.join(', ')}</p>
                            </div>
                            <Button variant="danger" size="sm" className="p-1 h-8 w-8" onClick={() => handleRemoveDependency(dep.submissionId)}>
                                <IconTrash className="w-4 h-4" />
                            </Button>
                        </div>
                    ))
                ) : (
                    <p className="text-sm text-slate-500 text-center py-2">No dependencies for this task.</p>
                )}
            </div>

            <div className="flex items-end space-x-2 pt-4 border-t">
                <div className="flex-grow">
                    <label htmlFor="dependency-select" className="block text-sm font-medium text-slate-700 mb-1">Add a Prerequisite Task</label>
                    <select
                        id="dependency-select"
                        value={selectedDep}
                        onChange={(e) => {
                            setSelectedDep(e.target.value);
                            setError('');
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-brand-accent sm:text-sm"
                    >
                        <option value="">-- Select a task --</option>
                        {potentialDependencies.map(dep => (
                            <option key={dep.submissionId} value={dep.submissionId}>
                                #{dep.appointmentId?.split('-').pop()} - {dep.customerFirstName} ({dep.status})
                            </option>
                        ))}
                    </select>
                </div>
                <Button onClick={handleAddDependency} className="h-10">
                    <IconPlus className="w-5 h-5" />
                </Button>
            </div>
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
    );
};

export default DependencyManager;
