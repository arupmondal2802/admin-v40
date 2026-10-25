import React, { useState, useMemo, useCallback } from 'react';
import { 
  LayoutDashboard, TrendingUp, DollarSign, CreditCard, ShoppingBag, 
  Truck, FileText, ChevronRight, Plus, RefreshCw, Layers, 
  CheckCircle, AlertTriangle, User, Calendar, Check, X, 
  Printer, Download, Eye, BookOpen, Sparkles, Building, 
  Briefcase, Percent, ShieldAlert
} from 'lucide-react';
import { 
  Service, ServiceStatus, ExpenseItem, SpendCategory, CustomerBookEntry, 
  InventoryItem, ErpSalesDocument, ErpPurchaseOrder, ErpSupplier, ErpServiceRecipe
} from '../../types';
import SkeletonLoader from '../ui/SkeletonLoader';

interface ErpManagementPageProps {
  isLoading?: boolean;
  isHydrated?: boolean;
  submissions: Service[];
  expenses: ExpenseItem[];
  spendCategories: SpendCategory[];
  customerBook: CustomerBookEntry[];
  inventoryItems: InventoryItem[];
}

export const ErpManagementPage: React.FC<ErpManagementPageProps> = (props) => {
  const {
    submissions = [],
    expenses = [],
    spendCategories = [],
    customerBook = [],
    inventoryItems = [],
    isLoading,
    isHydrated
  } = props;

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'SELL' | 'PURCHASE' | 'EXPENSE' | 'REPORTS'>('DASHBOARD');

  // Local ERP Simulated State for interactive updates
  const [salesDocs, setSalesDocs] = useState<ErpSalesDocument[]>(() => {
    // Generate sales documents only from real, non-deleted completed submissions
    const completedSubmissions = submissions.filter(
      sub => !sub.isDeleted && sub.status === ServiceStatus.Completed
    );
    return completedSubmissions.map((sub, idx) => {
      const subTotal = sub.grandTotal / 1.18;
      const gstTotal = sub.grandTotal - subTotal;
      return {
        id: `INV-2026-${1000 + idx}`,
        customerId: sub.mobileNumber,
        customerName: `${sub.customerFirstName} ${sub.customerLastName}`,
        customerPhone: sub.mobileNumber,
        vehicleRegNumber: sub.carNumber,
        vehicleBrandModel: sub.carBrandModel,
        date: sub.timestamp ? sub.timestamp.split('T')[0] : '2026-07-18',
        type: 'Invoice',
        status: 'Paid',
        items: [
          {
            id: `ITEM-${idx}-1`,
            description: sub.serviceSelection[0] || 'Premium Car Wash',
            quantity: 1,
            unitPrice: subTotal,
            gstRate: 18,
            taxableValue: subTotal,
            cgstAmount: gstTotal / 2,
            sgstAmount: gstTotal / 2,
            totalAmount: sub.grandTotal
          }
        ],
        subTotal,
        discountTotal: 0,
        cgstTotal: gstTotal / 2,
        sgstTotal: gstTotal / 2,
        grandTotal: sub.grandTotal,
        paymentMode: (sub.paymentMode === 'Cash' ? 'Cash' : sub.paymentMode === 'Online' ? 'UPI' : 'Split') as 'Cash' | 'Bank' | 'UPI' | 'Split',
        amountPaid: sub.grandTotal,
        outstandingBalance: 0,
        notes: 'Generated from completed digital booking.'
      };
    });
  });

  const [suppliers, setSuppliers] = useState<ErpSupplier[]>([]);

  const [purchaseOrders, setPurchaseOrders] = useState<ErpPurchaseOrder[]>([]);

  // Chemical recipes definition mapping
  const [recipes] = useState<ErpServiceRecipe[]>([]);

  // Inventory master mapping (no fallback mock inventory)
  const masterInventory = useMemo(() => {
    if (inventoryItems && inventoryItems.length > 0) return inventoryItems;
    return [];
  }, [inventoryItems]);

  // Financial Balances (Simulated Ledger)
  const balances = useMemo(() => {
    const totalSalesPaid = salesDocs
      .filter(d => d.status === 'Paid')
      .reduce((sum, d) => sum + d.amountPaid, 0);

    const totalExpensesPaid = expenses
      .filter(e => e.status === 'Approved')
      .reduce((sum, e) => sum + e.amount, 0);

    const baseCash = 0;
    const baseBank = 0;
    const baseUpi = 0;

    // Distribute remaining balances
    return {
      cashInHand: Math.max(0, baseCash + (totalSalesPaid * 0.2) - (totalExpensesPaid * 0.3)),
      bankBalance: Math.max(0, baseBank + (totalSalesPaid * 0.3) - (totalExpensesPaid * 0.5)),
      upiBalance: Math.max(0, baseUpi + (totalSalesPaid * 0.5) - (totalExpensesPaid * 0.2)),
      outstandingReceivables: salesDocs.reduce((sum, d) => sum + d.outstandingBalance, 0),
      outstandingPayables: suppliers.reduce((sum, s) => sum + s.outstandingPayable, 0)
    };
  }, [salesDocs, expenses, suppliers]);

  // Modal states for creating sales / purchase / suppliers
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [newSaleCustomer, setNewSaleCustomer] = useState('');
  const [newSalePhone, setNewSalePhone] = useState('');
  const [newSaleCar, setNewSaleCar] = useState('');
  const [newSaleItem, setNewSaleItem] = useState('Premium Car Detailing');
  const [newSalePrice, setNewSalePrice] = useState('1500');
  const [newSaleDiscount, setNewSaleDiscount] = useState('5');
  const [newSalePaymentMode, setNewSalePaymentMode] = useState<'Cash' | 'Bank' | 'UPI'>('UPI');

  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseSupplier, setPurchaseSupplier] = useState('SPL-001');
  const [purchaseItemName, setPurchaseItemName] = useState('Rubbing Compound Polish');
  const [purchaseQty, setPurchaseQty] = useState('10');
  const [purchaseUnitCost, setPurchaseUnitCost] = useState('600');

  const [selectedReportDoc, setSelectedReportDoc] = useState<ErpSalesDocument | null>(null);

  // Handlers for simulator actions
  const handleCreateSale = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = parseFloat(newSalePrice) || 0;
    const discountPct = parseFloat(newSaleDiscount) || 0;
    const discountAmount = priceNum * (discountPct / 100);
    const taxable = priceNum - discountAmount;
    const cgst = taxable * 0.09;
    const sgst = taxable * 0.09;
    const grand = taxable + cgst + sgst;

    const newDoc: ErpSalesDocument = {
      id: `INV-2026-${1000 + salesDocs.length + 1}`,
      customerId: newSalePhone || 'walkin',
      customerName: newSaleCustomer || 'Walk-in Customer',
      customerPhone: newSalePhone || 'N/A',
      vehicleRegNumber: newSaleCar || 'N/A',
      vehicleBrandModel: 'Premium Segment Vehicle',
      date: new Date().toISOString().split('T')[0],
      type: 'Invoice',
      status: 'Paid',
      items: [
        {
          id: `ITEM-NEW-${Date.now()}`,
          description: newSaleItem,
          quantity: 1,
          unitPrice: priceNum,
          discountPercentage: discountPct,
          gstRate: 18,
          taxableValue: taxable,
          cgstAmount: cgst,
          sgstAmount: sgst,
          totalAmount: grand
        }
      ],
      subTotal: taxable,
      discountTotal: discountAmount,
      cgstTotal: cgst,
      sgstTotal: sgst,
      grandTotal: grand,
      paymentMode: newSalePaymentMode,
      cashReceived: newSalePaymentMode === 'Cash' ? grand : 0,
      bankReceived: newSalePaymentMode === 'Bank' ? grand : 0,
      upiReceived: newSalePaymentMode === 'UPI' ? grand : 0,
      amountPaid: grand,
      outstandingBalance: 0,
      notes: 'Issued instantly from Cash Counter.'
    };

    setSalesDocs(prev => [newDoc, ...prev]);
    setShowSalesModal(false);
    // Reset form
    setNewSaleCustomer('');
    setNewSalePhone('');
    setNewSaleCar('');
    setNewSalePrice('1500');
    setNewSaleDiscount('5');
  }, [salesDocs, newSaleCustomer, newSalePhone, newSaleCar, newSaleItem, newSalePrice, newSaleDiscount, newSalePaymentMode]);

  const handleCreatePurchase = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const qtyNum = parseInt(purchaseQty) || 0;
    const costNum = parseFloat(purchaseUnitCost) || 0;
    const sub = qtyNum * costNum;
    const tax = sub * 0.18; // 18% standard IGST
    const total = sub + tax;

    const supplierObj = suppliers.find(s => s.id === purchaseSupplier);
    const supplierName = supplierObj ? supplierObj.name : 'Unknown';

    const newPO: ErpPurchaseOrder = {
      id: `PO-2026-${100 + purchaseOrders.length + 1}`,
      supplierId: purchaseSupplier,
      supplierName,
      orderDate: new Date().toISOString().split('T')[0],
      status: 'Received',
      receivedDate: new Date().toISOString().split('T')[0],
      items: [
        { itemId: `ITM-M-${Date.now()}`, name: purchaseItemName, quantityOrdered: qtyNum, quantityReceived: qtyNum, unitCost: costNum, totalCost: sub }
      ],
      subTotal: sub,
      taxAmount: tax,
      totalAmount: total,
      paymentMode: 'Bank',
      amountPaid: total,
      outstandingBalance: 0
    };

    setPurchaseOrders(prev => [newPO, ...prev]);
    setShowPurchaseModal(false);
  }, [purchaseOrders, suppliers, purchaseSupplier, purchaseItemName, purchaseQty, purchaseUnitCost]);

  // Aggregate stats
  const activeJobsCount = submissions.filter(s => s.status !== 'Completed' && s.status !== 'Draft' && !s.isDeleted).length;
  const completedJobsCount = submissions.filter(s => s.status === 'Completed' && !s.isDeleted).length;
  const lowStockItems = masterInventory.filter(item => item.stock <= item.minStock);

  if (isLoading || isHydrated === false || !submissions) {
    return <SkeletonLoader view="ERP" />;
  }

  return (
    <div className="w-full space-y-6 animate-fadeIn pb-12 px-2 md:px-4">
      {/* Upper header section */}
      <div className="bg-[#0b1e36] text-white p-6 rounded-2xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden border border-white/10">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <BookOpen className="w-48 h-48 text-brand-accent" />
        </div>
        <div className="space-y-1.5 z-10">
          <div className="flex items-center gap-2">
            <span className="bg-brand-accent text-brand-blue text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
              Automotive ERP Suite
            </span>
            <span className="text-xs text-slate-400 font-semibold">• v1.5 Engine</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white uppercase leading-none">
            A BIG ENGINE <span className="text-brand-accent">ERP CONTROL PANEL</span>
          </h1>
          <p className="text-xs text-slate-300 font-medium max-w-2xl leading-relaxed">
            Consolidated planning portal for multi-tier automotive operations. Real-time metrics mapping CRM profiles, chemical recipes, procurement pipelines, GST taxes, and automated outstanding ledger tracking.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap z-10 shrink-0">
          <button 
            onClick={() => setActiveTab('DASHBOARD')}
            className={`px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${activeTab === 'DASHBOARD' ? 'bg-brand-accent text-brand-blue font-extrabold shadow-md' : 'bg-white/10 text-slate-300 hover:bg-white/15'}`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('SELL')}
            className={`px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${activeTab === 'SELL' ? 'bg-brand-accent text-brand-blue font-extrabold shadow-md' : 'bg-white/10 text-slate-300 hover:bg-white/15'}`}
          >
            <DollarSign className="w-4 h-4" />
            Sell (Sales)
          </button>
          <button 
            onClick={() => setActiveTab('PURCHASE')}
            className={`px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${activeTab === 'PURCHASE' ? 'bg-brand-accent text-brand-blue font-extrabold shadow-md' : 'bg-white/10 text-slate-300 hover:bg-white/15'}`}
          >
            <ShoppingBag className="w-4 h-4" />
            Purchase
          </button>
          <button 
            onClick={() => setActiveTab('EXPENSE')}
            className={`px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${activeTab === 'EXPENSE' ? 'bg-brand-accent text-brand-blue font-extrabold shadow-md' : 'bg-white/10 text-slate-300 hover:bg-white/15'}`}
          >
            <Layers className="w-4 h-4" />
            Expenses
          </button>
          <button 
            onClick={() => setActiveTab('REPORTS')}
            className={`px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${activeTab === 'REPORTS' ? 'bg-brand-accent text-brand-blue font-extrabold shadow-md' : 'bg-white/10 text-slate-300 hover:bg-white/15'}`}
          >
            <FileText className="w-4 h-4" />
            Reports Hub
          </button>
        </div>
      </div>

      {/* CORE ERP SECTIONS */}
      {activeTab === 'DASHBOARD' && (
        <div className="space-y-6">
          {/* Executive Row 1: Financial Ledger */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Today's Sales (Gross)</p>
              <p className="text-2xl font-black text-slate-900 mt-1">₹{(salesDocs.slice(0, 2).reduce((sum, d) => sum + d.grandTotal, 0)).toLocaleString()}</p>
              <div className="flex items-center gap-1 text-emerald-600 text-xs font-bold mt-2">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>+12.4% vs yesterday</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Outstanding Receivables</p>
              <p className="text-2xl font-black text-amber-600 mt-1">₹{balances.outstandingReceivables.toLocaleString()}</p>
              <p className="text-[10px] text-slate-500 font-semibold mt-2">Awaiting customer checkout payments</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Monthly Spend Ledger</p>
              <p className="text-2xl font-black text-red-600 mt-1">₹{(expenses.reduce((sum, e) => sum + e.amount, 0)).toLocaleString()}</p>
              <p className="text-[10px] text-slate-500 font-semibold mt-2">Recorded overheads & supplier orders</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Outstanding Payables</p>
              <p className="text-2xl font-black text-red-700 mt-1">₹{balances.outstandingPayables.toLocaleString()}</p>
              <p className="text-[10px] text-slate-500 font-semibold mt-2">Awaiting supplier bank settlement</p>
            </div>
          </div>

          {/* Executive Row 2: Asset Balances */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
            <h3 className="text-xs font-black text-slate-600 uppercase tracking-wider mb-4">Consolidated Liquid Cash Assets</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-150 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Cash in Hand</p>
                  <p className="text-lg font-extrabold text-slate-800 mt-1">₹{balances.cashInHand.toLocaleString()}</p>
                </div>
                <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><DollarSign className="w-5 h-5" /></span>
              </div>
              <div className="bg-white border border-slate-150 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">HDFC Current Account</p>
                  <p className="text-lg font-extrabold text-slate-800 mt-1">₹{balances.bankBalance.toLocaleString()}</p>
                </div>
                <span className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Building className="w-5 h-5" /></span>
              </div>
              <div className="bg-white border border-slate-150 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">GPay UPI Gateway</p>
                  <p className="text-lg font-extrabold text-slate-800 mt-1">₹{balances.upiBalance.toLocaleString()}</p>
                </div>
                <span className="p-2 bg-purple-50 text-purple-600 rounded-lg"><CreditCard className="w-5 h-5" /></span>
              </div>
            </div>
          </div>

          {/* Row 3: Operations & Inventory alert cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Operational stats */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">Operational Queues</h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-indigo-50/50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                    <span className="text-xs font-bold text-slate-700">Active Job Cards</span>
                  </div>
                  <span className="text-xs font-black text-slate-900">{activeJobsCount} Jobs</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-emerald-50/50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span className="text-xs font-bold text-slate-700">Completed Deliveries</span>
                  </div>
                  <span className="text-xs font-black text-slate-900">{completedJobsCount} Jobs</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-teal-50/50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span>
                    <span className="text-xs font-bold text-slate-700">Technician Availability</span>
                  </div>
                  <span className="text-xs font-black text-slate-900">4 Active / 2 On Break</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                    <span className="text-xs font-bold text-slate-700">CRM Profiles Managed</span>
                  </div>
                  <span className="text-xs font-black text-slate-900">{customerBook.length || 12} Contacts</span>
                </div>
              </div>
            </div>

            {/* Inventory Valuation & Alerts */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 col-span-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">Inventory Master & Reorder Level</h3>
                <span className="bg-red-50 text-red-700 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 uppercase">
                  <AlertTriangle className="w-3 h-3" />
                  {lowStockItems.length} Low Stock Alerts
                </span>
              </div>

              {/* Alert items list */}
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {masterInventory.map(item => {
                  const isLow = item.stock <= item.minStock;
                  return (
                    <div key={item.id} className={`flex items-center justify-between p-2.5 rounded-xl border text-xs ${isLow ? 'bg-red-50/40 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                      <div>
                        <p className="font-bold text-slate-800">{item.name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Average Cost: ₹{item.costPerUnit?.toLocaleString() || '0'} per {item.unit}</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-black ${isLow ? 'text-red-700' : 'text-slate-800'}`}>{item.stock} / {item.minStock} {item.unit}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">Reorder Limit</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Daily performance SVG custom charts bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-3">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">Weekly Ingestion Chart (Sales vs. Procurement Expenses)</h3>
            <div className="h-44 w-full flex items-end gap-3 pt-6 pb-2 px-4 border-b border-slate-100">
              {/* Day bars */}
              {[
                { day: 'Mon', sales: 12000, cost: 4500 },
                { day: 'Tue', sales: 18500, cost: 6200 },
                { day: 'Wed', sales: 14000, cost: 11000 },
                { day: 'Thu', sales: 22000, cost: 5000 },
                { day: 'Fri', sales: 29000, cost: 18000 },
                { day: 'Sat', sales: 35000, cost: 9500 },
                { day: 'Sun', sales: 26000, cost: 4000 }
              ].map((item, idx) => {
                const maxVal = 40000;
                const salesHeight = (item.sales / maxVal) * 100;
                const costHeight = (item.cost / maxVal) * 100;

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer relative">
                    {/* Tooltip */}
                    <div className="absolute -top-10 bg-[#071629] text-white text-[10px] p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none text-center shadow-lg whitespace-nowrap">
                      <p className="font-extrabold text-brand-accent">Sales: ₹{item.sales.toLocaleString()}</p>
                      <p className="text-slate-300">Cost: ₹{item.cost.toLocaleString()}</p>
                    </div>

                    <div className="flex items-end gap-1.5 w-full h-full justify-center">
                      <div className="w-4 bg-brand-blue rounded-t" style={{ height: `${salesHeight}%` }}></div>
                      <div className="w-4 bg-red-400 rounded-t" style={{ height: `${costHeight}%` }}></div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 mt-2">{item.day}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 text-xs font-bold text-slate-600 justify-end">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-brand-blue rounded"></span>Sales Revenue</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-red-400 rounded"></span>Overhead Cost</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'SELL' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="space-y-0.5">
              <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Active Invoices & Quotations</h2>
              <p className="text-xs text-slate-500 font-medium">Generate professional invoices with multi-items and automated GST compliance calculations.</p>
            </div>
            <button
              onClick={() => setShowSalesModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-black rounded-xl shadow-md transition-all active:scale-95 uppercase tracking-wider cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New Sales Invoice
            </button>
          </div>

          {/* Quick Creator Modal Overlay */}
          {showSalesModal && (
            <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 my-4 sm:my-8 animate-scaleIn space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-wider">Issue Sales Invoice</h3>
                  <button onClick={() => setShowSalesModal(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-500">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleCreateSale} className="space-y-3.5 text-xs text-slate-700">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-extrabold text-slate-600">Customer Name</label>
                      <input 
                        type="text" 
                        required 
                        placeholder="John Doe" 
                        value={newSaleCustomer} 
                        onChange={(e) => setNewSaleCustomer(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 font-semibold text-slate-800"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-extrabold text-slate-600">Mobile Phone</label>
                      <input 
                        type="tel" 
                        required 
                        placeholder="+91 98765 43210" 
                        value={newSalePhone} 
                        onChange={(e) => setNewSalePhone(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 font-semibold text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-extrabold text-slate-600">Car Registration #</label>
                      <input 
                        type="text" 
                        required 
                        placeholder="DL 3C AB 1234" 
                        value={newSaleCar} 
                        onChange={(e) => setNewSaleCar(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 font-semibold text-slate-800 uppercase font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-extrabold text-slate-600">Selected Item / Service</label>
                      <select 
                        value={newSaleItem} 
                        onChange={(e) => setNewSaleItem(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 font-bold text-slate-800"
                      >
                        <option value="Standard Wash & Clean">Standard Wash & Clean</option>
                        <option value="Premium Wax Detailing">Premium Wax Detailing</option>
                        <option value="Tyre Rotation & Balancing">Tyre Rotation & Balancing</option>
                        <option value="Amaron Battery Replacement">Amaron Battery Replacement</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="font-extrabold text-slate-600">Price (₹)</label>
                      <input 
                        type="number" 
                        required 
                        value={newSalePrice} 
                        onChange={(e) => setNewSalePrice(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 font-semibold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-extrabold text-slate-600">Discount (%)</label>
                      <input 
                        type="number" 
                        value={newSaleDiscount} 
                        onChange={(e) => setNewSaleDiscount(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 font-semibold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-extrabold text-slate-600">Payment Mode</label>
                      <select 
                        value={newSalePaymentMode} 
                        onChange={(e) => setNewSalePaymentMode(e.target.value as any)}
                        className="w-full border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 font-bold"
                      >
                        <option value="Cash">Cash</option>
                        <option value="Bank">Bank Account</option>
                        <option value="UPI">UPI Gateway</option>
                      </select>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 space-y-1.5 font-semibold text-[11px] text-slate-600">
                    <div className="flex justify-between">
                      <span>Sub-total (Excl. Tax):</span>
                      <span>₹{(parseFloat(newSalePrice) - (parseFloat(newSalePrice) * (parseFloat(newSaleDiscount) / 100))).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>GST (18% Multi-tier CGST+SGST):</span>
                      <span>₹{((parseFloat(newSalePrice) - (parseFloat(newSalePrice) * (parseFloat(newSaleDiscount) / 100))) * 0.18).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-black text-slate-900 border-t border-slate-200 pt-1.5 text-xs">
                      <span>Grand Total Bill Amount:</span>
                      <span>₹{((parseFloat(newSalePrice) - (parseFloat(newSalePrice) * (parseFloat(newSaleDiscount) / 100))) * 1.18).toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button 
                      type="button" 
                      onClick={() => setShowSalesModal(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 font-bold rounded-xl"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow"
                    >
                      Issue Invoice
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Active sales invoices lists */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-150 flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-600 uppercase tracking-wider">Sales Ledger Statements</h3>
              <span className="text-[10px] font-bold text-slate-500">Showing {salesDocs.length} entries</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-150 bg-slate-50/50 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                    <th className="p-4">Doc ID</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Vehicle</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Type</th>
                    <th className="p-4 text-right">Taxable</th>
                    <th className="p-4 text-right">CGST+SGST</th>
                    <th className="p-4 text-right">Total (Incl GST)</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {salesDocs.map(doc => (
                    <tr key={doc.id} className="hover:bg-slate-50 transition-all">
                      <td className="p-4 font-black text-slate-800 font-mono">{doc.id}</td>
                      <td className="p-4">
                        <div>
                          <p className="font-bold text-slate-900">{doc.customerName}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{doc.customerPhone}</p>
                        </div>
                      </td>
                      <td className="p-4">
                        <div>
                          <p className="text-slate-800 font-bold">{doc.vehicleRegNumber}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{doc.vehicleBrandModel}</p>
                        </div>
                      </td>
                      <td className="p-4 text-slate-600">{doc.date}</td>
                      <td className="p-4">
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded uppercase ${doc.type === 'Invoice' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : doc.type === 'Quotation' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                          {doc.type}
                        </span>
                      </td>
                      <td className="p-4 text-right text-slate-700">₹{doc.subTotal.toFixed(2)}</td>
                      <td className="p-4 text-right text-slate-500">₹{(doc.cgstTotal + doc.sgstTotal).toFixed(2)}</td>
                      <td className="p-4 text-right font-black text-slate-900">₹{doc.grandTotal.toFixed(2)}</td>
                      <td className="p-4 text-center">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${doc.status === 'Paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {doc.status}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <button 
                          onClick={() => {
                            setSelectedReportDoc(doc);
                            setActiveTab('REPORTS');
                          }}
                          className="p-1 hover:bg-slate-100 rounded text-indigo-600 inline-flex items-center gap-1"
                          title="Print Document"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'PURCHASE' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="space-y-0.5">
              <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Supplier Procurement & Stock-In</h2>
              <p className="text-xs text-slate-500 font-medium">Record chemical replenishment and spare shipments. Maintain strict audit logs of purchase bills and outstandings.</p>
            </div>
            <button
              onClick={() => setShowPurchaseModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md transition-all active:scale-95 uppercase tracking-wider cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New Stock Purchase
            </button>
          </div>

          {/* New purchase modal */}
          {showPurchaseModal && (
            <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 my-4 sm:my-8 animate-scaleIn space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-wider">Purchase Stock Replenishment</h3>
                  <button onClick={() => setShowPurchaseModal(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-500">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleCreatePurchase} className="space-y-3.5 text-xs text-slate-700">
                  <div className="space-y-1">
                    <label className="font-extrabold text-slate-600">Select Supplier</label>
                    <select
                      value={purchaseSupplier}
                      onChange={(e) => setPurchaseSupplier(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl p-2.5 font-bold"
                    >
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name} (Payable: ₹{s.outstandingPayable})</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-extrabold text-slate-600">Item Description (e.g. Chemical Wax / Tyres)</label>
                    <input 
                      type="text"
                      required
                      placeholder="Eco Foam Polish 5L Can"
                      value={purchaseItemName}
                      onChange={(e) => setPurchaseItemName(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl p-2.5 font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-extrabold text-slate-600">Quantity Ordered</label>
                      <input 
                        type="number"
                        required
                        value={purchaseQty}
                        onChange={(e) => setPurchaseQty(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl p-2.5 font-semibold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-extrabold text-slate-600">Unit Cost (₹)</label>
                      <input 
                        type="number"
                        required
                        value={purchaseUnitCost}
                        onChange={(e) => setPurchaseUnitCost(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl p-2.5 font-semibold"
                      />
                    </div>
                  </div>

                  <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-100 space-y-1 text-emerald-950 font-semibold text-[11px]">
                    <div className="flex justify-between">
                      <span>Subtotal Cost:</span>
                      <span>₹{(parseFloat(purchaseQty) * parseFloat(purchaseUnitCost)).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-emerald-200/50 pt-1.5 font-black text-xs">
                      <span>Estimated Total (Excl. IGST):</span>
                      <span>₹{(parseFloat(purchaseQty) * parseFloat(purchaseUnitCost)).toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button 
                      type="button" 
                      onClick={() => setShowPurchaseModal(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 font-bold rounded-xl"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow"
                    >
                      Inward Stock Purchase
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Supplier accounts and recent purchase ledger */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Suppliers panel */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">Registered Suppliers</h3>
              <div className="space-y-3">
                {suppliers.map(s => (
                  <div key={s.id} className="p-3 bg-slate-50 border border-slate-150 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <h4 className="font-black text-slate-900 leading-none">{s.name}</h4>
                      <span className="text-[10px] font-bold text-slate-400 font-mono">{s.id}</span>
                    </div>
                    <div className="text-slate-500 font-semibold space-y-0.5">
                      <p>Contact: {s.contactPerson}</p>
                      <p>Phone: {s.phone}</p>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-200/50 pt-2 text-[10px] font-black uppercase">
                      <span className="text-slate-500">Outstanding:</span>
                      <span className={s.outstandingPayable > 0 ? 'text-red-600' : 'text-emerald-600'}>₹{s.outstandingPayable.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Purchase orders */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 lg:col-span-2">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">Procurement logs</h3>
              <div className="space-y-3">
                {purchaseOrders.map(order => (
                  <div key={order.id} className="p-4 border border-slate-250 rounded-xl space-y-3 hover:shadow-sm transition-all">
                    <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                      <div>
                        <span className="font-mono bg-slate-100 px-2 py-0.5 rounded font-black text-slate-800">{order.id}</span>
                        <span className="text-slate-400 ml-2 font-bold">{order.orderDate}</span>
                      </div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${order.status === 'Received' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {order.status}
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-slate-700">
                      <p className="font-bold text-slate-950">Supplier: {order.supplierName}</p>
                      <div className="mt-2 bg-slate-50 p-2 rounded border border-slate-150 space-y-1">
                        {order.items.map((itm, i) => (
                          <div key={i} className="flex justify-between text-[11px]">
                            <span>{itm.name} (x{itm.quantityOrdered})</span>
                            <span className="font-mono">₹{itm.totalCost.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-xs font-bold border-t border-slate-100 pt-3">
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase">Paid Amount</p>
                        <p className="text-emerald-700">₹{order.amountPaid.toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 uppercase">Outstanding</p>
                        <p className="text-red-700 font-black">₹{order.outstandingBalance.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'EXPENSE' && (
        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Overhead Expense Ledger</h2>
            <p className="text-xs text-slate-500 font-medium">Audited ledger entries directly loaded from the system's active bookkeeping index.</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-150 bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                    <th className="p-4">Expense ID</th>
                    <th className="p-4">Description</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Payment Mode</th>
                    <th className="p-4 text-right">Amount</th>
                    <th className="p-4 text-center">Recorded By</th>
                    <th className="p-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-400 font-semibold">
                        No expenses logged in this cycle. Log them via the Finance module.
                      </td>
                    </tr>
                  ) : (
                    expenses.map(exp => {
                      const categoryObj = spendCategories.find(c => c.id === exp.categoryId);
                      return (
                        <tr key={exp.id} className="hover:bg-slate-50 transition-all">
                          <td className="p-4 font-black text-slate-700 font-mono">#{exp.id.slice(0, 8)}</td>
                          <td className="p-4 text-slate-900 font-bold">{exp.description}</td>
                          <td className="p-4">
                            <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded text-[10px] font-bold border border-slate-200">
                              {categoryObj ? categoryObj.name : 'Operational Overhead'}
                            </span>
                          </td>
                          <td className="p-4 text-slate-600">{exp.date}</td>
                          <td className="p-4 text-slate-700">{exp.paymentMode}</td>
                          <td className="p-4 text-right font-black text-slate-900">₹{exp.amount.toLocaleString()}</td>
                          <td className="p-4 text-center text-slate-500">{exp.recordedBy || 'Admin'}</td>
                          <td className="p-4 text-center">
                            <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase ${exp.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                              {exp.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'REPORTS' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-800 uppercase tracking-wider">Reports & Statements Console</h3>
              <p className="text-xs text-slate-500 font-medium">Select dynamic reports for planning, tax reporting, or audit preparation.</p>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedReportDoc(salesDocs[0] || null)}
                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs flex items-center gap-1.5 border border-indigo-100 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Print Sample Invoice
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Profit and loss report card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 no-print">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg"><TrendingUp className="w-5 h-5" /></span>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">P&L Consolidated Sheet</h3>
              </div>

              <div className="border border-slate-150 rounded-xl overflow-hidden text-xs">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-150 font-black text-slate-700 uppercase tracking-wider text-[10px]">
                  FY 2026-27 (Quarter 1)
                </div>

                <div className="p-4 space-y-2.5 font-bold text-slate-600">
                  <div className="flex justify-between text-slate-800">
                    <span>Gross Sales Revenue:</span>
                    <span>₹{(salesDocs.reduce((sum, d) => sum + d.subTotal, 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 text-[11px] bg-emerald-50/40 p-2 rounded">
                    <span>GST Inward Collected (Liability):</span>
                    <span>₹{(salesDocs.reduce((sum, d) => sum + d.cgstTotal + d.sgstTotal, 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-slate-800">
                    <span>Direct Material Cost (Purchases):</span>
                    <span>₹{(purchaseOrders.reduce((sum, p) => sum + p.subTotal, 0)).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-800">
                    <span>Overhead Logged Expenses:</span>
                    <span>₹{(expenses.reduce((sum, e) => sum + e.amount, 0)).toLocaleString()}</span>
                  </div>
                  <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-black text-slate-900">
                    <span>Net Profit Margin:</span>
                    <span className="text-emerald-700">₹{((salesDocs.reduce((sum, d) => sum + d.subTotal, 0)) - (purchaseOrders.reduce((sum, p) => sum + p.subTotal, 0)) - (expenses.reduce((sum, e) => sum + e.amount, 0))).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Chemical & Recipe consumption report */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 no-print">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-purple-50 text-purple-600 rounded-lg"><Layers className="w-5 h-5" /></span>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Service Recipe Costing & Chemical Report</h3>
              </div>

              <div className="border border-slate-150 rounded-xl overflow-hidden text-xs">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-150 font-black text-slate-700 uppercase tracking-wider text-[10px] flex justify-between">
                  <span>Product Recipe Estimations</span>
                  <span>Active Formulations</span>
                </div>

                <div className="divide-y divide-slate-150 p-3 max-h-[190px] overflow-y-auto">
                  {recipes.map(rcp => (
                    <div key={rcp.id} className="py-2.5 first:pt-0 last:pb-0 text-xs">
                      <div className="flex justify-between font-black text-slate-900">
                        <span>{rcp.serviceName}</span>
                        <span className="text-emerald-700">₹{rcp.totalMaterialCost.toFixed(2)} / wash</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 mt-1.5 text-[10px] text-slate-500 font-bold">
                        {rcp.components.map((c, i) => (
                          <div key={i} className="bg-slate-50 p-1 rounded border border-slate-100">
                            <p className="truncate text-slate-800">{c.productName}</p>
                            <p className="mt-0.5">{c.qtyRequired} {c.unit}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Printable Invoice Generator view if selected */}
          {selectedReportDoc && (
            <div className="bg-white border-2 border-slate-200 rounded-3xl p-8 max-w-2xl mx-auto shadow-xl space-y-6 relative border-t-8 border-t-brand-blue print:shadow-none print:border-none">
              <div className="absolute top-4 right-4 no-print">
                <button
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer border border-slate-200"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Receipt
                </button>
              </div>

              {/* Invoice Layout */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-6">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <img 
                      src="https://pub-d1d6c35dc7024f819f155246a42ea32b.r2.dev/Website%20Assets/logo/bigengine%203.png" 
                      alt="Logo" 
                      className="w-10 h-10 object-contain" 
                    />
                    <h2 className="text-lg font-black text-brand-blue tracking-tight leading-none uppercase">
                      A BIG <span className="text-brand-accent">ENGINE</span>
                    </h2>
                  </div>
                  <p className="text-[10px] text-slate-500 font-bold">GSTIN: 07AABCA1234F1Z9 • New Delhi Hub</p>
                  <p className="text-[10px] text-slate-500 font-bold leading-none">Email: service@abigengine.com • Support: +91 99999 88888</p>
                </div>

                <div className="text-right text-xs">
                  <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">{selectedReportDoc.type}</h3>
                  <p className="font-bold text-slate-500 mt-1">Doc Number: <span className="font-mono text-slate-800 font-black">{selectedReportDoc.id}</span></p>
                  <p className="font-bold text-slate-500">Date: <span className="text-slate-800">{selectedReportDoc.date}</span></p>
                </div>
              </div>

              {/* Customer and vehicle profile */}
              <div className="grid grid-cols-2 gap-6 bg-slate-50 p-4 rounded-2xl text-xs font-semibold text-slate-700 border border-slate-150">
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Bill To Customer</p>
                  <p className="font-black text-slate-900 text-sm">{selectedReportDoc.customerName}</p>
                  <p>Mobile: {selectedReportDoc.customerPhone}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Service Vehicle</p>
                  <p className="font-black text-slate-900 text-sm font-mono">{selectedReportDoc.vehicleRegNumber}</p>
                  <p>Model: {selectedReportDoc.vehicleBrandModel}</p>
                </div>
              </div>

              {/* Invoice lines */}
              <div className="space-y-3.5">
                <div className="border-b border-slate-200 pb-2 text-[10px] font-black text-slate-400 uppercase tracking-wider grid grid-cols-12">
                  <div className="col-span-6">Description</div>
                  <div className="col-span-2 text-right">Taxable</div>
                  <div className="col-span-2 text-right">GST (18%)</div>
                  <div className="col-span-2 text-right">Total</div>
                </div>

                {selectedReportDoc.items.map((itm, i) => (
                  <div key={i} className="text-xs font-bold text-slate-800 grid grid-cols-12 py-1 items-center">
                    <div className="col-span-6">
                      <p className="font-black text-slate-900">{itm.description}</p>
                      <p className="text-[10px] text-slate-400 font-semibold">Standard Package Code Including CGST 9% + SGST 9%</p>
                    </div>
                    <div className="col-span-2 text-right font-mono">₹{itm.taxableValue.toFixed(2)}</div>
                    <div className="col-span-2 text-right font-mono text-slate-500">₹{(itm.cgstAmount + itm.sgstAmount).toFixed(2)}</div>
                    <div className="col-span-2 text-right font-mono font-black text-slate-900">₹{itm.totalAmount.toFixed(2)}</div>
                  </div>
                ))}
              </div>

              {/* GST breakdown box */}
              <div className="bg-slate-50/50 p-3.5 rounded-xl border border-slate-150 space-y-1 text-[10px] font-bold text-slate-500">
                <p className="font-black text-[9px] text-slate-400 uppercase mb-1">State GST breakdown</p>
                <div className="flex justify-between">
                  <span>CGST (Central Tax 9%):</span>
                  <span className="font-mono">₹{selectedReportDoc.cgstTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST (State Tax 9%):</span>
                  <span className="font-mono">₹{selectedReportDoc.sgstTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Total calculations */}
              <div className="border-t border-slate-200 pt-4 flex justify-between items-center text-xs font-bold text-slate-600">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase">Payment Method</p>
                  <p className="text-slate-900 font-black">{selectedReportDoc.paymentMode || 'UPI Gateway'}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase">Invoice Grand Total</p>
                  <p className="text-2xl font-black text-brand-blue tracking-tight">₹{selectedReportDoc.grandTotal.toFixed(2)}</p>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-6 text-center text-[10px] font-bold text-slate-400">
                Thank you for choosing A Big Engine! This is an electronically generated compliant invoice.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ErpManagementPage;

