import React, { useState, useRef, useMemo } from 'react';
import { 
  X, Upload, FileSpreadsheet, ArrowRight, Check, AlertCircle, 
  Settings, Loader2, Database, HelpCircle, ChevronRight, ChevronLeft, MapPin, Car
} from 'lucide-react';
import { saveRecord } from '../../services/cloudDataService';
import { CustomerBookEntry, SavedVehicle, VehicleCategoryTag, ServiceRequest } from '../../types';
import { toast } from 'sonner';

interface CsvImportModalProps {
  onClose: () => void;
  onRefresh: () => Promise<void>;
  sheetsUrl: string;
}

type Step = 'UPLOAD' | 'MAP' | 'PREVIEW' | 'IMPORTING';

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  onClose,
  onRefresh,
  sheetsUrl
}) => {
  const [step, setStep] = useState<Step>('UPLOAD');
  const [dragActive, setDragActive] = useState(false);
  const [csvLines, setCsvLines] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  
  // Mapping configuration (index of CSV columns, -1 means unmapped)
  const [mapping, setMapping] = useState({
    firstName: -1,
    lastName: -1,
    fullName: -1, // helper for single column names
    mobileNumber: -1,
    streetAddress: -1,
    carNumber: -1,
    carBrandModel: -1,
    leadSourceCol: -1
  });

  // Lead source options and default selection
  const leadSourceOptions = ['Web', 'Meta', 'Google Ads', 'Organic', 'Referral'];
  const [defaultLeadSource, setDefaultLeadSource] = useState('Web');
  const [customLeadSource, setCustomLeadSource] = useState('');
  const [alsoImportAsWebLeads, setAlsoImportAsWebLeads] = useState(true);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Simple, robust CSV parser
  const parseCSV = (text: string): string[][] => {
    const lines: string[][] = [];
    let row: string[] = [];
    let insideQuote = false;
    let entry = '';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      
      if (char === '"') {
        if (insideQuote && nextChar === '"') {
          entry += '"';
          i++; // Skip next quote
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === ',' && !insideQuote) {
        row.push(entry.trim());
        entry = '';
      } else if ((char === '\r' || char === '\n') && !insideQuote) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        row.push(entry.trim());
        if (row.length > 1 || row[0] !== '') {
          lines.push(row);
        }
        row = [];
        entry = '';
      } else {
        entry += char;
      }
    }
    
    if (entry !== '' || row.length > 0) {
      row.push(entry.trim());
      lines.push(row);
    }
    
    return lines;
  };

  const handleFile = (file: File) => {
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a standard CSV file.');
      return;
    }
    
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        toast.error('File is empty or corrupted.');
        return;
      }
      
      const parsed = parseCSV(text);
      if (parsed.length < 2) {
        toast.error('CSV must contain at least a header row and one data row.');
        return;
      }
      
      const csvHeaders = parsed[0];
      setHeaders(csvHeaders);
      setCsvLines(parsed.slice(1));
      
      // Attempt smart automatic mapping based on header names
      const newMapping = {
        firstName: -1,
        lastName: -1,
        fullName: -1,
        mobileNumber: -1,
        streetAddress: -1,
        carNumber: -1,
        carBrandModel: -1,
        leadSourceCol: -1
      };
      
      csvHeaders.forEach((h, index) => {
        const lower = h.toLowerCase().trim();
        if (lower.includes('first name') || lower === 'firstname' || lower === 'fname') {
          newMapping.firstName = index;
        } else if (lower.includes('last name') || lower === 'lastname' || lower === 'lname') {
          newMapping.lastName = index;
        } else if (lower.includes('full name') || lower === 'fullname' || lower === 'name') {
          newMapping.fullName = index;
        } else if (lower.includes('phone') || lower.includes('mobile') || lower === 'tel' || lower === 'number') {
          newMapping.mobileNumber = index;
        } else if (lower.includes('address') || lower.includes('street') || lower === 'location') {
          newMapping.streetAddress = index;
        } else if (lower.includes('car reg') || lower.includes('car number') || lower.includes('plate') || lower.includes('registration') || lower === 'reg') {
          newMapping.carNumber = index;
        } else if (lower.includes('car model') || lower.includes('vehicle') || lower.includes('brand') || lower === 'car') {
          newMapping.carBrandModel = index;
        } else if (lower.includes('source') || lower.includes('lead') || lower.includes('utm')) {
          newMapping.leadSourceCol = index;
        }
      });
      
      setMapping(newMapping);
      setStep('MAP');
    };
    reader.readAsText(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // Maps a raw CSV row into our structured types
  const mapRowToEntities = (row: string[]) => {
    // Determine First & Last Name
    let first = '';
    let last = '';
    
    if (mapping.firstName !== -1 && row[mapping.firstName]) {
      first = row[mapping.firstName];
    }
    if (mapping.lastName !== -1 && row[mapping.lastName]) {
      last = row[mapping.lastName];
    }
    
    // If we mapped Full Name and firstName/lastName aren't both present
    if ((!first || !last) && mapping.fullName !== -1 && row[mapping.fullName]) {
      const full = row[mapping.fullName].trim();
      const parts = full.split(/\s+/);
      if (!first) first = parts[0] || '';
      if (!last) last = parts.slice(1).join(' ') || '';
    }
    
    // Defaults
    if (!first) first = 'Valued';
    if (!last) last = 'Customer';
    
    // Sanitize mobile number
    let rawPhone = mapping.mobileNumber !== -1 ? row[mapping.mobileNumber] : '';
    const mobile = rawPhone.replace(/[^\d+]/g, ''); // retain digits and plus sign
    
    const street = mapping.streetAddress !== -1 ? row[mapping.streetAddress] : 'N/A';
    
    // Lead Source resolving
    let rowSource = '';
    if (mapping.leadSourceCol !== -1 && row[mapping.leadSourceCol]) {
      rowSource = row[mapping.leadSourceCol].trim();
    }
    
    // Normalize source string to match the user's expected casing or fallback
    const resolvedSource = rowSource || (defaultLeadSource === 'Other' ? customLeadSource : defaultLeadSource) || 'Web';
    
    // Vehicle matching
    const carNo = mapping.carNumber !== -1 ? row[mapping.carNumber].toUpperCase().trim() : '';
    const carModelName = mapping.carBrandModel !== -1 ? row[mapping.carBrandModel].trim() : '';
    
    const savedVehicles: SavedVehicle[] = [];
    if (carNo || carModelName) {
      savedVehicles.push({
        carNumber: carNo || 'N/A',
        carBrandModel: carModelName || 'Vehicle - Unknown',
        vehicleCategoryTag: VehicleCategoryTag.Prime
      });
    }

    const customer: CustomerBookEntry = {
      id: mobile || `CUST-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      mobileNumber: mobile || 'N/A',
      firstName: first,
      lastName: last,
      streetAddress: street,
      savedVehicles,
      leadSource: resolvedSource
    };

    const request: ServiceRequest | null = alsoImportAsWebLeads && mobile ? {
      id: `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      customerName: `${first} ${last}`.trim(),
      customerPhone: mobile,
      requestedService: 'Bulk Uploaded Lead',
      requestDate: new Date().toISOString(),
      source: resolvedSource,
      leadSource: resolvedSource,
      status: 'New',
      carRegNo: carNo || undefined,
      carBrand: carModelName ? carModelName.split(' ')[0] : undefined,
      carModel: carModelName ? carModelName.split(' ').slice(1).join(' ') : undefined,
      streetAddress: street || undefined
    } : null;

    return { customer, request, originalRow: row };
  };

  // Preview data
  const previewData = useMemo(() => {
    return csvLines.slice(0, 5).map(row => mapRowToEntities(row));
  }, [csvLines, mapping, defaultLeadSource, customLeadSource, alsoImportAsWebLeads]);

  const isMappingValid = useMemo(() => {
    return mapping.mobileNumber !== -1;
  }, [mapping]);

  // Bulk import execution
  const executeImport = async () => {
    setStep('IMPORTING');
    setImportTotal(csvLines.length);
    setImportProgress(0);
    
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < csvLines.length; i++) {
      const { customer, request } = mapRowToEntities(csvLines[i]);
      
      if (!customer.mobileNumber || customer.mobileNumber === 'N/A') {
        failedCount++;
        setImportProgress(i + 1);
        continue;
      }

      try {
        // Save to CustomerBook (Cloud Database)
        await saveRecord('Customers', customer, sheetsUrl);
        
        // If chosen, also save as active service request (Web Leads)
        if (request) {
          await saveRecord('ServiceRequests', request, sheetsUrl);
        }
        
        successCount++;
      } catch (err) {
        console.error('Failed to import row:', csvLines[i], err);
        failedCount++;
      }
      
      setImportProgress(i + 1);
    }

    try {
      await onRefresh();
    } catch (e) {
      console.error(e);
    }

    toast.success(`Import complete! Loaded ${successCount} customers successfully. ${failedCount > 0 ? `${failedCount} skipped due to empty phone numbers.` : ''}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-lg">Bulk Import Customer Leads</h2>
              <p className="text-xs text-slate-500">Map CSV files directly to Customer Book database & Web Leads</p>
            </div>
          </div>
          {step !== 'IMPORTING' && (
            <button 
              onClick={onClose} 
              className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* STEP 1: UPLOAD */}
          {step === 'UPLOAD' && (
            <div className="space-y-6">
              <div 
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                  dragActive ? 'border-brand-blue bg-blue-50/50' : 'border-slate-200 hover:border-slate-300 bg-slate-50/30'
                }`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileInputChange} 
                  accept=".csv" 
                  className="hidden" 
                />
                
                <div className="p-4 bg-emerald-50 text-emerald-600 rounded-full w-fit mx-auto mb-4">
                  <Upload className="w-8 h-8" />
                </div>
                
                <h3 className="text-base font-bold text-slate-700">Drag & drop your CSV file here</h3>
                <p className="text-xs text-slate-400 mt-1">or click to browse your local storage</p>
                <div className="mt-4 px-3 py-1.5 bg-slate-100 border rounded-lg text-[10px] font-semibold text-slate-500 inline-block">
                  Only standard comma-separated .csv files are supported
                </div>
              </div>

              {/* CSV Instructions Card */}
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 text-slate-600">
                <div className="flex items-start gap-2.5">
                  <HelpCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold text-blue-900 mb-1">Recommended CSV Column Format:</p>
                    <p className="mb-2 leading-relaxed">
                      Your CSV can have any column headers! Our smart importer maps your headers automatically. 
                      For best results, we suggest including columns like:
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono text-[10px] bg-white border border-blue-100 p-2.5 rounded-lg text-slate-600">
                      <div>• Name / Full Name</div>
                      <div>• Phone / Mobile</div>
                      <div>• Street Address</div>
                      <div>• Car Reg Number</div>
                      <div>• Car Brand & Model</div>
                      <div>• Lead Source</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: COLUMN MAPPING */}
          {step === 'MAP' && (
            <div className="space-y-6">
              <div className="bg-amber-50/70 border border-amber-100 rounded-xl p-3.5 flex items-start gap-2.5">
                <Settings className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-xs text-amber-900">
                  <p className="font-bold">Column Mapping Configuration</p>
                  <p className="mt-0.5">Please verify which column in your CSV maps to each of our database fields below. <strong>Mobile Number is required.</strong></p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                
                {/* Field Mapping Column */}
                <div className="space-y-4 bg-slate-50/50 p-4 border border-slate-100 rounded-xl">
                  <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">Database Field Mapping</h3>
                  
                  {/* Full Name Mapping */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-700">Full Name (Combined column)</label>
                    <select 
                      value={mapping.fullName} 
                      onChange={(e) => setMapping({ ...mapping, fullName: parseInt(e.target.value) })}
                      className="text-xs border rounded-lg p-2 bg-white text-slate-700 outline-none focus:ring-1 focus:ring-brand-blue"
                    >
                      <option value="-1">-- Don't Map (Use First/Last columns instead) --</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </select>
                  </div>

                  {/* Or Split First/Last */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-700">First Name</label>
                      <select 
                        disabled={mapping.fullName !== -1}
                        value={mapping.firstName} 
                        onChange={(e) => setMapping({ ...mapping, firstName: parseInt(e.target.value) })}
                        className="text-xs border rounded-lg p-2 bg-white text-slate-700 outline-none focus:ring-1 focus:ring-brand-blue disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <option value="-1">-- Unmapped --</option>
                        {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-700">Last Name</label>
                      <select 
                        disabled={mapping.fullName !== -1}
                        value={mapping.lastName} 
                        onChange={(e) => setMapping({ ...mapping, lastName: parseInt(e.target.value) })}
                        className="text-xs border rounded-lg p-2 bg-white text-slate-700 outline-none focus:ring-1 focus:ring-brand-blue disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <option value="-1">-- Unmapped --</option>
                        {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Mobile Number */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">Mobile/Phone Number <span className="text-rose-500">*</span></label>
                      {mapping.mobileNumber === -1 && (
                        <span className="text-[9px] text-rose-500 font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">Required</span>
                      )}
                    </div>
                    <select 
                      value={mapping.mobileNumber} 
                      onChange={(e) => setMapping({ ...mapping, mobileNumber: parseInt(e.target.value) })}
                      className={`text-xs border rounded-lg p-2 bg-white text-slate-700 outline-none focus:ring-1 ${mapping.mobileNumber === -1 ? 'border-rose-300 ring-rose-200' : 'focus:ring-brand-blue'}`}
                    >
                      <option value="-1">-- Select Mobile Column --</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </select>
                  </div>

                  {/* Street Address */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-700">Street Address</label>
                    <select 
                      value={mapping.streetAddress} 
                      onChange={(e) => setMapping({ ...mapping, streetAddress: parseInt(e.target.value) })}
                      className="text-xs border rounded-lg p-2 bg-white text-slate-700 outline-none focus:ring-1 focus:ring-brand-blue"
                    >
                      <option value="-1">-- Unmapped --</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </select>
                  </div>

                  {/* Car Number */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-700">Vehicle registration No.</label>
                    <select 
                      value={mapping.carNumber} 
                      onChange={(e) => setMapping({ ...mapping, carNumber: parseInt(e.target.value) })}
                      className="text-xs border rounded-lg p-2 bg-white text-slate-700 outline-none focus:ring-1 focus:ring-brand-blue"
                    >
                      <option value="-1">-- Unmapped --</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </select>
                  </div>

                  {/* Car Brand Model */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-700">Vehicle Brand/Model</label>
                    <select 
                      value={mapping.carBrandModel} 
                      onChange={(e) => setMapping({ ...mapping, carBrandModel: parseInt(e.target.value) })}
                      className="text-xs border rounded-lg p-2 bg-white text-slate-700 outline-none focus:ring-1 focus:ring-brand-blue"
                    >
                      <option value="-1">-- Unmapped --</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </select>
                  </div>
                </div>

                {/* Source & Import Settings Column */}
                <div className="space-y-4 bg-slate-50/50 p-4 border border-slate-100 rounded-xl">
                  <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">Lead Source & Campaign Settings</h3>

                  {/* CSV Source Column Mapping */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-700">Map Lead Source Column (Optional)</label>
                    <select 
                      value={mapping.leadSourceCol} 
                      onChange={(e) => setMapping({ ...mapping, leadSourceCol: parseInt(e.target.value) })}
                      className="text-xs border rounded-lg p-2 bg-white text-slate-700 outline-none focus:ring-1 focus:ring-brand-blue"
                    >
                      <option value="-1">-- Don't Map (Use default fallback value below) --</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </select>
                    <p className="text-[10px] text-slate-400 leading-normal">If a row does not contain source data, the default lead source below will be used.</p>
                  </div>

                  {/* Default Lead Source selection */}
                  <div className="flex flex-col gap-1.5 border-t border-slate-200/60 pt-3 mt-1">
                    <label className="text-xs font-bold text-slate-700">Default Lead Source Fallback</label>
                    <div className="grid grid-cols-2 gap-2">
                      {leadSourceOptions.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => { setDefaultLeadSource(opt); setCustomLeadSource(''); }}
                          className={`text-xs py-1.5 px-2.5 rounded-lg border font-semibold transition-all ${
                            defaultLeadSource === opt 
                              ? 'bg-brand-blue/10 border-brand-blue text-brand-blue shadow-sm'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setDefaultLeadSource('Other')}
                        className={`text-xs py-1.5 px-2.5 rounded-lg border font-semibold transition-all ${
                          defaultLeadSource === 'Other'
                            ? 'bg-brand-blue/10 border-brand-blue text-brand-blue shadow-sm'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Other Source
                      </button>
                    </div>

                    {/* Custom Lead Source text field */}
                    {defaultLeadSource === 'Other' && (
                      <input 
                        type="text" 
                        value={customLeadSource} 
                        onChange={(e) => setCustomLeadSource(e.target.value)}
                        placeholder="Enter custom source name (e.g. Email campaign)"
                        className="text-xs border rounded-lg p-2 bg-white text-slate-700 outline-none mt-1 focus:ring-1 focus:ring-brand-blue"
                      />
                    )}
                  </div>

                  {/* Extra sync target */}
                  <div className="flex items-start gap-2.5 border-t border-slate-200/60 pt-4">
                    <input 
                      type="checkbox" 
                      id="alsoImportAsWebLeads"
                      checked={alsoImportAsWebLeads} 
                      onChange={(e) => setAlsoImportAsWebLeads(e.target.checked)}
                      className="mt-1 rounded text-brand-blue border-slate-300 focus:ring-brand-blue"
                    />
                    <label htmlFor="alsoImportAsWebLeads" className="text-xs cursor-pointer select-none">
                      <p className="font-bold text-slate-700">Also add to active "Web Leads" list</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Duplicates will be verified by mobile number. Checking this populates the Web Leads widget queue directly.</p>
                    </label>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* STEP 3: MAPPING PREVIEW */}
          {step === 'PREVIEW' && (
            <div className="space-y-6">
              <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-3.5 flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div className="text-xs text-emerald-900">
                  <p className="font-bold">Ready to Import {csvLines.length} Records</p>
                  <p className="mt-0.5">Please review the parsed columns and structure preview below before writing to database.</p>
                </div>
              </div>

              {/* Data Table Preview */}
              <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm bg-white">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Previewing first 5 rows</span>
                  <span className="text-[10px] text-brand-blue font-bold">Total: {csvLines.length} leads</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-xs">
                    <thead className="bg-slate-50/50">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-bold text-slate-500">Name</th>
                        <th className="px-4 py-2.5 text-left font-bold text-slate-500">Mobile</th>
                        <th className="px-4 py-2.5 text-left font-bold text-slate-500">Address</th>
                        <th className="px-4 py-2.5 text-left font-bold text-slate-500">Vehicle Details</th>
                        <th className="px-4 py-2.5 text-left font-bold text-slate-500">Lead Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {previewData.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/30">
                          <td className="px-4 py-2.5 font-bold text-slate-800">
                            {item.customer.firstName} {item.customer.lastName}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-slate-600">
                            {item.customer.mobileNumber || <span className="text-rose-500 font-bold italic">Missing</span>}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 truncate max-w-[150px]">
                            {item.customer.streetAddress}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500">
                            {item.customer.savedVehicles[0] ? (
                              <div className="flex items-center gap-1">
                                <Car className="w-3 h-3 text-slate-400" />
                                <span className="font-semibold">{item.customer.savedVehicles[0].carBrandModel}</span>
                                <span className="text-[10px] bg-slate-100 px-1 rounded">({item.customer.savedVehicles[0].carNumber})</span>
                              </div>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-100">
                              {item.customer.leadSource}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: IMPORTING PROGRESS */}
          {step === 'IMPORTING' && (
            <div className="py-12 text-center space-y-4">
              <Loader2 className="w-12 h-12 text-brand-blue animate-spin mx-auto" />
              <div>
                <h3 className="text-base font-bold text-slate-700">Writing database records...</h3>
                <p className="text-xs text-slate-400 mt-1">Please keep this window open while we push historical records to the database.</p>
              </div>
              <div className="w-full max-w-md mx-auto">
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden border">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-150"
                    style={{ width: `${(importProgress / importTotal) * 100}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mt-1.5">
                  <span>Importing row {importProgress}</span>
                  <span>{Math.round((importProgress / importTotal) * 100)}% ({importProgress}/{importTotal})</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        {step !== 'IMPORTING' && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <div>
              {step === 'MAP' && (
                <button
                  onClick={() => setStep('UPLOAD')}
                  className="px-4 py-2 border rounded-xl font-bold text-slate-600 bg-white hover:bg-slate-50 text-xs transition-colors"
                >
                  Back to Upload
                </button>
              )}
              {step === 'PREVIEW' && (
                <button
                  onClick={() => setStep('MAP')}
                  className="px-4 py-2 border rounded-xl font-bold text-slate-600 bg-white hover:bg-slate-50 text-xs transition-colors"
                >
                  Back to Mapping
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              
              {step === 'MAP' && (
                <button
                  onClick={() => setStep('PREVIEW')}
                  disabled={!isMappingValid}
                  className="px-4 py-2 rounded-xl font-bold text-white bg-brand-blue hover:bg-brand-blue/95 text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 shadow"
                >
                  Continue to Preview <ChevronRight className="w-4 h-4" />
                </button>
              )}

              {step === 'PREVIEW' && (
                <button
                  onClick={executeImport}
                  className="px-5 py-2 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-600/95 text-xs transition-colors flex items-center gap-1 shadow"
                >
                  Start Import <Database className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
