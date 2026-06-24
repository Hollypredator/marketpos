import { randomUUID } from 'node:crypto';

export type YNOKCBrand = 'BEKO' | 'HUGIN' | 'INGENICO' | 'PPROFILO';
export type YNOKCPaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export interface YNOKCPaymentPayload {
  amount: number;
  paymentType: 'CASH' | 'CREDIT_CARD';
  registerId: string;
  zReportNo?: string;
  receiptNo?: string;
}

export interface YNOKCResult {
  transactionId: string;
  okcSerial: string;
  zNo: string;
  receiptNo: string;
  status: YNOKCPaymentStatus;
  timestamp: string;
}

/**
 * Manager for Yazarkasa-POS (YN ÖKC) hardware communications.
 * Handles the "Pay-at-Counter" protocol foundations.
 */
export class YNOKCManager {
  private config: { brand: YNOKCBrand; ip: string; port: number } | null = null;

  constructor() {}

  public configure(config: { brand: YNOKCBrand; ip: string; port: number }): void {
    this.config = config;
  }

  /**
   * Sends a payment request to the YN ÖKC device.
   * Mock implementation for competitive integration phase.
   */
  public async processPayment(payload: YNOKCPaymentPayload): Promise<YNOKCResult> {
    if (!this.config) {
      throw new Error('YN OKC cihazi yuklu veya yapilandirilmis degil.');
    }

    // Simulate hardware wait (network call to physical device)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Simulate a 5% failure rate for realism in demo
    if (Math.random() < 0.05) {
      throw new Error('OKC cihazi ile baglanti koptu veya zaman asimi (Timeout).');
    }

    return {
      transactionId: randomUUID(),
      okcSerial: `${this.config.brand.substring(0, 3)}${Math.floor(Math.random() * 1000000)}`,
      zNo: Math.floor(Math.random() * 1000).toString(),
      receiptNo: Math.floor(Math.random() * 9999).toString().padStart(4, '0'),
      status: 'SUCCESS',
      timestamp: new Date().toISOString(),
    };
  }
}
