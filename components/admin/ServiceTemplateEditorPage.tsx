import React, { useState } from 'react';
import { ServiceTemplate, CustomField, CustomFieldType, InventoryItem, RecipeItem } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { IconPlus, IconTrash, IconDeviceFloppy, IconSparkles, IconPencil, IconSettings } from '../ui/Icon';
import { triggerHapticFeedback } from '../../services/hapticService';
import ServiceRecipeBuilder from './ServiceRecipeBuilder';

interface Props {
  template: ServiceTemplate;
  inventoryItems?: InventoryItem[];
  onSave: (template: ServiceTemplate) => void;
  onExit: () => void;
}

const ServiceTemplateEditorPage: React.FC<Props> = ({ template, inventoryItems = [], onSave, onExit }) => {
  const [localTemplate, setLocalTemplate] = useState<ServiceTemplate>(JSON.parse(JSON.stringify(template)));
  const [activeTab, setActiveTab] = useState<'RECIPE' | 'FIELDS' | 'SETTINGS'>('RECIPE');

  const handleAddField = (type: CustomFieldType) => {
    const newField: CustomField = {
      id: `field_${Date.now()}`,
      label: `New ${type.toLowerCase()} field`,
      type: type,
    };
    setLocalTemplate(prev => ({
      ...prev,
      customFields: [...(prev.customFields || []), newField]
    }));
  };

  const handleUpdateFieldLabel = (fieldId: string, newLabel: string) => {
    setLocalTemplate(prev => ({
      ...prev,
      customFields: (prev.customFields || []).map(f => f.id === fieldId ? { ...f, label: newLabel } : f)
    }));
  };

  const handleRemoveField = (fieldId: string) => {
    setLocalTemplate(prev => ({
      ...prev,
      customFields: (prev.customFields || []).filter(f => f.id !== fieldId)
    }));
  };

  const handleRecipeChange = (recipeItems: RecipeItem[], bundlePrice?: number, laborMinutes?: number) => {
    setLocalTemplate(prev => ({
      ...prev,
      recipeItems,
      bundlePrice: bundlePrice !== undefined ? bundlePrice : prev.bundlePrice,
      estimatedLaborMinutes: laborMinutes !== undefined ? laborMinutes : prev.estimatedLaborMinutes
    }));
  };

  const handleSaveClick = () => {
    triggerHapticFeedback('success');
    onSave(localTemplate);
  };

  return (
    <div className="space-y-6">
      {/* Top Title & Navigation Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-brand-accent/20 text-brand-accent rounded-lg">
              <IconPencil className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
              Edit Service Template: {localTemplate.name}
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Build service recipes, define bundled products & labor units, and configure customer form fields.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onExit} className="text-xs">
            Cancel & Exit
          </Button>
          <Button size="sm" onClick={handleSaveClick} className="bg-brand-blue hover:bg-brand-blue/90 text-white font-bold text-xs">
            <IconDeviceFloppy className="w-4 h-4 mr-1.5" /> Save Template Changes
          </Button>
        </div>
      </div>

      {/* Editor Sub-Navigation Tabs */}
      <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-2xl">
        <button
          type="button"
          onClick={() => setActiveTab('RECIPE')}
          className={`flex-1 py-2 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
            activeTab === 'RECIPE'
              ? 'bg-white dark:bg-slate-800 text-brand-blue dark:text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <IconSparkles className="w-4 h-4 text-amber-500" />
          <span>Recipe Builder</span>
          {(localTemplate.recipeItems || []).length > 0 && (
            <span className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1.5 py-0.2 rounded-full font-extrabold">
              {(localTemplate.recipeItems || []).length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('FIELDS')}
          className={`flex-1 py-2 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
            activeTab === 'FIELDS'
              ? 'bg-white dark:bg-slate-800 text-brand-blue dark:text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <IconPlus className="w-4 h-4 text-indigo-500" />
          <span>Custom Form Fields</span>
          {(localTemplate.customFields || []).length > 0 && (
            <span className="text-[10px] bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.2 rounded-full font-extrabold">
              {(localTemplate.customFields || []).length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('SETTINGS')}
          className={`flex-1 py-2 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
            activeTab === 'SETTINGS'
              ? 'bg-white dark:bg-slate-800 text-brand-blue dark:text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <IconSettings className="w-4 h-4 text-slate-500" />
          <span>Service Details</span>
        </button>
      </div>

      {/* TAB 1: SERVICE RECIPE BUILDER */}
      {activeTab === 'RECIPE' && (
        <ServiceRecipeBuilder
          recipeItems={localTemplate.recipeItems || []}
          onChangeRecipe={handleRecipeChange}
          inventoryItems={inventoryItems}
          initialBundlePrice={localTemplate.bundlePrice}
          initialLaborMinutes={localTemplate.estimatedLaborMinutes}
        />
      )}

      {/* TAB 2: CUSTOM FORM FIELDS */}
      {activeTab === 'FIELDS' && (
        <div className="space-y-6">
          <Card title="Custom Service Form Fields">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Fields added here will be rendered in the Order Intake form when a technician or customer selects this service.
            </p>
            <div className="space-y-3">
              {(localTemplate.customFields || []).map(field => (
                <div key={field.id} className="flex items-end gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="flex-grow">
                    <Input
                      label={`Field Label (Type: ${field.type})`}
                      id={field.id}
                      value={field.label}
                      onChange={(e) => handleUpdateFieldLabel(field.id, e.target.value)}
                    />
                  </div>
                  <Button variant="danger" size="sm" onClick={() => handleRemoveField(field.id)} className="p-2 h-10 w-10 flex-shrink-0" aria-label={`Remove field ${field.label}`}>
                    <IconTrash className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {(localTemplate.customFields || []).length === 0 && (
                <div className="text-center text-slate-500 py-8 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  <p className="text-sm font-semibold">No custom fields defined yet.</p>
                  <p className="text-xs text-slate-400 mt-0.5">Click a button below to add custom fields to this service template.</p>
                </div>
              )}
            </div>
          </Card>

          <Card title="Add New Form Field">
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => handleAddField('TEXT')} variant="secondary" size="sm" className="text-xs font-bold">
                <IconPlus className="w-4 h-4 mr-1.5" /> Text Input
              </Button>
              <Button onClick={() => handleAddField('NUMBER')} variant="secondary" size="sm" className="text-xs font-bold">
                <IconPlus className="w-4 h-4 mr-1.5" /> Numeric Input
              </Button>
              <Button onClick={() => handleAddField('QUANTITY')} variant="secondary" size="sm" className="text-xs font-bold">
                <IconPlus className="w-4 h-4 mr-1.5" /> Quantity Picker
              </Button>
              <Button onClick={() => handleAddField('PHOTO')} variant="secondary" size="sm" className="text-xs font-bold">
                <IconPlus className="w-4 h-4 mr-1.5" /> Inspection Photo
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: SERVICE DETAILS & SETTINGS */}
      {activeTab === 'SETTINGS' && (
        <Card title="Service General Configuration">
          <div className="space-y-4 max-w-xl">
            <Input
              label="Service Name"
              id="templateName"
              value={localTemplate.name}
              onChange={e => setLocalTemplate(prev => ({ ...prev, name: e.target.value }))}
            />

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Description / Notes
              </label>
              <textarea
                rows={3}
                value={localTemplate.description || ''}
                onChange={e => setLocalTemplate(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of what is included in this service..."
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-accent/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Bundle Price (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={localTemplate.bundlePrice || 0}
                  onChange={e => setLocalTemplate(prev => ({ ...prev, bundlePrice: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-bold text-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Est. Labor Time (Mins)
                </label>
                <input
                  type="number"
                  min="5"
                  value={localTemplate.estimatedLaborMinutes || 30}
                  onChange={e => setLocalTemplate(prev => ({ ...prev, estimatedLaborMinutes: parseInt(e.target.value) || 30 }))}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-bold text-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localTemplate.isEnabled}
                  onChange={e => setLocalTemplate(prev => ({ ...prev, isEnabled: e.target.checked }))}
                  className="w-4 h-4 text-brand-accent rounded border-slate-300 focus:ring-brand-accent"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Enable Service in Order Intake Catalog
                </span>
              </label>
            </div>
          </div>
        </Card>
      )}

      {/* Footer Navigation */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
        <Button variant="ghost" onClick={onExit} className="text-xs">
          Back to Service List
        </Button>
        <Button onClick={handleSaveClick} className="bg-brand-blue hover:bg-brand-blue/90 text-white font-bold text-xs">
          <IconDeviceFloppy className="w-4 h-4 mr-1.5" /> Save Changes
        </Button>
      </div>
    </div>
  );
};

export default ServiceTemplateEditorPage;
