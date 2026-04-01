import { printer as ThermalPrinter, types as PrinterTypes } from 'node-thermal-printer';

import type { HardwareConfig } from './hardware-config';
import { toThermalInterface } from './hardware-config';
import type { HardwareErrorCode, HardwareOperatorAction } from './printer';

export interface CashDrawerActionResult {
  errorCode?: HardwareErrorCode;
  interfaceName?: string;
  message: string;
  openedAt: string;
  operatorAction: HardwareOperatorAction;
  success: boolean;
}

export interface CashDrawerOpenOptions {
  operatorId?: string;
  reason?: string;
}

export interface CashDrawerServiceConfig {
  getHardwareConfig: () => HardwareConfig;
}

export class CashDrawerService {
  private readonly getHardwareConfig: () => HardwareConfig;

  public constructor(config: CashDrawerServiceConfig) {
    this.getHardwareConfig = config.getHardwareConfig;
  }

  public async openDrawer(options?: CashDrawerOpenOptions): Promise<CashDrawerActionResult> {
    const reason = options?.reason ?? 'manual';
    const operator = options?.operatorId ?? 'unknown';
    const hardwareConfig = this.getHardwareConfig();
    const interfaceName = toThermalInterface(hardwareConfig);

    const printer = new ThermalPrinter({
      interface: interfaceName,
      options: {
        timeout: hardwareConfig.timeout,
      },
      type: PrinterTypes.EPSON,
    });

    try {
      const connected = await printer.isPrinterConnected();
      if (!connected) {
        return {
          errorCode: 'PRINTER_NOT_CONNECTED',
          interfaceName,
          message: 'Para cekmecesi acilamadi: yaziciya baglanilamadi.',
          openedAt: new Date().toISOString(),
          operatorAction: 'CHECK_PRINTER_CONNECTION',
          success: false,
        };
      }

      const pulseOn = this.clampPulse(hardwareConfig.drawerPulse.on);
      const pulseOff = this.clampPulse(hardwareConfig.drawerPulse.off);
      const pulseBuffer = Buffer.from([0x1b, 0x70, 0x00, pulseOn, pulseOff]);

      await printer.raw(pulseBuffer);
      console.log(
        `[cash-drawer] opened | reason=${reason} | operator=${operator} | interface=${interfaceName}`,
      );

      return {
        interfaceName,
        message: 'Para cekmecesi ac komutu gonderildi.',
        openedAt: new Date().toISOString(),
        operatorAction: 'NONE',
        success: true,
      };
    } catch (error: unknown) {
      return {
        errorCode: 'UNKNOWN',
        interfaceName,
        message: this.readErrorMessage(error, 'Para cekmecesi acma islemi basarisiz oldu.'),
        openedAt: new Date().toISOString(),
        operatorAction: 'CHECK_HARDWARE_SETTINGS',
        success: false,
      };
    }
  }

  private clampPulse(value: number): number {
    if (value < 0) {
      return 0;
    }
    if (value > 255) {
      return 255;
    }
    return Math.round(value);
  }

  private readErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }
    return fallback;
  }
}

