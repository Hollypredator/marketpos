"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrinterService = void 0;
const node_thermal_printer_1 = require("node-thermal-printer");
const hardware_config_1 = require("./hardware-config");
class PrinterService {
    getHardwareConfig;
    constructor(config) {
        this.getHardwareConfig = config.getHardwareConfig;
    }
    async printReceipt(payload) {
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
        const interfaceName = (0, hardware_config_1.toThermalInterface)(hardwareConfig);
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
        }
        catch (error) {
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
    createPrinter(config, interfaceName) {
        return new node_thermal_printer_1.printer({
            interface: interfaceName,
            options: {
                timeout: config.timeout,
            },
            type: node_thermal_printer_1.types.EPSON,
        });
    }
    resolveCopyCount(requested, fallback) {
        const candidate = typeof requested === 'number' && Number.isFinite(requested)
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
    resolvePrinterErrorCode(error) {
        const message = this.readErrorMessage(error, '').toLowerCase();
        if (message.includes('not connected') || message.includes('timeout')) {
            return 'PRINTER_NOT_CONNECTED';
        }
        if (message.includes('print') || message.includes('interface')) {
            return 'PRINT_FAILED';
        }
        return 'UNKNOWN';
    }
    readErrorMessage(error, fallback) {
        if (error instanceof Error && error.message.trim().length > 0) {
            return error.message;
        }
        return fallback;
    }
}
exports.PrinterService = PrinterService;
//# sourceMappingURL=printer.js.map