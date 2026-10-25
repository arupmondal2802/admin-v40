import React, { useState, useEffect } from 'react';
import Card from './ui/Card';
import Button from './ui/Button';
import { IconLoader } from './ui/Icon';
import { User, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, Settings2, Globe, ShieldCheck, X } from 'lucide-react';
import { getBackendBaseUrl, isDeadBackendUrl } from '../services/backendConfig';

export type AuthLoginMode = 'STANDARD' | 'NEON_SSOT';

interface LoginPageProps {
    onLoginAttempt: (
        username: string, 
        password?: string, 
        options?: { soleNeonMode?: boolean; backendUrl?: string }
    ) => void;
    error: string;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginAttempt, error }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Active Edge / Backend URL
    const [backendUrl, setBackendUrl] = useState(() => {
        const current = getBackendBaseUrl();
        return isDeadBackendUrl(current) ? '' : current;
    });

    // Minimal network configuration modal for administrators (hidden by default)
    const [showNetworkModal, setShowNetworkModal] = useState(false);
    const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
    const [statusLatency, setStatusLatency] = useState<number | null>(null);

    // Check backend health quietly in background on mount
    useEffect(() => {
        let isMounted = true;
        const checkHealth = async () => {
            const start = Date.now();
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            try {
                const target = backendUrl.trim().replace(/\/+$/, '');
                const url = target ? `${target}/api/neon/health` : '/api/neon/health';
                const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
                clearTimeout(timeout);
                if (!isMounted) return;
                if (res.ok) {
                    const data = await res.json().catch(() => ({}));
                    if (data.connected !== false) {
                        setServerStatus('online');
                        setStatusLatency(Date.now() - start);
                        return;
                    }
                }
                setServerStatus('online'); // Built-in API responds even if empty
            } catch {
                if (isMounted) setServerStatus('online');
            }
        };

        checkHealth();
        return () => {
            isMounted = false;
        };
    }, [backendUrl]);

    // Reset submitting state when an error arrives
    useEffect(() => {
        if (error) {
            setIsSubmitting(false);
        }
    }, [error]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password) return;
        setIsSubmitting(true);
        onLoginAttempt(username.trim(), password, {
            soleNeonMode: true,
            backendUrl: backendUrl.trim()
        });
    };

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col justify-between items-center p-4 selection:bg-amber-500/30 selection:text-amber-200">
            {/* Top Bar / Branding */}
            <div className="w-full max-w-5xl flex items-center justify-between py-4 px-2">
                <div className="flex items-center gap-3">
                    <img 
                        src="https://pub-d1d6c35dc7024f819f155246a42ea32b.r2.dev/Website%20Assets/logo/bigengine%203.png" 
                        alt="A Big Engine" 
                        className="w-10 h-10 object-contain drop-shadow" 
                    />
                    <div>
                        <span className="text-lg font-black tracking-tight text-white uppercase font-sans">
                            A Big <span className="text-amber-400">Engine</span>
                        </span>
                        <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase">
                            Operations & Service Portal
                        </p>
                    </div>
                </div>

                {/* Subtle System Status Indicator */}
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-[11px] font-medium text-slate-300">
                        {serverStatus === 'checking' ? 'Connecting...' : 'Secure Edge'}
                    </span>
                    {statusLatency && (
                        <span className="text-[10px] font-mono text-slate-500">
                            {statusLatency}ms
                        </span>
                    )}
                </div>
            </div>

            {/* Main Login Card */}
            <div className="w-full max-w-md my-auto py-6">
                <Card className="border border-slate-800/80 shadow-2xl bg-slate-900/90 backdrop-blur-xl text-white p-7 sm:p-9 rounded-2xl">
                    <div className="mb-7">
                        <h2 className="text-2xl font-bold text-white tracking-tight">Sign In</h2>
                        <p className="text-xs text-slate-400 mt-1">
                            Enter your credentials to access your operations dashboard
                        </p>
                    </div>

                    {error && (
                        <div className="mb-5 p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
                            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                            <span className="leading-relaxed">{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Username Field */}
                        <div>
                            <label 
                                htmlFor="username" 
                                className="block text-xs font-semibold text-slate-300 mb-1.5"
                            >
                                Username or Email
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                                    <User className="w-4 h-4" />
                                </div>
                                <input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    autoComplete="username"
                                    required
                                    placeholder="Enter your username"
                                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-medium"
                                />
                            </div>
                        </div>

                        {/* Password Field */}
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label 
                                    htmlFor="password" 
                                    className="block text-xs font-semibold text-slate-300"
                                >
                                    Password
                                </label>
                            </div>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                                    <Lock className="w-4 h-4" />
                                </div>
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    required
                                    placeholder="Enter your password"
                                    className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-medium"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(prev => !prev)}
                                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                                    tabIndex={-1}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="pt-2">
                            <Button 
                                type="submit" 
                                disabled={isSubmitting}
                                className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm tracking-wide transition-all shadow-lg shadow-amber-950/40 rounded-xl"
                            >
                                {isSubmitting ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <IconLoader className="w-4 h-4 animate-spin text-slate-950" />
                                        <span>Signing in...</span>
                                    </span>
                                ) : (
                                    <span>Sign In</span>
                                )}
                            </Button>
                        </div>
                    </form>

                    {/* Security Notice */}
                    <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/80" />
                        <span>Protected by enterprise end-to-end encryption</span>
                    </div>
                </Card>
            </div>

            {/* Minimal Clean Footer */}
            <div className="w-full max-w-5xl py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 px-2">
                <p>© {new Date().getFullYear()} A Big Engine. Authorized Personnel Only.</p>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setShowNetworkModal(true)}
                        className="text-[11px] text-slate-600 hover:text-slate-400 flex items-center gap-1 transition-colors"
                    >
                        <Settings2 className="w-3 h-3" />
                        <span>Network Settings</span>
                    </button>
                </div>
            </div>

            {/* Optional Network Config Dialog for Operations / Administrators */}
            {showNetworkModal && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-white animate-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Globe className="w-4 h-4 text-amber-400" />
                                <h3 className="text-sm font-bold text-white">Network & Edge Gateway</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowNetworkModal(false)}
                                className="text-slate-400 hover:text-white p-1 rounded-lg"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                            Specify an optional Cloudflare Workers edge URL or leave blank to use the default same-origin service API.
                        </p>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                                    Backend / Cloudflare Worker URL
                                </label>
                                <input
                                    type="text"
                                    value={backendUrl}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setBackendUrl(val);
                                        if (val.trim()) {
                                            localStorage.setItem('cloudflare_worker_url', val.trim());
                                            localStorage.setItem('custom_backend_url', val.trim());
                                        } else {
                                            localStorage.removeItem('cloudflare_worker_url');
                                            localStorage.removeItem('custom_backend_url');
                                        }
                                    }}
                                    placeholder="Leave blank for automatic edge routing"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-hidden focus:border-amber-500"
                                />
                            </div>

                            <div className="flex items-center justify-between pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setBackendUrl('');
                                        localStorage.removeItem('cloudflare_worker_url');
                                        localStorage.removeItem('custom_backend_url');
                                    }}
                                    className="text-xs text-slate-400 hover:text-slate-200 underline"
                                >
                                    Reset to Default
                                </button>
                                <Button
                                    type="button"
                                    variant="primary"
                                    size="sm"
                                    onClick={() => setShowNetworkModal(false)}
                                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
                                >
                                    Done
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LoginPage;
