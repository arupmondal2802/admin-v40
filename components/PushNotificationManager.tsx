import React, { useState, useEffect, useCallback } from 'react';
import Button from './ui/Button';
import { IconBell, IconBellRinging, IconLoader, IconCheck, IconAlertTriangle } from './ui/Icon';
import { 
  isNativeNotificationSupported, 
  getNativeNotificationPermission, 
  requestNativeNotificationPermission,
  sendTestNativeNotification 
} from '../services/notificationService';
import { NotificationPreferences } from '../types';
import { getApiUrl } from '../services/backendConfig';

interface Props {
  onUpdateSubscription: (subscription: PushSubscriptionJSON | null) => void;
  prefs?: NotificationPreferences;
}

type PushStatus = 'LOADING' | 'SUPPORTED_ENABLED' | 'SUPPORTED_DISABLED' | 'UNSUPPORTED' | 'DENIED';

// Helper to convert VAPID public key
const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

const PushNotificationManager: React.FC<Props> = ({ onUpdateSubscription, prefs }) => {
  const [pushStatus, setPushStatus] = useState<PushStatus>('LOADING');
  const [nativePermission, setNativePermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isTestSending, setIsTestSending] = useState(false);
  const [error, setError] = useState('');
  const [testSuccess, setTestSuccess] = useState(false);

  const updateStatus = useCallback(async () => {
    if (!isNativeNotificationSupported()) {
      setNativePermission('unsupported');
      setPushStatus('UNSUPPORTED');
      return;
    }

    const currentPermission = getNativeNotificationPermission();
    setNativePermission(currentPermission);

    if (currentPermission === 'denied') {
      setPushStatus('DENIED');
      return;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus(currentPermission === 'granted' ? 'SUPPORTED_ENABLED' : 'SUPPORTED_DISABLED');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setPushStatus(subscription ? 'SUPPORTED_ENABLED' : (currentPermission === 'granted' ? 'SUPPORTED_ENABLED' : 'SUPPORTED_DISABLED'));
    } catch {
      setPushStatus(currentPermission === 'granted' ? 'SUPPORTED_ENABLED' : 'SUPPORTED_DISABLED');
    }
  }, []);

  useEffect(() => {
    updateStatus();
  }, [updateStatus]);

  const handleRequestNativePermission = async () => {
    setIsActionLoading(true);
    setError('');
    try {
      const perm = await requestNativeNotificationPermission();
      setNativePermission(perm);
      if (perm === 'granted') {
        // Also attempt push subscription if supported
        await handleSubscribe();
      } else if (perm === 'denied') {
        setError('Notification permission was denied in your browser settings.');
        setPushStatus('DENIED');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to request notification permission.');
    } finally {
      setIsActionLoading(false);
      updateStatus();
    }
  };

  const handleSubscribe = async () => {
    setIsActionLoading(true);
    setError('');

    if (Notification.permission === 'denied') {
      setError('Notification permission was denied. Please enable notifications in your browser settings.');
      setIsActionLoading(false);
      return;
    }

    try {
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const registration = await navigator.serviceWorker.ready;
        
        // Attempt VAPID retrieval from /api/get-vapid-key or /.netlify/functions/get-vapid-key
        let publicKey: string | null = null;
        try {
          const keyResponse = await fetch(getApiUrl('/api/get-vapid-key'));
          if (keyResponse.ok) {
            const data = await keyResponse.json();
            publicKey = data.publicKey;
          }
        } catch {
          // Ignore and fallback to netlify path
        }

        if (!publicKey) {
          try {
            const keyResponse = await fetch('/.netlify/functions/get-vapid-key');
            if (keyResponse.ok) {
              const data = await keyResponse.json();
              publicKey = data.publicKey;
            }
          } catch {
            // Push serverless key not present, continue with client-side native permissions
          }
        }

        if (publicKey) {
          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
          onUpdateSubscription(subscription.toJSON());
        }
      }

      setPushStatus('SUPPORTED_ENABLED');
    } catch (err: any) {
      console.warn('Push subscription note:', err);
      // Even if background push VAPID fails, native foreground/service-worker notifications still work if permission granted!
      if (Notification.permission === 'granted') {
        setPushStatus('SUPPORTED_ENABLED');
      } else {
        setError(`Failed to activate notifications: ${err?.message || 'Unknown error'}`);
        setPushStatus('SUPPORTED_DISABLED');
      }
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    setIsActionLoading(true);
    setError('');
    try {
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
        }
      }
      onUpdateSubscription(null);
      setPushStatus('SUPPORTED_DISABLED');
    } catch (err) {
      console.error('Error unsubscribing:', err);
      setError('Failed to disable. Please try again.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSendTest = async () => {
    setIsTestSending(true);
    setTestSuccess(false);
    setError('');
    try {
      const delivered = await sendTestNativeNotification(prefs);
      if (delivered) {
        setTestSuccess(true);
        setTimeout(() => setTestSuccess(false), 4000);
      } else {
        if (nativePermission !== 'granted') {
          setError('Permission not granted yet. Click "Enable Notifications" first.');
        } else {
          setTestSuccess(true); // Sound/in-app alert played
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Could not send test notification.');
    } finally {
      setIsTestSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Current Permission Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border bg-slate-50/80 border-slate-200">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            nativePermission === 'granted' 
              ? 'bg-emerald-100 text-emerald-700' 
              : nativePermission === 'denied'
                ? 'bg-rose-100 text-rose-700'
                : 'bg-amber-100 text-amber-700'
          }`}>
            {nativePermission === 'granted' ? (
              <IconCheck className="w-5 h-5" strokeWidth={2.5} />
            ) : nativePermission === 'denied' ? (
              <IconAlertTriangle className="w-5 h-5" />
            ) : (
              <IconBell className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 text-sm">Native Device Notifications</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                nativePermission === 'granted'
                  ? 'bg-emerald-100 text-emerald-800'
                  : nativePermission === 'denied'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-amber-100 text-amber-800'
              }`}>
                {nativePermission === 'granted' ? 'Allowed' : nativePermission === 'denied' ? 'Blocked' : 'Not Allowed'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {nativePermission === 'granted'
                ? (prefs?.consentGranted
                    ? 'Your browser is permitted and consent is active to receive load-managed banner alerts.'
                    : 'Browser permission is granted, but notifications remain deactivated by default in settings to manage notification load.')
                : nativePermission === 'denied'
                  ? 'Notifications are blocked in your browser settings. To allow them, click the padlock icon in your URL bar.'
                  : 'Grant browser permission to receive OS banners, ringtones, and vibration alerts.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {nativePermission !== 'granted' && nativePermission !== 'unsupported' && (
            <Button
              id="enable-native-notifications-btn"
              size="sm"
              onClick={handleRequestNativePermission}
              disabled={isActionLoading || nativePermission === 'denied'}
            >
              {isActionLoading ? (
                <IconLoader className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <IconBellRinging className="w-4 h-4 mr-1.5" />
              )}
              Enable Notifications
            </Button>
          )}

          {nativePermission === 'granted' && (
            <Button
              id="test-native-notification-btn"
              variant="secondary"
              size="sm"
              onClick={handleSendTest}
              disabled={isTestSending}
            >
              {isTestSending ? (
                <IconLoader className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <IconBell className="w-4 h-4 mr-1.5" />
              )}
              Test Notification
            </Button>
          )}
        </div>
      </div>

      {testSuccess && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-medium animate-fadeIn">
          <IconCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Test notification sent! Check your notification tray or lock screen.</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs font-medium">
          <IconAlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default PushNotificationManager;

