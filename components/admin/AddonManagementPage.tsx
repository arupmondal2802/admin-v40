import React, { useState } from 'react';
// FIX: Removed invalid import of obsolete 'PredefinedAddon' type.
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { IconPlus, IconPencil, IconTrash, IconDeviceFloppy } from '../ui/Icon';

// FIX: Added local interface for 'PredefinedAddon' to fix type errors in this deprecated component.
interface PredefinedAddon {
  id: string;
  name: string;
  price: number;
}


interface Props {
  addons: PredefinedAddon[];
  onUpdateAddons: (addons: PredefinedAddon[]) => void;
}

const AddonManagementPage: React.FC<Props> = ({ addons, onUpdateAddons }) => {
  const [editingAddon, setEditingAddon] = useState<PredefinedAddon | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleSave = (addonToSave: PredefinedAddon) => {
    if (!addonToSave.name || addonToSave.price < 0) {
      alert("Addon name cannot be empty and price must be zero or greater.");
      return;
    }
    
    const existingIndex = addons.findIndex(a => a.id === addonToSave.id);
    let updatedAddons;
    if (existingIndex > -1) {
      updatedAddons = addons.map(a => (a.id === addonToSave.id ? addonToSave : a));
    } else {
      updatedAddons = [...addons, addonToSave];
    }
    onUpdateAddons(updatedAddons);
    setEditingAddon(null);
    setIsCreating(false);
  };

  const handleDelete = (addonId: string) => {
    if (window.confirm('Are you sure you want to delete this add-on? This cannot be undone.')) {
      const updatedAddons = addons.filter(a => a.id !== addonId);
      onUpdateAddons(updatedAddons);
    }
  };

  const startCreating = () => {
    const newId = `addon_${Date.now()}`;
    setEditingAddon({ id: newId, name: '', price: 0 });
    setIsCreating(true);
  };
  
  const AddonEditor: React.FC<{ addon: PredefinedAddon, onSave: (addon: PredefinedAddon) => void, onCancel: () => void }> = ({ addon, onSave, onCancel }) => {
    const [localAddon, setLocalAddon] = useState(addon);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setLocalAddon(prev => ({ ...prev, [name]: name === 'price' ? Number(value) : value }));
    };
    
    return (
      <div className="p-4 bg-slate-100 rounded-lg border my-4">
        <h3 className="text-lg font-semibold mb-2">{isCreating ? "Create New Add-on" : "Edit Add-on"}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <Input label="Add-on Name" id="name" name="name" value={localAddon.name} onChange={handleChange} />
            <Input label="Price (₹)" id="price" name="price" type="number" value={localAddon.price} onChange={handleChange} />
            <div className="flex space-x-2">
                <Button onClick={onCancel} variant="secondary">Cancel</Button>
                <Button onClick={() => onSave(localAddon)}>
                    <IconDeviceFloppy className="w-5 h-5 mr-2"/> Save
                </Button>
            </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
        <div className="flex justify-between items-center">
             <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Manage Add-on Services</h1>
             <Button onClick={startCreating} disabled={!!editingAddon}>
                <IconPlus className="w-5 h-5 mr-2" />
                Create New Add-on
             </Button>
        </div>
        
        {editingAddon && <AddonEditor addon={editingAddon} onSave={handleSave} onCancel={() => { setEditingAddon(null); setIsCreating(false); }} />}

        <Card title="Current Add-ons">
             <div className="space-y-3">
                {addons.map(addon => (
                    <div key={addon.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border">
                       <div>
                            <p className="font-semibold text-slate-800">{addon.name}</p>
                            <p className="text-sm text-slate-600">₹{addon.price.toFixed(2)}</p>
                       </div>
                       <div className="space-x-2">
                            <Button variant="ghost" size="sm" className="p-1 h-8 w-8" onClick={() => setEditingAddon(addon)}><IconPencil className="w-4 h-4" /></Button>
                            <Button variant="danger" size="sm" className="p-1 h-8 w-8" onClick={() => handleDelete(addon.id)}><IconTrash className="w-4 h-4" /></Button>
                       </div>
                    </div>
                ))}
                {addons.length === 0 && (
                    <div className="text-center py-8">
                        <p className="text-slate-500">No add-ons defined. Click "Create New Add-on" to get started.</p>
                    </div>
                )}
             </div>
        </Card>
    </div>
  );
};

export default AddonManagementPage;