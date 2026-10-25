import React, { useState, useMemo } from 'react';
import { Service } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { IconTrashOff, IconTrash, IconSearch } from '../ui/Icon';
import DeleteConfirmationModal from '../dashboard/DeleteConfirmationModal';

interface TrashPageProps {
  deletedSubmissions: Service[];
  onRestore: (service: Service) => void;
  onPermanentDelete: (service: Service) => void;
}

const TrashPage: React.FC<TrashPageProps> = ({ deletedSubmissions, onRestore, onPermanentDelete }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);

  const filteredItems = useMemo(() => {
    return deletedSubmissions.filter(s => {
      const term = searchTerm.toLowerCase();
      return (
        String(s.customerFirstName || '').toLowerCase().includes(term) ||
        String(s.customerLastName || '').toLowerCase().includes(term) ||
        String(s.carNumber || '').toLowerCase().includes(term) ||
        String(s.mobileNumber || '').includes(term) ||
        (s.appointmentId && String(s.appointmentId).toLowerCase().includes(term))
      );
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [deletedSubmissions, searchTerm]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Trash</h1>
        <p className="text-slate-500 mt-1">Manage deleted orders. Items here can be restored or permanently removed.</p>
      </div>

      <Card>
        <div className="mb-4">
          <Input
            label="Search Trash"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, car number, or ID..."
            prefix={<IconSearch className="w-5 h-5 text-slate-400" />}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Order ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Car</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Deleted Date</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredItems.map((service) => (
                <tr key={service.submissionId}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                    #{service.appointmentId?.split('-').pop()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {service.customerFirstName} {service.customerLastName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {service.carBrandModel} ({service.carNumber})
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {new Date(service.timestamp).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <Button variant="secondary" size="sm" onClick={() => onRestore(service)} title="Restore Order">
                        <IconTrashOff className="w-4 h-4 mr-1" /> Restore
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setServiceToDelete(service)} title="Delete Permanently">
                        <IconTrash className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                    No items in trash.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {serviceToDelete && (
        <DeleteConfirmationModal
            isOpen={!!serviceToDelete}
            onClose={() => setServiceToDelete(null)}
            onConfirm={() => {
                onPermanentDelete(serviceToDelete);
                setServiceToDelete(null);
            }}
            service={serviceToDelete}
            isPermanent={true}
        />
      )}
    </div>
  );
};

export default TrashPage;
