

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Service, User } from '../../types';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { IconSearch, IconLoader } from '../ui/Icon';
import { AppointmentCard } from '../dashboard/AppointmentCard';

interface Props {
  submissions: Service[];
  currentUser: User;
  onShareOrder: (service: Service) => void;
  onRebookOrder?: (service: Service) => void;
}

interface CustomerProfile {
  details: {
    mobileNumber: string;
    firstName: string;
    lastName: string;
    streetAddress: string;
    carNumber: string;
    carBrandModel: string;
    customerEmail?: string;
  };
  services: Service[];
  totalSpent: number;
}

type SearchType = 'ALL' | 'NAME' | 'PHONE' | 'CAR' | 'ORDER';

const searchPlaceholders: Record<SearchType, string> = {
    ALL: 'e.g., John Doe, 9876543210, TS09...',
    NAME: 'e.g., John Doe...',
    PHONE: 'e.g., 9876543210...',
    CAR: 'e.g., TS09AB1234...',
    ORDER: 'e.g., 172051...', // Example based on timestamp IDs
};

const CustomerHistoryPage: React.FC<Props> = ({ submissions, currentUser, onShareOrder, onRebookOrder }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState<SearchType>('ALL');
  const [searchResults, setSearchResults] = useState<CustomerProfile[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchTimeoutRef = useRef<number | null>(null);

  const handleSearch = useCallback((term: string, type: SearchType) => {
    if (!term.trim()) {
      setSearchResults([]);
      setSelectedCustomer(null);
      setHasSearched(false);
      return;
    }

    const lowerCaseSearch = term.toLowerCase();
    
    const customerData = new Map<string, { latestTimestamp: string; services: Service[] }>();

    submissions.forEach(s => {
      // Safely convert potential numbers to strings before calling .toLowerCase()
      const name = `${s.customerFirstName} ${s.customerLastName}`.toLowerCase();
      const mobile = String(s.mobileNumber || '').toLowerCase();
      const carNumber = String(s.carNumber || '').toLowerCase();
      const appointmentId = (s.appointmentId || '').toLowerCase().split('-').pop() || '';

      let matches = false;
      switch (type) {
        case 'NAME':
          matches = name.includes(lowerCaseSearch);
          break;
        case 'PHONE':
          matches = mobile.includes(lowerCaseSearch);
          break;
        case 'CAR':
          matches = carNumber.includes(lowerCaseSearch);
          break;
        case 'ORDER':
          matches = appointmentId.includes(lowerCaseSearch);
          break;
        case 'ALL':
        default:
          matches = 
            name.includes(lowerCaseSearch) ||
            mobile.includes(lowerCaseSearch) ||
            carNumber.includes(lowerCaseSearch) ||
            appointmentId.includes(lowerCaseSearch);
          break;
      }
      
      if (matches) {
        if (!customerData.has(s.mobileNumber)) {
          customerData.set(s.mobileNumber, { latestTimestamp: '', services: [] });
        }
        const data = customerData.get(s.mobileNumber)!;
        data.services.push(s);
        if (s.timestamp > data.latestTimestamp) {
          data.latestTimestamp = s.timestamp;
        }
      }
    });

    const foundCustomers: CustomerProfile[] = Array.from(customerData.entries()).map(([mobile, data]) => {
      const latestService = data.services.find(s => s.timestamp === data.latestTimestamp)!;
      const sortedServices = data.services.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const totalSpent = sortedServices.reduce((sum, service) => sum + service.grandTotal, 0);

      return {
        details: {
          mobileNumber: mobile,
          firstName: latestService.customerFirstName,
          lastName: latestService.customerLastName,
          streetAddress: latestService.streetAddress,
          carNumber: latestService.carNumber,
          carBrandModel: latestService.carBrandModel,
          customerEmail: latestService.customerEmail,
        },
        services: sortedServices,
        totalSpent: totalSpent
      };
    });

    setSearchResults(foundCustomers);
    setSelectedCustomer(foundCustomers.length === 1 ? foundCustomers[0] : null);
    setHasSearched(true);
  }, [submissions]);

  useEffect(() => {
    // Debounce search input: Clear any previously scheduled search.
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const trimmedSearch = searchTerm.trim();
    setSelectedCustomer(null); // Reset selection on new search

    if (trimmedSearch.length < 3) {
      setSearchResults([]);
      setHasSearched(trimmedSearch.length > 0);
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    setHasSearched(true);

    // Set a new timeout to trigger the search after a 500ms pause in typing.
    searchTimeoutRef.current = window.setTimeout(() => {
      handleSearch(trimmedSearch, searchType);
      setIsSearching(false);
    }, 500); // 500ms debounce delay.

    // Cleanup function to clear the timeout if the component unmounts or dependencies change before the timeout fires.
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm, searchType, handleSearch]);

  const DetailItem: React.FC<{ label: string, value?: string | number }> = ({ label, value }) => (
    <div>
        <dt className="text-sm font-medium text-slate-500">{label}</dt>
        <dd className="text-base font-semibold text-slate-800 break-words">{value || 'N/A'}</dd>
    </div>
  );
  
  const getSearchFeedback = () => {
    const trimmedSearch = searchTerm.trim();
    if (isSearching) {
        return <span className="text-sm text-slate-500">Searching...</span>;
    }
    if (trimmedSearch.length > 0 && trimmedSearch.length < 3) {
        return <span className="text-sm text-slate-500">Type at least 3 characters to begin searching.</span>;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Customer Service History</h1>
      
      <Card>
        <div className="flex flex-col sm:flex-row items-end gap-4">
            <div className="w-full sm:w-48">
                <label htmlFor="search-type" className="block text-sm font-medium text-slate-700 mb-1">Search By</label>
                <select 
                    id="search-type" 
                    value={searchType} 
                    onChange={(e) => setSearchType(e.target.value as SearchType)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-brand-accent sm:text-sm"
                >
                    <option value="ALL">All Fields</option>
                    <option value="NAME">Name</option>
                    <option value="PHONE">Phone Number</option>
                    <option value="CAR">Car Number</option>
                    <option value="ORDER">Order ID</option>
                </select>
            </div>
          <div className="flex-grow">
              <Input
                label="Search Term"
                id="customer-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholders[searchType]}
                prefix={<IconSearch className="w-5 h-5 text-slate-400" />}
                suffix={isSearching ? <IconLoader className="w-5 h-5 text-slate-400 animate-spin" /> : undefined}
                autoComplete="off"
              />
          </div>
        </div>
        <div className="h-5 mt-1 px-1">{getSearchFeedback()}</div>
      </Card>

      {selectedCustomer ? (
        <div className="space-y-6">
            <Card title="Customer Details">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                    <DetailItem label="Name" value={`${selectedCustomer.details.firstName} ${selectedCustomer.details.lastName}`} />
                    <DetailItem label="Mobile" value={selectedCustomer.details.mobileNumber} />
                    <DetailItem label="Email" value={selectedCustomer.details.customerEmail} />
                    <DetailItem label="Car" value={`${selectedCustomer.details.carBrandModel} (${selectedCustomer.details.carNumber})`} />
                    <DetailItem label="Total Services" value={selectedCustomer.services.length} />
                    <DetailItem label="Lifetime Value" value={`₹${selectedCustomer.totalSpent.toLocaleString('en-IN')}`} />
                </div>
            </Card>
            <div className="flex justify-between items-center border-b pb-2">
                <h2 className="text-2xl font-bold text-slate-700 tracking-tight">Order History</h2>
                {searchResults.length > 1 && (
                     <Button variant="ghost" onClick={() => setSelectedCustomer(null)}>Back to Search Results</Button>
                )}
            </div>
            <div className="space-y-4">
                {selectedCustomer.services.map(service => (
                    <AppointmentCard key={service.submissionId} service={service} currentUser={currentUser} allSubmissions={submissions} onShareOrder={onShareOrder} onRebook={onRebookOrder} />
                ))}
            </div>
        </div>
      ) : searchResults.length > 0 ? (
        <Card title="Search Results">
          <p className="text-slate-600 mb-4">Found {searchResults.length} matching customer(s). Select one to view their history.</p>
          <div className="space-y-2">
            {searchResults.map(customer => (
                <button 
                    key={customer.details.mobileNumber} 
                    onClick={() => setSelectedCustomer(customer)}
                    className="w-full text-left p-3 bg-slate-50 hover:bg-slate-100 rounded-lg border"
                >
                    <p className="font-semibold">{customer.details.firstName} {customer.details.lastName}</p>
                    <p className="text-sm text-slate-500">{customer.details.mobileNumber} - {customer.details.carNumber}</p>
                </button>
            ))}
          </div>
        </Card>
      ) : hasSearched && !isSearching ? (
        <Card>
            <p className="text-center text-slate-500 py-8">No customers found matching your search term.</p>
        </Card>
      ) : !hasSearched && !isSearching ? (
        <Card>
            <p className="text-center text-slate-500 py-8">Search for a customer to see their complete service history.</p>
        </Card>
      ) : null}
    </div>
  );
};

export default CustomerHistoryPage;
