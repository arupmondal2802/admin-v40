
import React, { useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';

export type ReportType = 'summary' | 'agent' | 'service';
export type DataScope = 'filtered' | 'full';
export type FileFormat = 'csv' | 'pdf';
export type PDFReportType = 'performance' | 'services' | 'revenue' | 'efficiency';

interface ExportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (fileFormat: FileFormat, reportType: ReportType, dataScope: DataScope, pdfReportType: PDFReportType) => void;
  isExporting: boolean;
}

const ExportReportModal: React.FC<ExportReportModalProps> = ({ isOpen, onClose, onExport, isExporting }) => {
  const [fileFormat, setFileFormat] = useState<FileFormat>('pdf');
  const [csvReportType, setCsvReportType] = useState<ReportType>('summary');
  const [pdfReportType, setPdfReportType] = useState<PDFReportType>('performance');
  const [dataScope, setDataScope] = useState<DataScope>('filtered');

  if (!isOpen) return null;

  const handleGenerateReport = () => {
    onExport(fileFormat, csvReportType, dataScope, pdfReportType);
  };

  const csvOptions = [
      { id: 'summary', label: 'Summary Report', description: 'A single sheet with all relevant service data.' },
      { id: 'agent', label: 'Agent Performance Report', description: 'A summary sheet plus a detailed sheet for each agent.' },
      { id: 'service', label: 'Service Breakdown Report', description: 'A separate sheet for each type of service.' }
  ];

  const pdfOptions = [
      { id: 'performance', label: 'User Performance', description: 'A detailed breakdown of each agent\'s performance.' },
      { id: 'services', label: 'Service Popularity', description: 'A summary of services performed and revenue generated.' },
      { id: 'revenue', label: 'Revenue Summary', description: 'A daily breakdown of revenue over the selected period.' },
      { id: 'efficiency', label: 'Service Efficiency', description: 'A detailed breakdown of agent completion speed and job logs.' },
  ];

  const scopeOptions = [
      { id: 'filtered', label: 'Current Filtered View', description: 'Export only the data matching the filters on the page.' },
      { id: 'full', label: 'Full Data Dump', description: 'Export all completed services, ignoring page filters.' },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 modal-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg modal-content">
        <Card title="Configure & Export Report">
          <div className="space-y-6">
            <div>
                <h4 className="font-semibold text-slate-700 mb-2">1. Choose File Format</h4>
                 <div className="flex rounded-md shadow-sm w-full">
                    <button onClick={() => setFileFormat('pdf')} className={`w-1/2 px-4 py-2 text-sm font-medium rounded-l-md transition-colors ${fileFormat === 'pdf' ? 'bg-brand-blue text-white z-10' : 'bg-white text-slate-700 hover:bg-slate-50 border'}`}>PDF</button>
                    <button onClick={() => setFileFormat('csv')} className={`w-1/2 -ml-px px-4 py-2 text-sm font-medium rounded-r-md transition-colors ${fileFormat === 'csv' ? 'bg-brand-blue text-white z-10' : 'bg-white text-slate-700 hover:bg-slate-50 border'}`}>Excel (.xlsx)</button>
                </div>
            </div>

            {fileFormat === 'pdf' ? (
                <div>
                    <h4 className="font-semibold text-slate-700 mb-2">2. Choose PDF Report Type</h4>
                    <div className="space-y-2">
                        {pdfOptions.map(option => (
                            <label key={option.id} className="flex p-3 rounded-lg border-2 cursor-pointer has-[:checked]:border-brand-accent has-[:checked]:bg-brand-accent/10">
                                <input type="radio" name="pdfReportType" value={option.id} checked={pdfReportType === option.id} onChange={() => setPdfReportType(option.id as PDFReportType)} className="h-4 w-4 mt-1 border-gray-300 text-brand-accent focus:ring-brand-accent"/>
                                <div className="ml-3">
                                    <p className="font-medium text-slate-800">{option.label}</p>
                                    <p className="text-sm text-slate-500">{option.description}</p>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>
            ) : (
                 <div>
                    <h4 className="font-semibold text-slate-700 mb-2">2. Choose Excel Report Type</h4>
                    <div className="space-y-2">
                        {csvOptions.map(option => (
                            <label key={option.id} className="flex p-3 rounded-lg border-2 cursor-pointer has-[:checked]:border-brand-accent has-[:checked]:bg-brand-accent/10">
                                <input type="radio" name="csvReportType" value={option.id} checked={csvReportType === option.id} onChange={() => setCsvReportType(option.id as ReportType)} className="h-4 w-4 mt-1 border-gray-300 text-brand-accent focus:ring-brand-accent"/>
                                <div className="ml-3">
                                    <p className="font-medium text-slate-800">{option.label}</p>
                                    <p className="text-sm text-slate-500">{option.description}</p>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>
            )}
             <div>
                <h4 className="font-semibold text-slate-700 mb-2">3. Choose Data Scope</h4>
                <div className="space-y-2">
                    {scopeOptions.map(option => (
                         <label key={option.id} className="flex p-3 rounded-lg border-2 cursor-pointer has-[:checked]:border-brand-accent has-[:checked]:bg-brand-accent/10">
                            <input type="radio" name="dataScope" value={option.id} checked={dataScope === option.id} onChange={() => setDataScope(option.id as DataScope)} className="h-4 w-4 mt-1 border-gray-300 text-brand-accent focus:ring-brand-accent"/>
                             <div className="ml-3">
                                <p className="font-medium text-slate-800">{option.label}</p>
                                <p className="text-sm text-slate-500">{option.description}</p>
                            </div>
                        </label>
                    ))}
                </div>
            </div>
          </div>
          <div className="mt-8 flex justify-end space-x-2 border-t pt-4">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleGenerateReport} disabled={isExporting}>
              {isExporting ? 'Generating...' : 'Generate Report'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ExportReportModal;
