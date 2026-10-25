import React, { useState } from 'react';
import {
  Webhook,
  Copy,
  Check,
  X,
  Code,
  Send,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { ServiceRequest } from '../../../types';

interface LeadWebhookModalProps {
  onClose: () => void;
  onSimulateWebhookLead: (leadData: Partial<ServiceRequest>) => void;
}

export const LeadWebhookModal: React.FC<LeadWebhookModalProps> = ({
  onClose,
  onSimulateWebhookLead
}) => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'SETUP' | 'SIMULATE' | 'CODE'>('SETUP');

  // Simulator test form
  const [simName, setSimName] = useState('Ananya Iyer');
  const [simPhone, setSimPhone] = useState('+91 98200 12345');
  const [simCar, setSimCar] = useState('Hyundai Creta');
  const [simService, setSimService] = useState('Ceramic Coating & Deep Interior Sanitization');
  const [simAmount, setSimAmount] = useState('4500');
  const [simSource, setSimSource] = useState('Zapier / Facebook Webhook');
  const [simSuccess, setSimSuccess] = useState(false);

  const webhookEndpoint = `${window.location.origin}/api/webhooks/crm-leads`;
  const sampleSecret = 'whsec_abe_crm_' + Math.random().toString(36).substring(2, 10);

  const sampleJson = `{
  "customerName": "Vikram Malhotra",
  "customerPhone": "+919876543210",
  "customerEmail": "vikram@example.com",
  "carBrand": "BMW",
  "carModel": "3 Series 330i",
  "carRegNo": "MH02DX4589",
  "requestedService": "Full Exterior Detail & Ceramic Shield",
  "totalAmount": 7500,
  "source": "Meta Ads Webhook",
  "campaignName": "Monsoon Protection 2026",
  "streetAddress": "Bandra West, Mumbai, Maharashtra",
  "remarks": "Customer requested callback before 4 PM"
}`;

  const curlSnippet = `curl -X POST "${webhookEndpoint}" \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Secret: ${sampleSecret}" \\
  -d '${sampleJson.replace(/\n/g, '')}'`;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const handleRunSimulator = (e: React.FormEvent) => {
    e.preventDefault();
    onSimulateWebhookLead({
      customerName: simName,
      customerPhone: simPhone,
      carBrand: simCar.split(' ')[0] || 'Car',
      carModel: simCar.split(' ').slice(1).join(' ') || '',
      requestedService: simService,
      totalAmount: Number(simAmount) || 0,
      source: simSource,
      status: 'CREATED',
      requestDate: new Date().toISOString(),
      remarks: 'Ingested via Real-time CRM Webhook Ingestion Simulator'
    });
    setSimSuccess(true);
    setTimeout(() => setSimSuccess(false), 3000);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleUp max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500 text-white flex items-center justify-center shadow-md">
              <Webhook className="w-5 h-5 fill-white" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                Universal Multi-Channel Webhook Ingestion
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 uppercase tracking-wider">
                  Live API
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Connect Zapier, Make.com, Meta Webhooks, Shopify, or custom landing pages directly
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-100 p-1 rounded-2xl">
          <button
            onClick={() => setActiveTab('SETUP')}
            className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all ${
              activeTab === 'SETUP' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Endpoint URL & Secret
          </button>
          <button
            onClick={() => setActiveTab('CODE')}
            className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all ${
              activeTab === 'CODE' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            JSON Schema & cURL
          </button>
          <button
            onClick={() => setActiveTab('SIMULATE')}
            className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all ${
              activeTab === 'SIMULATE' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Test Webhook Ingestion
          </button>
        </div>

        {/* Tab 1: Setup */}
        <div className="flex-1 overflow-y-auto space-y-4">
          {activeTab === 'SETUP' && (
            <div className="space-y-4">
              <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-sky-900 font-extrabold text-xs uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4 text-sky-600" />
                  Instant Direct Ingestion
                </div>
                <p className="text-xs text-sky-850 leading-relaxed font-medium">
                  Direct webhook payloads bypass spreadsheet polling delays and appear on your CRM Kanban pipeline in <strong>under 500 milliseconds</strong> with real-time browser synchronization.
                </p>
              </div>

              {/* Endpoint */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Webhook Ingest URL (POST)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookEndpoint}
                    className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none"
                  />
                  <button
                    onClick={() => copyToClipboard(webhookEndpoint, 'endpoint')}
                    className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    {copiedSection === 'endpoint' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSection === 'endpoint' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Secret */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Webhook Signature Token / Secret
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={sampleSecret}
                    className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none"
                  />
                  <button
                    onClick={() => copyToClipboard(sampleSecret, 'secret')}
                    className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedSection === 'secret' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSection === 'secret' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Integration Guides */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <p className="text-xs font-bold text-slate-800">⚡ Zapier / Make.com</p>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    Add a "Webhooks by Zapier (POST)" action and paste this endpoint. Map fields directly.
                  </p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <p className="text-xs font-bold text-slate-800">🌐 Webflow / WordPress / Shopify</p>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    Trigger on new contact form or checkout submission to immediately capture into CRM.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Code & Payload */}
          {activeTab === 'CODE' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Expected JSON Payload Schema
                  </label>
                  <button
                    onClick={() => copyToClipboard(sampleJson, 'json')}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedSection === 'json' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copy JSON</span>
                  </button>
                </div>
                <pre className="p-3.5 bg-slate-900 text-slate-200 rounded-2xl text-[11px] font-mono overflow-x-auto leading-relaxed border border-slate-800">
                  {sampleJson}
                </pre>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Sample cURL Command
                  </label>
                  <button
                    onClick={() => copyToClipboard(curlSnippet, 'curl')}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedSection === 'curl' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copy cURL</span>
                  </button>
                </div>
                <pre className="p-3.5 bg-slate-900 text-slate-200 rounded-2xl text-[11px] font-mono overflow-x-auto leading-relaxed border border-slate-800">
                  {curlSnippet}
                </pre>
              </div>
            </div>
          )}

          {/* Tab 3: Simulator */}
          {activeTab === 'SIMULATE' && (
            <form onSubmit={handleRunSimulator} className="space-y-3.5">
              <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-2xl flex items-center gap-2 text-xs text-amber-900 font-medium">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Submit this form to test adding a live webhook lead directly into your pipeline!</span>
              </div>

              {simSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-xs text-emerald-900 font-bold animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Lead ingested successfully! Check your Kanban "CREATED" column.</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Customer Name</label>
                  <input
                    type="text"
                    required
                    value={simName}
                    onChange={(e) => setSimName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Phone Number</label>
                  <input
                    type="text"
                    required
                    value={simPhone}
                    onChange={(e) => setSimPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Vehicle Model</label>
                  <input
                    type="text"
                    value={simCar}
                    onChange={(e) => setSimCar(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Estimated Value (₹)</label>
                  <input
                    type="number"
                    value={simAmount}
                    onChange={(e) => setSimAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Service Interested In</label>
                <input
                  type="text"
                  value={simService}
                  onChange={(e) => setSimService(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Simulate Ingest Webhook Lead</span>
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
          >
            Close Webhook Hub
          </button>
        </div>
      </div>
    </div>
  );
};
