import React, { useState } from 'react';
import { 
  Plus, Edit2, Trash2, MapPin, X, Check, Navigation, Sliders 
} from 'lucide-react';
import { AppData, DeliveryHub } from '../../types';
import { saveRecord, deleteRecord } from '../../services/cloudDataService';

interface HubManagementPageProps {
  appData: AppData;
  onRefresh: () => Promise<void>;
  sheetsUrl: string;
}

export const HubManagementPage: React.FC<HubManagementPageProps> = ({
  appData,
  onRefresh,
  sheetsUrl
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHub, setEditingHub] = useState<DeliveryHub | null>(null);
  
  // Form fields
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formLatitude, setFormLatitude] = useState<number | ''>('');
  const [formLongitude, setFormLongitude] = useState<number | ''>('');
  const [formType, setFormType] = useState<'washing' | 'detailing' | 'both'>('both');

  const hubsList = appData.deliveryHubs || [];

  const resetForm = (hub: DeliveryHub | null = null) => {
    if (hub) {
      setEditingHub(hub);
      setFormId(hub.id);
      setFormName(hub.name);
      setFormLatitude(hub.latitude);
      setFormLongitude(hub.longitude);
      setFormType(hub.type as 'washing' | 'detailing' | 'both');
    } else {
      setEditingHub(null);
      setFormId(`HUB-${Date.now()}`);
      setFormName('');
      setFormLatitude('');
      setFormLongitude('');
      setFormType('both');
    }
  };

  const handleSaveHub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || formLatitude === '' || formLongitude === '') {
      alert('Hub Name, Latitude, and Longitude are required!');
      return;
    }

    try {
      const record: DeliveryHub = {
        id: formId,
        name: formName.trim(),
        latitude: Number(formLatitude),
        longitude: Number(formLongitude),
        type: formType
      };

      await saveRecord('DeliveryHubs', record, sheetsUrl);
      setIsModalOpen(false);
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save delivery hub');
    }
  };

  const handleDeleteHub = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this delivery hub? Active route calculations relying on this hub may be affected.')) return;
    try {
      await deleteRecord('DeliveryHubs', id, sheetsUrl);
      await onRefresh();
    } catch (err) {
      alert('Failed to delete delivery hub');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-6">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
            <MapPin className="w-7 h-7 text-brand-accent" />
            Delivery Hubs Directory
          </h2>
          <p className="text-slate-400 mt-1 text-sm">
            Configure dynamic physical hubs to perform nearest-hub routing and convenience fee calculations.
          </p>
        </div>
        
        <button
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 bg-brand-accent hover:bg-brand-accent/90 text-brand-blue font-bold px-4 py-2.5 rounded-xl transition shadow-lg shadow-brand-accent/10"
        >
          <Plus className="w-5 h-5" strokeWidth={2.5} />
          Register New Hub
        </button>
      </div>

      {/* Grid List */}
      {hubsList.length === 0 ? (
        <div className="bg-slate-800/20 border border-slate-800 p-12 text-center rounded-2xl">
          <MapPin className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-300">No Delivery Hubs Found</h3>
          <p className="text-slate-500 text-sm mt-1">Get started by clicking 'Register New Hub' above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {hubsList.map((hub) => (
            <div 
              key={hub.id}
              className="bg-slate-800/30 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white leading-tight">
                      {hub.name}
                    </h3>
                    <span className="text-[10px] font-mono text-brand-accent uppercase block mt-1">
                      ID: {hub.id}
                    </span>
                  </div>
                  
                  <span className="text-[9px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                    Service: {hub.type}
                  </span>
                </div>

                <div className="space-y-1 bg-slate-900/40 border border-slate-800/40 rounded-xl p-3 text-xs text-slate-400 font-mono">
                  <div className="flex justify-between">
                    <span>Latitude:</span>
                    <span className="text-slate-200">{hub.latitude}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Longitude:</span>
                    <span className="text-slate-200">{hub.longitude}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800/60">
                <button
                  onClick={() => {
                    resetForm(hub);
                    setIsModalOpen(true);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition border border-slate-700"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit Hub
                </button>
                <button
                  onClick={() => handleDeleteHub(hub.id)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-red-950/40 hover:bg-red-950/80 text-red-400 rounded-lg transition border border-red-900/30"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-800/20">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-brand-accent" />
                {editingHub ? 'Modify Delivery Hub' : 'Register New Hub'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSaveHub} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Hub Identifier (Read-only)</label>
                <input
                  type="text"
                  required
                  disabled
                  value={formId}
                  className="w-full bg-slate-800/50 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-400 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Hub Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. South Kolkata Depot"
                  className="w-full bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formLatitude}
                    onChange={(e) => setFormLatitude(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 22.498"
                    className="w-full bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formLongitude}
                    onChange={(e) => setFormLongitude(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 88.386"
                    className="w-full bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Supported Service Type</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent"
                >
                  <option value="washing">Washing Services Only</option>
                  <option value="detailing">Detailing/Care Services Only</option>
                  <option value="both">Both (All Services)</option>
                </select>
              </div>

              {/* Modal footer buttons */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-5 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2 text-sm font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition border border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 text-sm font-bold bg-brand-accent hover:bg-brand-accent/90 text-brand-blue rounded-xl transition shadow-lg"
                >
                  Save Hub
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default HubManagementPage;
