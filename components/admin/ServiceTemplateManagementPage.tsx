import React, { useState } from 'react';
import { ServiceTemplate } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { IconPlus, IconTrash, IconPencil } from '../ui/Icon';
import SkeletonLoader from '../ui/SkeletonLoader';

interface Props {
  isLoading?: boolean;
  isHydrated?: boolean;
  templates: ServiceTemplate[];
  onUpdateTemplates: (templates: ServiceTemplate[]) => void;
  onEditTemplate: (template: ServiceTemplate) => void;
}

const ServiceTemplateManagementPage: React.FC<Props> = (props) => {
  const { templates, onUpdateTemplates, onEditTemplate, isLoading, isHydrated } = props;
  const [newTemplateName, setNewTemplateName] = useState('');

  if (isLoading || isHydrated === false || !templates) {
    return <SkeletonLoader view="SERVICE_TEMPLATE_MANAGEMENT" />;
  }

  const handleAddTemplate = () => {
    if (!newTemplateName.trim()) {
      alert("Service name cannot be empty.");
      return;
    }
    if (templates.some(t => t.name.toLowerCase() === newTemplateName.trim().toLowerCase())) {
        alert("A service with this name already exists.");
        return;
    }

    const newTemplate: ServiceTemplate = {
      id: `service_${Date.now()}`,
      name: newTemplateName.trim(),
      isEnabled: true,
      customFields: [],
    };
    onUpdateTemplates([...templates, newTemplate]);
    setNewTemplateName('');
  };

  const handleToggleEnabled = (templateId: string) => {
    const updatedTemplates = templates.map(t =>
      t.id === templateId ? { ...t, isEnabled: !t.isEnabled } : t
    );
    onUpdateTemplates(updatedTemplates);
  };

  const handleDelete = (templateId: string) => {
    if (templateId.startsWith('core_')) {
        alert("Core services cannot be deleted. You can disable them if needed.");
        return;
    }
    if (window.confirm('Are you sure you want to delete this service type? This might affect historical records.')) {
        const updatedTemplates = templates.filter(t => t.id !== templateId);
        onUpdateTemplates(updatedTemplates);
    }
  };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Manage Service Types</h1>
      
      <Card title="Create New Service Type">
        <p className="text-sm text-slate-600 mb-4">
            Add new high-level services that can be selected when creating an order. You can add custom form fields to these services by clicking "Edit".
        </p>
        <div className="flex items-end space-x-2">
            <Input
                label="New Service Name"
                id="newTemplateName"
                value={newTemplateName}
                onChange={e => setNewTemplateName(e.target.value)}
                placeholder="e.g., Denting & Painting"
            />
            <Button onClick={handleAddTemplate}>
                <IconPlus className="w-5 h-5 mr-2" /> Add Service
            </Button>
        </div>
      </Card>
      
      <Card title="Current Service Types">
        <div className="space-y-3">
          {templates.map(template => (
            <div key={template.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border">
              <div className="flex items-center space-x-4">
                <label className="flex items-center cursor-pointer" title={template.isEnabled ? 'Service is enabled' : 'Service is disabled'}>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={template.isEnabled}
                      onChange={() => handleToggleEnabled(template.id)}
                      className="sr-only"
                    />
                    <div className={`block w-14 h-8 rounded-full ${template.isEnabled ? 'bg-brand-accent' : 'bg-slate-300'}`}></div>
                    <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${template.isEnabled ? 'translate-x-6' : ''}`}></div>
                  </div>
                </label>
                <div>
                  <p className={`font-semibold text-slate-800 ${!template.isEnabled && 'line-through text-slate-400'}`}>
                    {template.name}
                  </p>
                   <p className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
                    <span>{template.id.startsWith('core_') ? 'Core Service' : `${(template.customFields || []).length} field(s)`}</span>
                    {template.recipeItems && template.recipeItems.length > 0 && (
                      <span className="font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full text-[11px] border border-amber-500/20">
                        {template.recipeItems.length} recipe item(s) {template.bundlePrice ? `• ₹${template.bundlePrice}` : ''}
                      </span>
                    )}
                   </p>
                </div>
              </div>
              <div className="space-x-2">
                 <Button variant="secondary" size="sm" className="p-2 h-9" onClick={() => onEditTemplate(template)}>
                    <IconPencil className="w-4 h-4 mr-1"/> Edit
                 </Button>
                {!template.id.startsWith('core_') && (
                    <Button variant="danger" size="sm" className="p-1 h-9 w-9" onClick={() => handleDelete(template.id)} title="Delete Service">
                        <IconTrash className="w-4 h-4" />
                    </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default ServiceTemplateManagementPage;