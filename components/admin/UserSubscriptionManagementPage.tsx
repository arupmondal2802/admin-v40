import React, { useState } from 'react';
import { UserSubscription, SubscriptionPlan } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { IconPlus, IconTrash } from '../ui/Icon';
import GoogleAddressAutocomplete from '../ui/GoogleAddressAutocomplete';

interface Props {
  userSubscriptions: UserSubscription[];
  subscriptionPlans: SubscriptionPlan[];
  onUpdateUserSubscriptions: (subs: UserSubscription[]) => void;
  onAutoSchedule: (subscription: UserSubscription) => void;
}

const UserSubscriptionManagementPage: React.FC<Props> = ({ userSubscriptions, subscriptionPlans, onUpdateUserSubscriptions, onAutoSchedule }) => {
  const [newSub, setNewSub] = useState({
    mobileNumber: '',
    planId: '',
    customerFirstName: '',
    customerLastName: '',
    streetAddress: '',
    carNumber: '',
    carBrandModel: '',
    customerEmail: '',
  });
  const [autoSchedule, setAutoSchedule] = useState(true);
  const [error, setError] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setNewSub(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleAddSubscription = () => {
    if (!newSub.mobileNumber || !newSub.planId || !newSub.customerFirstName || !newSub.carNumber) {
        setError('Mobile number, First Name, Car Number and a Plan selection are required.');
        return;
    }
    
    const plan = subscriptionPlans.find(p => p.id === newSub.planId);
    if (!plan) {
        setError('Selected plan is invalid.');
        return;
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setFullYear(startDate.getFullYear() + 1);

    const subscriptionToAdd: UserSubscription = {
      id: `usersub_${Date.now()}`,
      mobileNumber: newSub.mobileNumber,
      planId: newSub.planId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      washesRemaining: plan.totalWashes,
      customerFirstName: newSub.customerFirstName,
      customerLastName: newSub.customerLastName,
      streetAddress: newSub.streetAddress,
      carNumber: newSub.carNumber,
      carBrandModel: newSub.carBrandModel,
      customerEmail: newSub.customerEmail,
    };
    
    if (userSubscriptions.some(sub => sub.mobileNumber === subscriptionToAdd.mobileNumber)) {
        if (!window.confirm("This mobile number already has a subscription. Are you sure you want to add another one?")) {
            return;
        }
    }

    onUpdateUserSubscriptions([...userSubscriptions, subscriptionToAdd]);
    
    if (autoSchedule) {
      onAutoSchedule(subscriptionToAdd);
    }

    setNewSub({ mobileNumber: '', planId: '', customerFirstName: '', customerLastName: '', streetAddress: '', carNumber: '', carBrandModel: '', customerEmail: '' });
    setAutoSchedule(true);
  };
  
  const handleDeleteSubscription = (subId: string) => {
    if (window.confirm('Are you sure you want to delete this user subscription?')) {
        const updatedSubs = userSubscriptions.filter(s => s.id !== subId);
        onUpdateUserSubscriptions(updatedSubs);
    }
  };

  const getPlanDetails = (planId: string) => {
    return subscriptionPlans.find(p => p.id === planId);
  };

  return (
    <div className="space-y-8">
        <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Customer Subscriptions</h1>
        
        <Card title="Assign New Subscription">
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Customer First Name" name="customerFirstName" value={newSub.customerFirstName} onChange={handleInputChange} required />
                    <Input label="Customer Last Name" name="customerLastName" value={newSub.customerLastName} onChange={handleInputChange} />
                    <Input label="Customer Mobile Number" name="mobileNumber" type="tel" value={newSub.mobileNumber} onChange={handleInputChange} required />
                    <Input label="Customer Email (Optional)" name="customerEmail" type="email" value={newSub.customerEmail} onChange={handleInputChange} />
                    <GoogleAddressAutocomplete 
                      label="Street Address" 
                      value={newSub.streetAddress} 
                      onChange={(val) => setNewSub(prev => ({ ...prev, streetAddress: val }))} 
                      placeholder="Search street or area via Google Maps..."
                    />
                    <Input label="Car Number" name="carNumber" value={newSub.carNumber} onChange={handleInputChange} required />
                    <Input label="Car Brand & Model" name="carBrandModel" value={newSub.carBrandModel} onChange={handleInputChange} />
                </div>

                <div className="pt-4 border-t col-span-full">
                    <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={autoSchedule}
                            onChange={(e) => setAutoSchedule(e.target.checked)}
                            className="h-5 w-5 rounded border-gray-300 text-brand-accent focus:ring-brand-accent"
                        />
                        <span className="font-medium text-slate-700">Auto-schedule washes for the current month</span>
                    </label>
                    <p className="text-xs text-slate-500 ml-8">This will create queued appointments spread evenly across the month based on the plan.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end pt-4 border-t">
                    <div>
                        <label htmlFor="planId" className="block text-sm font-medium text-slate-700 mb-1">Select Plan</label>
                        <select id="planId" name="planId" value={newSub.planId} onChange={handleInputChange} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent sm:text-sm">
                            <option value="">-- Choose a plan --</option>
                            {subscriptionPlans.map(plan => (
                                <option key={plan.id} value={plan.id}>{plan.name} - {plan.vehicleCategory} (₹{plan.price})</option>
                            ))}
                        </select>
                    </div>
                    <Button onClick={handleAddSubscription}>
                        <IconPlus className="w-5 h-5 mr-2" />
                        Add Subscription
                    </Button>
                </div>
            </div>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </Card>
        
        <Card title="Active Subscriptions">
            <div className="overflow-x-auto hide-scrollbar">
              <div className="flow-root">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                        <tr>
                            <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-slate-900 sm:pl-6">Customer</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Plan</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Washes Left</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">End Date</th>
                            <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                          {userSubscriptions.map(sub => {
                              const plan = getPlanDetails(sub.planId);
                              return (
                                  <tr key={sub.id}>
                                      <td className="py-4 pl-4 pr-3 text-sm sm:pl-6 whitespace-nowrap">
                                          <div className="font-medium text-slate-900">{sub.customerFirstName} {sub.customerLastName}</div>
                                          <div className="text-slate-500">{sub.mobileNumber}</div>
                                          <div className="text-slate-500">{sub.carNumber}</div>
                                      </td>
                                      <td className="px-3 py-4 text-sm text-slate-500 whitespace-nowrap">
                                          {plan ? `${plan.name} (${plan.vehicleCategory})` : 'Unknown Plan'}
                                      </td>
                                      <td className="px-3 py-4 text-sm text-slate-500 font-bold">{sub.washesRemaining}</td>
                                      <td className="px-3 py-4 text-sm text-slate-500 whitespace-nowrap">{new Date(sub.endDate).toLocaleDateString()}</td>
                                      <td className="relative py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6 whitespace-nowrap">
                                          <Button variant="danger" size="sm" onClick={() => handleDeleteSubscription(sub.id)} title="Delete Subscription">
                                              <IconTrash className="w-4 h-4" />
                                          </Button>
                                      </td>
                                  </tr>
                              )
                          })}
                          {userSubscriptions.length === 0 && (
                              <tr>
                                  <td colSpan={5} className="text-center py-10 text-slate-500">No active user subscriptions found.</td>
                              </tr>
                          )}
                    </tbody>
                  </table>
              </div>
            </div>
        </Card>

    </div>
  );
};

export default UserSubscriptionManagementPage;