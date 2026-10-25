import React, { useState } from 'react';
import Card from '../ui/Card';
import { 
  useHaptics 
} from '../../hooks/useHaptics';
import { 
  Smartphone, 
  Vibrate, 
  VibrateOff, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Zap, 
  Play, 
  Bell, 
  ShieldCheck, 
  Sparkles,
  Layers,
  Sliders
} from 'lucide-react';
import { toast } from 'sonner';

export const HapticsSettingsTab: React.FC = () => {
  const { 
    enabled, 
    supported, 
    isAndroid, 
    isTouch, 
    setEnabled, 
    trigger 
  } = useHaptics();

  const [customDuration, setCustomDuration] = useState<number>(35);
  const [lastTestedPattern, setLastTestedPattern] = useState<string | null>(null);

  const testHaptic = (type: any, label: string) => {
    setLastTestedPattern(label);
    const didVibrate = trigger(type);
    if (!enabled) {
      toast.info('Haptics are currently disabled. Toggle on above to feel vibrations.');
    } else if (!supported) {
      toast.error('Vibration API is not supported on this browser/device.');
    } else if (didVibrate) {
      toast.success(`Triggered "${label}" tactile pattern`, { duration: 1500 });
    }
  };

  const testCustom = () => {
    setLastTestedPattern(`Custom (${customDuration}ms)`);
    if (!enabled) {
      toast.info('Haptics are currently disabled.');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(customDuration);
      toast.success(`Vibrated for ${customDuration}ms`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview & Status Header */}
      <Card>
        <div className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-2xl text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
                <Smartphone className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  Android & Mobile Haptic Feedback
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                    Tactile Engine
                  </span>
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                  Physical vibration feedback on touch interactions, button presses, tab switches, order completions, and smart alerts for Android and mobile browsers.
                </p>
              </div>
            </div>

            {/* Master Toggle */}
            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex-shrink-0">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {enabled ? 'Haptics ON' : 'Haptics OFF'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => {
                  setEnabled(!enabled);
                  toast.success(enabled ? 'Haptic feedback disabled' : 'Haptic feedback enabled with tactile confirmation!');
                }}
                className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  enabled ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Device Capabilities Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
              <div className={`p-2 rounded-lg ${isAndroid ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400 font-medium">Device Architecture</div>
                <div className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  {isAndroid ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      Android Device Detected
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                      Desktop / Non-Android ({isTouch ? 'Touch Screen' : 'Mouse'})
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
              <div className={`p-2 rounded-lg ${supported ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400'}`}>
                {supported ? <Vibrate className="w-5 h-5" /> : <VibrateOff className="w-5 h-5" />}
              </div>
              <div>
                <div className="text-xs text-slate-400 font-medium">Vibration API</div>
                <div className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  {supported ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Hardware Supported (W3C)
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      Not Supported (iOS/Safari)
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
              <div className={`p-2 rounded-lg ${enabled ? 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400' : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400 font-medium">Engine Status</div>
                <div className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  {enabled ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      Active & Listening
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                      Muted by User
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Interactive Tactile Playground */}
      <Card>
        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Interactive Haptic Test Playground
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Tap any of the buttons below on your Android mobile device to feel the calibrated vibration waveforms.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {/* Light */}
            <button
              type="button"
              onClick={() => testHaptic('light', 'Light Tap')}
              className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-amber-400 transition-all text-left group active:scale-95 shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Light Tap</div>
                  <div className="text-[11px] text-slate-400">12ms • Buttons, icons, chips</div>
                </div>
              </div>
              <Play className="w-4 h-4 text-slate-300 group-hover:text-amber-500 transition-colors" />
            </button>

            {/* Selection */}
            <button
              type="button"
              onClick={() => testHaptic('selection', 'Tab Selection')}
              className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-blue-400 transition-all text-left group active:scale-95 shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Tab Selection</div>
                  <div className="text-[11px] text-slate-400">15ms • Bottom nav & tabs</div>
                </div>
              </div>
              <Play className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
            </button>

            {/* Medium Impact */}
            <button
              type="button"
              onClick={() => testHaptic('medium', 'Medium Impact')}
              className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-purple-400 transition-all text-left group active:scale-95 shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Medium Impact</div>
                  <div className="text-[11px] text-slate-400">28ms • Switches, cards, FAB</div>
                </div>
              </div>
              <Play className="w-4 h-4 text-slate-300 group-hover:text-purple-500 transition-colors" />
            </button>

            {/* Success */}
            <button
              type="button"
              onClick={() => testHaptic('success', 'Order Complete')}
              className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-emerald-400 transition-all text-left group active:scale-95 shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Success Wave</div>
                  <div className="text-[11px] text-slate-400">[15, 50, 30]ms • Job finished</div>
                </div>
              </div>
              <Play className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-colors" />
            </button>

            {/* Warning */}
            <button
              type="button"
              onClick={() => testHaptic('warning', 'Warning Alert')}
              className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-amber-400 transition-all text-left group active:scale-95 shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Warning Alert</div>
                  <div className="text-[11px] text-slate-400">[30, 60, 30]ms • Low stock / quota</div>
                </div>
              </div>
              <Play className="w-4 h-4 text-slate-300 group-hover:text-amber-500 transition-colors" />
            </button>

            {/* Error */}
            <button
              type="button"
              onClick={() => testHaptic('error', 'Error / Delete')}
              className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-rose-400 transition-all text-left group active:scale-95 shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 group-hover:scale-110 transition-transform">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Error / Delete</div>
                  <div className="text-[11px] text-slate-400">Triple pulse • Delete confirm</div>
                </div>
              </div>
              <Play className="w-4 h-4 text-slate-300 group-hover:text-rose-500 transition-colors" />
            </button>

            {/* Start Timer / Clock */}
            <button
              type="button"
              onClick={() => testHaptic('start', 'Start Service')}
              className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-indigo-400 transition-all text-left group active:scale-95 shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                  <Play className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Job Start / Clock In</div>
                  <div className="text-[11px] text-slate-400">[20, 40, 25]ms • Service start</div>
                </div>
              </div>
              <Play className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
            </button>

            {/* Notification Bell */}
            <button
              type="button"
              onClick={() => testHaptic('notification', 'New Lead / Alert')}
              className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-teal-400 transition-all text-left group active:scale-95 shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 group-hover:scale-110 transition-transform">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Smart Alert Pulse</div>
                  <div className="text-[11px] text-slate-400">[30, 80, 30, 80, 50]ms • New lead</div>
                </div>
              </div>
              <Play className="w-4 h-4 text-slate-300 group-hover:text-teal-500 transition-colors" />
            </button>

            {/* Heavy Impact */}
            <button
              type="button"
              onClick={() => testHaptic('heavy', 'Heavy Strike')}
              className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-500 transition-all text-left group active:scale-95 shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 group-hover:scale-110 transition-transform">
                  <Vibrate className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Heavy Strike</div>
                  <div className="text-[11px] text-slate-400">45ms • Dialog open, save</div>
                </div>
              </div>
              <Play className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
            </button>
          </div>

          {/* Custom Duration Slider */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-500" />
                Custom Duration Tester: <span className="text-amber-600 dark:text-amber-400 font-mono">{customDuration} ms</span>
              </label>
              <button
                type="button"
                onClick={testCustom}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-xs active:scale-95 flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Test Custom Pulse
              </button>
            </div>
            <input
              type="range"
              min="5"
              max="250"
              step="5"
              value={customDuration}
              onChange={(e) => setCustomDuration(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>5ms (Micro click)</span>
              <span>50ms (Medium)</span>
              <span>100ms (Noticeable)</span>
              <span>250ms (Strong)</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Integration Guide / Information */}
      <Card>
        <div className="p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            Android & PWA Haptics Compatibility
          </h3>
          <div className="text-xs text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed">
            <p>
              • <strong>Supported Browsers:</strong> Google Chrome for Android, Samsung Internet, Firefox for Android, Brave, Microsoft Edge Mobile, and Progressive Web Apps (PWA) installed to your home screen.
            </p>
            <p>
              • <strong>Automatic Touch Feedback:</strong> All buttons, bottom navigation icons, tabs, switches, modal dismissals, and order status buttons automatically produce immediate tactile responses without lag.
            </p>
            <p>
              • <strong>Battery Safe:</strong> Pulses use micro-burst millisecond timings (10ms to 45ms) that consume negligible device battery while maximizing tactile responsiveness.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default HapticsSettingsTab;
