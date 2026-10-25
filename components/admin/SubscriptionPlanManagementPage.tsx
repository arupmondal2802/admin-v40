import React, { useState } from 'react';
import { SubscriptionPlan, VehicleCategory, PlanName } from '../../types';
import { VEHICLE_CATEGORIES, PLAN_NAMES, ALL_PLAN_FEATURES, WASH_TYPES } from '../../constants';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { IconPlus, IconPencil, IconTrash } from '../ui/Icon';

interface Props {
  plans: SubscriptionPlan[];
  onUpdatePlans: (plans: SubscriptionPlan[]) => void;
}

const SubscriptionPlanManagementPage: React.FC<Props> = ({ plans, onUpdatePlans }) => {
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleSave = (planToSave: SubscriptionPlan) => {
    const existingIndex = plans.findIndex(p => p.id === planToSave.id);
    let updatedPlans;
    if (existingIndex > -1) {
      updatedPlans = plans.map(p => (p.id === planToSave.id ? planToSave : p));
    } else {
      updatedPlans = [...plans, planToSave];
    }
    onUpdatePlans(updatedPlans);
    setEditingPlan(null);
    setIsCreating(false);
  };

  const handleDelete = (planId: string) => {
    if (window.confirm('Are you sure you want to delete this plan? This cannot be undone.')) {
        const updatedPlans = plans.filter(p => p.id !== planId);
        onUpdatePlans(updatedPlans);
    }
  };

  const startCreating = () => {
    const newId = `plan_${Date.now()}`;
    setEditingPlan({
        id: newId,
        name: PlanName.Eco,
        vehicleCategory: VehicleCategory.Hatchback,
        price: 0,
        totalWashes: 0,
        features: [],
        washType: WASH_TYPES[0] || '',
    });
    setIsCreating(true);
  };
  
  const PlanEditor: React.FC<{ plan: SubscriptionPlan, onSave: (plan: SubscriptionPlan) => void, onCancel: () => void }> = ({ plan, onSave, onCancel }) => {
    const [localPlan, setLocalPlan] = useState(plan);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setLocalPlan(prev => ({ ...prev, [name]: name === 'price' || name === 'totalWashes' ? Number(value) : value }));
    };

    const handleFeatureChange = (feature: string) => {
        const currentFeatures = Array.isArray(localPlan.features) ? localPlan.features : [];
        const newFeatures = currentFeatures.includes(feature)
            ? currentFeatures.filter(f => f !== feature)
            : [...currentFeatures, feature];
        setLocalPlan(prev => ({ ...prev, features: newFeatures }));
    };
    
    return (
      <Card title={isCreating ? "Create New Plan" : "Edit Plan"} className="mt-6">
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div>
                    <label htmlFor="vehicleCategory" className="block text-sm font-medium text-slate-700 mb-1">Vehicle Category</label>
                    <select id="vehicleCategory" name="vehicleCategory" value={localPlan.vehicleCategory} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-brand-accent sm:text-sm">
                        {VEHICLE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                 </div>
                 <div>
                    <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">Plan Name</label>
                    <select id="name" name="name" value={localPlan.name} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-brand-accent sm:text-sm">
                        {PLAN_NAMES.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                 </div>
                 <div>
                    <label htmlFor="washType" className="block text-sm font-medium text-slate-700 mb-1">Predefined Car Wash Type</label>
                    <select id="washType" name="washType" value={localPlan.washType || ''} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-brand-accent sm:text-sm">
                        <option value="">-- Choose Predefined Wash Type --</option>
                        {WASH_TYPES.map(wash => <option key={wash} value={wash}>{wash}</option>)}
                    </select>
                 </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Price (₹)" id="price" name="price" type="number" value={localPlan.price} onChange={handleChange} />
                <Input label="Total Washes" id="totalWashes" name="totalWashes" type="number" value={localPlan.totalWashes} onChange={handleChange} />
            </div>
            <div>
                <h4 className="font-semibold text-slate-700 mb-2">Features</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ALL_PLAN_FEATURES.map(feature => (
                        <label key={feature} className="flex items-center space-x-2 p-2 bg-slate-100 rounded-md cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={Array.isArray(localPlan.features) && localPlan.features.includes(feature)} 
                                onChange={() => handleFeatureChange(feature)} 
                                className="h-4 w-4 rounded border-gray-300 text-brand-accent focus:ring-brand-accent" 
                            />
                            <span className="text-sm text-slate-800">{feature}</span>
                        </label>
                    ))}
                </div>
            </div>
        </div>
        <div className="mt-6 flex justify-end space-x-2">
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button onClick={() => onSave(localPlan)}>Save Plan</Button>
        </div>
      </Card>
    );
  };
  
  const plansByCategory = plans.reduce((acc, plan) => {
    (acc[plan.vehicleCategory] = acc[plan.vehicleCategory] || []).push(plan);
    return acc;
  }, {} as Record<VehicleCategory, SubscriptionPlan[]>);

  return (
    <div className="space-y-8">
        <div className="flex justify-between items-center">
             <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Manage Subscription Plans</h1>
             <Button onClick={startCreating} disabled={!!editingPlan}>
                <IconPlus className="w-5 h-5 mr-2" />
                Create New Plan
             </Button>
        </div>
        
        {editingPlan && <PlanEditor plan={editingPlan} onSave={handleSave} onCancel={() => { setEditingPlan(null); setIsCreating(false); }} />}

        <div className="space-y-6">
            {VEHICLE_CATEGORIES.map(category => (
                <Card key={category} title={`${category} Plans`}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {(plansByCategory[category] || []).map(plan => (
                            <div key={plan.id} className="p-4 bg-slate-50 rounded-lg border">
                                <div className="flex justify-between items-start">
                                    <h3 className="font-bold text-lg text-brand-blue">{plan.name}</h3>
                                    <div className="space-x-2 flex-shrink-0">
                                        <Button variant="ghost" size="sm" className="p-1 h-8 w-8" onClick={() => setEditingPlan(plan)}><IconPencil className="w-4 h-4" /></Button>
                                        <Button variant="danger" size="sm" className="p-1 h-8 w-8" onClick={() => handleDelete(plan.id)}><IconTrash className="w-4 h-4" /></Button>
                                    </div>
                                </div>
                                <p className="text-2xl font-bold text-slate-800 mt-2">₹{plan.price}</p>
                                <p className="text-sm text-slate-600">{plan.totalWashes} Washes ({plan.washType || 'Any type'})</p>
                                <ul className="mt-4 space-y-1 text-sm text-slate-700 list-disc list-inside">
                                    {plan.features.map(f => <li key={f}>{f}</li>)}
                                </ul>
                            </div>
                        ))}
                        {(plansByCategory[category] || []).length === 0 && <p className="text-slate-500">No plans defined for this category.</p>}
                    </div>
                </Card>
            ))}
        </div>
    </div>
  );
};

export default SubscriptionPlanManagementPage;
