import { User, Service, PaymentMode, LocationHistory } from '../types';

export interface PartnerAuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
}

export interface PartnerLocationPayload {
  orderId: string;
  partnerUsername: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  batteryLevel?: number;
  timestamp: string;
}

export interface PartnerPaymentUpdatePayload {
  paymentMode: PaymentMode;
  cashCollected?: number;
  onlineAmount?: number;
  paymentNotes?: string;
  transactionReference?: string;
}

export interface PartnerCustomerUpdatePayload {
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  carRegNo?: string;
  carBrand?: string;
  carModel?: string;
}

export interface PartnerMediaUploadPayload {
  beforeWashingPhoto?: string;
  afterWashingPhoto?: string;
  beforeVideoInventory?: string;
  afterVideoExterior?: string;
  notes?: string;
}

export interface PartnerWalletSummary {
  todayEarnings: number;
  totalJobPayouts: number;
  cashInHand: number;
  onlineProcessed: number;
  completedJobsCount: number;
  rankTier: string;
  incentivesBonus: number;
}

class PartnerBridgeService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '');
  }

  public async authenticate(username: string, pinOrPassword: string): Promise<PartnerAuthResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/api/neon/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: pinOrPassword })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success' && data.user) {
        return {
          success: true,
          user: data.user,
          token: data.token || `partner_${Date.now()}`
        };
      }
      return { success: false, error: data.message || 'Invalid credentials' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error connecting to bridge' };
    }
  }

  public async getAssignedOrders(partnerUsername: string): Promise<Service[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/neon/orders?limit=1000`);
      const data = await res.json();
      if (res.ok && data.status === 'success' && Array.isArray(data.data)) {
        return data.data.filter((order: any) => {
          const mechanic = (order.assignedMechanic || order.assignedTo || '').toLowerCase();
          const target = partnerUsername.toLowerCase();
          return mechanic === target || !mechanic || mechanic === 'unassigned';
        });
      }
      return [];
    } catch {
      return [];
    }
  }

  public async broadcastLiveLocation(payload: PartnerLocationPayload): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/neon/orders/${encodeURIComponent(payload.orderId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          riderLatitude: payload.latitude,
          riderLongitude: payload.longitude,
          riderLastUpdate: payload.timestamp,
          isLocationSharingActive: true,
          lastKnownSpeed: payload.speed,
          heading: payload.heading
        })
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async updatePayment(orderId: string, payload: PartnerPaymentUpdatePayload): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/neon/orders/${encodeURIComponent(orderId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMode: payload.paymentMode,
          cashCollected: payload.cashCollected ?? 0,
          onlinePaymentCollected: payload.onlineAmount ?? 0,
          paymentNotes: payload.paymentNotes ?? '',
          transactionReference: payload.transactionReference ?? '',
          paymentStatus: 'Paid'
        })
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async updateCustomerDetails(orderId: string, payload: PartnerCustomerUpdatePayload): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/neon/orders/${encodeURIComponent(orderId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async uploadMediaProofs(orderId: string, payload: PartnerMediaUploadPayload): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/neon/orders/${encodeURIComponent(orderId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          mediaUploadedAt: new Date().toISOString()
        })
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public computePartnerWallet(partnerUsername: string, allOrders: Service[]): PartnerWalletSummary {
    const todayStr = new Date().toISOString().split('T')[0];
    let todayEarnings = 0;
    let totalJobPayouts = 0;
    let cashInHand = 0;
    let onlineProcessed = 0;
    let completedJobsCount = 0;

    for (const order of allOrders) {
      const isAssigned = ((order as any).assignedMechanic || order.assignedTo || '').toLowerCase() === partnerUsername.toLowerCase();
      if (!isAssigned) continue;

      const isCompleted = ['completed', 'delivered', 'done', 'closed'].includes((order.status || '').toLowerCase());
      const isToday = (order.scheduledDate || (order as any).orderDate || '').startsWith(todayStr);

      const jobAmount = Number(order.grandTotal || (order as any).totalAmount || (order as any).estimatedCost || 0);
      const commission = Math.round(jobAmount * 0.25) || 150;

      if (isCompleted) {
        completedJobsCount += 1;
        totalJobPayouts += commission;
        if (isToday) {
          todayEarnings += commission;
        }
      }

      if (order.paymentMode === 'Cash') {
        cashInHand += Number((order as any).cashCollected || order.cashAmount || jobAmount);
      } else if (order.paymentMode === 'Online') {
        onlineProcessed += Number((order as any).onlinePaymentCollected || order.onlineAmount || jobAmount);
      }
    }

    let rankTier = 'Bronze Partner';
    if (completedJobsCount > 100) rankTier = 'Platinum Elite';
    else if (completedJobsCount > 50) rankTier = 'Gold Specialist';
    else if (completedJobsCount > 20) rankTier = 'Silver Pro';

    return {
      todayEarnings,
      totalJobPayouts,
      cashInHand,
      onlineProcessed,
      completedJobsCount,
      rankTier,
      incentivesBonus: completedJobsCount >= 5 ? 250 : 0
    };
  }
}

export const partnerBridge = new PartnerBridgeService();
