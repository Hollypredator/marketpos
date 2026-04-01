"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashDrawerService = void 0;
const node_thermal_printer_1 = require("node-thermal-printer");
const hardware_config_1 = require("./hardware-config");
class CashDrawerService {
    getHardwareConfig;
    constructor(config) {
        this.getHardwareConfig = config.getHardwareConfig;
    }
    async openDrawer(options) {
        const reason = options?.reason ?? 'manual';
        const operator = options?.operatorId ?? 'unknown';
        const hardwareConfig = this.getHardwareConfig();
        const interfaceName = (0, hardware_config_1.toThermalInterface)(hardwareConfig);
        const printer = new node_thermal_printer_1.printer({
            interface: interfaceName,
            options: {
                timeout: hardwareConfig.timeout,
            },
            type: node_thermal_printer_1.types.EPSON,
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
            console.log(`[cash-drawer] opened | reason=${reason} | operator=${operator} | interface=${interfaceName}`);
            return {
                interfaceName,
                message: 'Para cekmecesi ac komutu gonderildi.',
                openedAt: new Date().toISOString(),
                operatorAction: 'NONE',
                success: true,
            };
        }
        catch (error) {
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
    clampPulse(value) {
        if (value < 0) {
            return 0;
        }
        if (value > 255) {
            return 255;
        }
        return Math.round(value);
    }
    readErrorMessage(error, fallback) {
        if (error instanceof Error && error.message.trim().length > 0) {
            return error.message;
        }
        return fallback;
    }
}
exports.CashDrawerService = CashDrawerService;
//# sourceMappingURL=cash-drawer.js.map