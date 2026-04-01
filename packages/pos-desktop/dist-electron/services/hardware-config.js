"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_HARDWARE_CONFIG = void 0;
exports.normalizeHardwareConfig = normalizeHardwareConfig;
exports.parseHardwareConfigJson = parseHardwareConfigJson;
exports.serializeHardwareConfig = serializeHardwareConfig;
exports.toThermalInterface = toThermalInterface;
const DEFAULT_COPY_COUNT = 1;
const DEFAULT_LAN_PORT = 9100;
const DEFAULT_TARGET = '127.0.0.1';
const DEFAULT_TIMEOUT_MS = 3000;
const MIN_COPY_COUNT = 1;
const MAX_COPY_COUNT = 5;
const MIN_PORT = 1;
const MAX_PORT = 65535;
const MIN_TIMEOUT_MS = 500;
const MAX_TIMEOUT_MS = 20000;
const MIN_PULSE = 0;
const MAX_PULSE = 255;
exports.DEFAULT_HARDWARE_CONFIG = {
    connectionMode: 'LAN',
    copyCount: DEFAULT_COPY_COUNT,
    drawerPulse: {
        off: 120,
        on: 50,
    },
    port: DEFAULT_LAN_PORT,
    target: DEFAULT_TARGET,
    timeout: DEFAULT_TIMEOUT_MS,
};
function clamp(value, min, max) {
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
}
function parseNumber(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
}
function parseConnectionMode(value) {
    if (value === 'LAN' || value === 'USB') {
        return value;
    }
    return exports.DEFAULT_HARDWARE_CONFIG.connectionMode;
}
function normalizeHardwareConfig(input) {
    const source = typeof input === 'object' && input !== null
        ? input
        : {};
    const drawerPulseSource = typeof source.drawerPulse === 'object' && source.drawerPulse !== null
        ? source.drawerPulse
        : {};
    const targetRaw = typeof source.target === 'string' ? source.target.trim() : '';
    return {
        connectionMode: parseConnectionMode(source.connectionMode),
        copyCount: Math.round(clamp(parseNumber(source.copyCount, exports.DEFAULT_HARDWARE_CONFIG.copyCount), MIN_COPY_COUNT, MAX_COPY_COUNT)),
        drawerPulse: {
            off: Math.round(clamp(parseNumber(drawerPulseSource.off, exports.DEFAULT_HARDWARE_CONFIG.drawerPulse.off), MIN_PULSE, MAX_PULSE)),
            on: Math.round(clamp(parseNumber(drawerPulseSource.on, exports.DEFAULT_HARDWARE_CONFIG.drawerPulse.on), MIN_PULSE, MAX_PULSE)),
        },
        port: Math.round(clamp(parseNumber(source.port, exports.DEFAULT_HARDWARE_CONFIG.port), MIN_PORT, MAX_PORT)),
        target: targetRaw.length > 0 ? targetRaw : exports.DEFAULT_HARDWARE_CONFIG.target,
        timeout: Math.round(clamp(parseNumber(source.timeout, exports.DEFAULT_HARDWARE_CONFIG.timeout), MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)),
    };
}
function parseHardwareConfigJson(raw) {
    if (!raw) {
        return { ...exports.DEFAULT_HARDWARE_CONFIG };
    }
    try {
        const parsed = JSON.parse(raw);
        return normalizeHardwareConfig(parsed);
    }
    catch {
        return { ...exports.DEFAULT_HARDWARE_CONFIG };
    }
}
function serializeHardwareConfig(config) {
    return JSON.stringify(normalizeHardwareConfig(config));
}
function toThermalInterface(config) {
    if (config.connectionMode === 'USB') {
        return `printer:${config.target}`;
    }
    return `tcp://${config.target}:${config.port}`;
}
//# sourceMappingURL=hardware-config.js.map