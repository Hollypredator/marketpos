import { randomUUID } from 'node:crypto';

export type EInvoiceType = 'E_ARCHIVE' | 'E_INVOICE';
export type EInvoiceStatus = 'PENDING' | 'SENT' | 'FAILED' | 'REJECTED';

export interface EInvoicePayload {
  customerTaxNumber?: string;
  customerName: string;
  customerAddress?: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    total: number;
  }>;
  totalAmount: number;
  totalVat: number;
  issueDate: string;
}

export interface EInvoiceResult {
  externalId: string;
  invoiceNumber: string; // Fatura No (e.g., GIB2023000000001)
  status: EInvoiceStatus;
  viewUrl: string;
  qrCodeData?: string;
}

/**
 * Service to handle e-Invoice (e-Fatura) and e-Archive (e-Arşiv) operations.
 * Following Turkish VUK-507 and GİB standards.
 */
export class EInvoiceService {
  constructor() {}

  /**
   * Generates and sends an e-Archive/e-Invoice.
   * Mock implementation for competitive analysis phase.
   */
  public async createInvoice(payload: EInvoicePayload): Promise<EInvoiceResult> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    const isEInvoice = payload.customerTaxNumber && payload.customerTaxNumber.length === 10;
    const type: EInvoiceType = isEInvoice ? 'E_INVOICE' : 'E_ARCHIVE';
    const prefix = type === 'E_INVOICE' ? 'EFN' : 'EAR';
    const year = new Date().getFullYear();
    const sequence = Math.floor(Math.random() * 1000000).toString().padStart(9, '0');
    
    return {
      externalId: randomUUID(),
      invoiceNumber: `${prefix}${year}${sequence}`,
      status: 'SENT',
      viewUrl: `https://mock-gib-portal.gov.tr/view/${randomUUID()}`,
      qrCodeData: `https://marketpos.app/verify/${randomUUID()}`,
    };
  }

  public async getInvoiceStatus(externalId: string): Promise<EInvoiceStatus> {
    return 'SENT';
  }
}
