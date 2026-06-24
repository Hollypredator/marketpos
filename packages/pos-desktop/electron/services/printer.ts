import { printer as ThermalPrinter, types as PrinterTypes } from 'node-thermal-printer';

import type { HardwareConfig } from './hardware-config';
import { toThermalInterface } from './hardware-config';

export type HardwareErrorCode =
  | 'NO_LAST_RECEIPT'
  | 'NO_RECEIPT_CONTENT'
  | 'PRINTER_NOT_CONNECTED'
  | 'PRINT_FAILED'
  | 'UNKNOWN';

export type HardwareOperatorAction =
  | 'CHECK_HARDWARE_SETTINGS'
  | 'CHECK_PRINTER_CONNECTION'
  | 'NONE'
  | 'RETRY_PRINT';

export interface PrinterActionResult {
  errorCode?: HardwareErrorCode;
  interfaceName?: string;
  message: string;
  operatorAction: HardwareOperatorAction;
  printedAt: string;
  success: boolean;
}

export interface ReceiptPrintPayload {
  copyCount?: number;
  lines: string[];
}

export interface PrinterServiceConfig {
  getHardwareConfig: () => HardwareConfig;
}

export class PrinterService {
  private readonly getHardwareConfig: () => HardwareConfig;

  public constructor(config: PrinterServiceConfig) {
    this.getHardwareConfig = config.getHardwareConfig;
  }

  public async printReceipt(payload: ReceiptPrintPayload): Promise<PrinterActionResult> {
    if (payload.lines.length === 0) {
      return {
        errorCode: 'NO_RECEIPT_CONTENT',
        message: 'Fis icerigi bos oldugu icin yazdirma yapilmadi.',
        operatorAction: 'RETRY_PRINT',
        printedAt: new Date().toISOString(),
        success: false,
      };
    }

    const hardwareConfig = this.getHardwareConfig();
    const interfaceName = toThermalInterface(hardwareConfig);
    const copyCount = this.resolveCopyCount(payload.copyCount, hardwareConfig.copyCount);
    const printer = this.createPrinter(hardwareConfig, interfaceName);

    try {
      const connected = await printer.isPrinterConnected();
      if (!connected) {
        return {
          errorCode: 'PRINTER_NOT_CONNECTED',
          interfaceName,
          message: 'Yaziciya baglanilamadi.',
          operatorAction: 'CHECK_PRINTER_CONNECTION',
          printedAt: new Date().toISOString(),
          success: false,
        };
      }

      for (let index = 0; index < copyCount; index += 1) {
        printer.clear();
        printer.alignLeft();
        for (const line of payload.lines) {
          printer.println(line);
        }
        printer.cut();
        await printer.execute({ docname: `MarketPOS-Receipt-${index + 1}` });
      }

      return {
        interfaceName,
        message: `Fis yazdirma islemi tamamlandi (${copyCount} kopya).`,
        operatorAction: 'NONE',
        printedAt: new Date().toISOString(),
        success: true,
      };
    } catch (error: unknown) {
      return {
        errorCode: this.resolvePrinterErrorCode(error),
        interfaceName,
        message: this.readErrorMessage(error, 'Yazdirma islemi basarisiz oldu.'),
        operatorAction: 'CHECK_HARDWARE_SETTINGS',
        printedAt: new Date().toISOString(),
        success: false,
      };
    }
  }

  public async printBarcode(
    payload: { barcode: string; name: string; price: number; copyCount?: number }
  ): Promise<PrinterActionResult> {
    const hardwareConfig = this.getHardwareConfig();
    const interfaceName = toThermalInterface(hardwareConfig);
    const copyCount = this.resolveCopyCount(payload.copyCount, 1);
    const printer = this.createPrinter(hardwareConfig, interfaceName);

    try {
      const connected = await printer.isPrinterConnected();
      if (!connected) {
        return {
          errorCode: 'PRINTER_NOT_CONNECTED',
          interfaceName,
          message: 'Yaziciya baglanilamadi.',
          operatorAction: 'CHECK_PRINTER_CONNECTION',
          printedAt: new Date().toISOString(),
          success: false,
        };
      }

      for (let index = 0; index < copyCount; index += 1) {
        printer.clear();
        printer.alignCenter();
        printer.println(payload.name);
        printer.println(`Fiyat: ${payload.price.toFixed(2)} TL`);
        // We use code128 for general barcodes
        printer.printBarcode(payload.barcode, 73, { width: 2, height: 60 });
        printer.cut();
        await printer.execute({ docname: `MarketPOS-Barcode-${payload.barcode}-${index + 1}` });
      }

      return {
        interfaceName,
        message: `Etiket yazdirma islemi tamamlandi (${copyCount} kopya).`,
        operatorAction: 'NONE',
        printedAt: new Date().toISOString(),
        success: true,
      };
    } catch (error: unknown) {
      return {
        errorCode: this.resolvePrinterErrorCode(error),
        interfaceName,
        message: this.readErrorMessage(error, 'Etiket yazdirma islemi basarisiz oldu.'),
        operatorAction: 'CHECK_HARDWARE_SETTINGS',
        printedAt: new Date().toISOString(),
        success: false,
      };
    }
  }

  private createPrinter(config: HardwareConfig, interfaceName: string): ThermalPrinter {
    return new ThermalPrinter({
      interface: interfaceName,
      options: {
        timeout: config.timeout,
      },
      type: PrinterTypes.EPSON,
    });
  }

  private resolveCopyCount(requested: number | undefined, fallback: number): number {
    const candidate =
      typeof requested === 'number' && Number.isFinite(requested)
        ? requested
        : fallback;
    const rounded = Math.round(candidate);
    if (rounded < 1) {
      return 1;
    }
    if (rounded > 5) {
      return 5;
    }
    return rounded;
  }

  private resolvePrinterErrorCode(error: unknown): HardwareErrorCode {
    const message = this.readErrorMessage(error, '').toLowerCase();
    if (message.includes('not connected') || message.includes('timeout')) {
      return 'PRINTER_NOT_CONNECTED';
    }
    if (message.includes('print') || message.includes('interface')) {
      return 'PRINT_FAILED';
    }
    return 'UNKNOWN';
  }

  private readErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }
    return fallback;
  }
}

