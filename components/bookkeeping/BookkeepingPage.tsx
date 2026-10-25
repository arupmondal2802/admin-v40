
import React, { useState, useMemo } from 'react';
import { User, MiscSpend, MiscSpendStatus, Permission, BookkeepingEntry, BookkeepingEntryType, SpendCategory } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import FileUpload from '../ui/FileUpload';
import { IconPlus, IconCheck } from '../ui/Icon';

// Props for the main page
interface BookkeepingPageProps {
    currentUser: User;
    miscSpends: MiscSpend[];
    users: Omit<User, 'password'>[];
    googleDriveUploadUrl: string;
    onSaveNewSpend: (spendData: Omit<MiscSpend, 'spendId' | 'userId' | 'timestamp' | 'status'>) => void;
    onUpdateSpendStatus: (spendId: string, status: MiscSpendStatus) => void;
    bookkeeping: BookkeepingEntry[];
    spendCategories: SpendCategory[];
}

// Props for the user's form to add a new spend
interface AddSpendFormProps {
    currentUser: User;
    googleDriveUploadUrl: string;
    onSave: (spendData: Omit<MiscSpend, 'spendId' | 'userId' | 'timestamp' | 'status'>) => void;
    spendCategories: SpendCategory[];
}

const KPIStatCard: React.FC<{ title: string; value: string; className?: string }> = ({ title, value, className = '' }) => (
    <div className={`p-4 rounded-lg ${className}`}>
        <p className="text-sm font-semibold uppercase tracking-wider">{title}</p>
        <p className="text-3xl font-bold">{value}</p>
    </div>
);

// The form for users to submit a new expense
const AddSpendForm: React.FC<AddSpendFormProps> = ({ currentUser, googleDriveUploadUrl, onSave, spendCategories }) => {
    const [spendType, setSpendType] = useState('');
    const [amount, setAmount] = useState<number | ''>('');
    const [receiptPhotoUrl, setReceiptPhotoUrl] = useState('');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = () => {
        if (!spendType || !amount || !receiptPhotoUrl) {
            setError('All fields, including a category and receipt photo, are required.');
            return;
        }
        setError('');
        onSave({ spendType, amount, receiptPhotoUrl, notes });
        // Reset form
        setSpendType('');
        setAmount('');
        setReceiptPhotoUrl('');
        setNotes('');
    };

    return (
        <Card title="Log a New Expense">
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="spendType" className="block text-sm font-medium text-slate-700 mb-1">Expense Category</label>
                        <select 
                            id="spendType" 
                            value={spendType} 
                            onChange={e => setSpendType(e.target.value)} 
                            className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-brand-accent sm:text-sm"
                        >
                            <option value="">-- Select Category --</option>
                            {spendCategories.map(cat => (
                                <option key={cat.id} value={cat.name}>{cat.name}</option>
                            ))}
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <Input label="Amount (₹)" id="amount" type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} />
                </div>
                 <textarea
                    id="notes"
                    name="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-brand-accent sm:text-sm"
                    placeholder="Add any additional notes or details about this expense..."
                />
                <FileUpload 
                    label="Receipt Photo"
                    uploadType="photo"
                    fileUrl={receiptPhotoUrl}
                    onUpload={setReceiptPhotoUrl}
                    carNumber={`spend-${currentUser.username}`} // Use a consistent folder name
                    uploadUrl={googleDriveUploadUrl}
                />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end">
                    <Button onClick={handleSubmit}>
                        <IconPlus className="w-5 h-5 mr-2" />
                        Log Expense
                    </Button>
                </div>
            </div>
        </Card>
    );
};

// The main component that decides which view to show
const BookkeepingPage: React.FC<BookkeepingPageProps> = (props) => {
    const { currentUser, miscSpends, onSaveNewSpend, onUpdateSpendStatus, googleDriveUploadUrl, users, bookkeeping, spendCategories } = props;
    const isAdminOrManager = currentUser.permissions.includes(Permission.CAN_MANAGE_BOOKKEEPING);

    // --- User-specific view ---
    if (!isAdminOrManager) {
        const mySpends = useMemo(() => {
            return miscSpends
                .filter(s => s.userId === currentUser.username)
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        }, [miscSpends, currentUser]);

        return (
            <div className="space-y-6">
                <h1 className="text-3xl font-bold text-slate-800 tracking-tight">My Expenses</h1>
                <AddSpendForm currentUser={currentUser} googleDriveUploadUrl={googleDriveUploadUrl} onSave={onSaveNewSpend} spendCategories={spendCategories} />
                <Card title="My Expense History">
                    {mySpends.length > 0 ? (
                        <ul className="space-y-3">
                            {mySpends.map(spend => (
                                <li key={spend.spendId} className="p-3 bg-slate-50 border rounded-lg flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                                    <div>
                                        <p className="font-semibold text-slate-800">{spend.spendType} - <span className="text-brand-accent">₹{spend.amount.toFixed(2)}</span></p>
                                        <p className="text-sm text-slate-500">{new Date(spend.timestamp).toLocaleString()}</p>
                                    </div>
                                    <div className="flex items-center space-x-3 self-end sm:self-center">
                                        {spend.receiptPhotoUrl && <a href={spend.receiptPhotoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm font-semibold">View Receipt</a>}
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${spend.status === MiscSpendStatus.Paid ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{spend.status}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="text-slate-500 text-center py-4">You have not logged any expenses yet.</p>}
                </Card>
            </div>
        );
    }
    
    // --- Admin/Manager view ---
    const [filters, setFilters] = useState({
        user: '',
        type: '',
        startDate: '',
        endDate: '',
    });

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const filteredBookkeeping = useMemo(() => {
        const startDate = filters.startDate ? new Date(filters.startDate) : null;
        if(startDate) startDate.setHours(0,0,0,0);

        const endDate = filters.endDate ? new Date(filters.endDate) : null;
        if(endDate) endDate.setHours(23,59,59,999);

        return bookkeeping
            .filter(b => {
                const entryDate = new Date(b.timestamp);
                const matchesUser = !filters.user || b.recordedBy === filters.user;
                const matchesType = !filters.type || b.type === filters.type;
                const matchesStartDate = !startDate || entryDate >= startDate;
                const matchesEndDate = !endDate || entryDate <= endDate;
                return matchesUser && matchesType && matchesStartDate && matchesEndDate;
            })
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [bookkeeping, filters]);
    
     const { totalIncome, totalExpense, netProfit } = useMemo(() => {
        let income = 0;
        let expense = 0;
        filteredBookkeeping.forEach(entry => {
            if (entry.type === BookkeepingEntryType.Income) {
                income += entry.amount;
            } else {
                expense += entry.amount;
            }
        });
        return { totalIncome: income, totalExpense: expense, netProfit: income - expense };
    }, [filteredBookkeeping]);


    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Bookkeeping</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KPIStatCard title="Total Income" value={`₹${totalIncome.toLocaleString('en-IN')}`} className="bg-green-100 text-green-800" />
                <KPIStatCard title="Total Expenses" value={`₹${totalExpense.toLocaleString('en-IN')}`} className="bg-red-100 text-red-800" />
                <KPIStatCard title="Net Profit / Loss" value={`₹${netProfit.toLocaleString('en-IN')}`} className={`${netProfit >= 0 ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`} />
            </div>

            <Card title="Filter Ledger">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Input label="From Date" name="startDate" type="date" value={filters.startDate} onChange={handleFilterChange} />
                    <Input label="To Date" name="endDate" type="date" value={filters.endDate} onChange={handleFilterChange} />
                    <div>
                        <label htmlFor="user" className="block text-sm font-medium text-slate-700 mb-1">User</label>
                        <select id="user" name="user" value={filters.user} onChange={handleFilterChange} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent sm:text-sm">
                            <option value="">All Users</option>
                            {users.map(u => <option key={u.username} value={u.username}>{u.username}</option>)}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="type" className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                        <select id="type" name="type" value={filters.type} onChange={handleFilterChange} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent sm:text-sm">
                            <option value="">All Types</option>
                            <option value={BookkeepingEntryType.Income}>Income</option>
                            <option value={BookkeepingEntryType.Expense}>Expense</option>
                        </select>
                    </div>
                </div>
            </Card>

            <Card>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Description</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Recorded By</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {filteredBookkeeping.map(entry => (
                                <tr key={entry.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{new Date(entry.timestamp).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${entry.type === BookkeepingEntryType.Income ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{entry.type}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{entry.description}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{entry.recordedBy}</td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-semibold ${entry.type === BookkeepingEntryType.Income ? 'text-green-600' : 'text-red-600'}`}>
                                        {entry.type === BookkeepingEntryType.Income ? '+' : '-'} ₹{entry.amount.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                             {filteredBookkeeping.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center py-10 text-slate-500">
                                        No bookkeeping records match the current filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
export default BookkeepingPage;
