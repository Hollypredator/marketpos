import { describe, expect, it } from 'vitest';

import { IPC_CHANNELS } from './ipc';

describe('ipc contracts', () => {
  it('includes hardware channels required for pilot', () => {
    expect(IPC_CHANNELS.HARDWARE_GET_CONFIG).toBe('hardware:get-config');
    expect(IPC_CHANNELS.HARDWARE_SET_CONFIG).toBe('hardware:set-config');
    expect(IPC_CHANNELS.HARDWARE_TEST_PRINT).toBe('hardware:test-print');
    expect(IPC_CHANNELS.HARDWARE_TEST_DRAWER).toBe('hardware:test-drawer');
    expect(IPC_CHANNELS.HARDWARE_REPRINT_LAST_RECEIPT).toBe(
      'hardware:reprint-last-receipt',
    );
  });

  it('includes license channels for package access control', () => {
    expect(IPC_CHANNELS.LICENSE_GET_ACCESS_SNAPSHOT).toBe(
      'license:get-access-snapshot',
    );
    expect(IPC_CHANNELS.LICENSE_SET_ACCESS_SNAPSHOT).toBe(
      'license:set-access-snapshot',
    );
  });

  it('includes setup channels for first boot wizard', () => {
    expect(IPC_CHANNELS.SETUP_GET_STATE).toBe('setup:get-state');
    expect(IPC_CHANNELS.SETUP_UPDATE_STEP).toBe('setup:update-step');
    expect(IPC_CHANNELS.SETUP_COMPLETE).toBe('setup:complete');
    expect(IPC_CHANNELS.SETUP_RESET).toBe('setup:reset');
    expect(IPC_CHANNELS.SETUP_SET_OFFLINE_READINESS).toBe('setup:set-offline-readiness');
    expect(IPC_CHANNELS.SETUP_INCREMENT_OPERATOR_INTERVENTION).toBe(
      'setup:increment-operator-intervention',
    );
    expect(IPC_CHANNELS.SETUP_MARK_FIRST_SALE).toBe('setup:mark-first-sale');
  });

  it('includes backup and operations channels for enterprise runtime', () => {
    expect(IPC_CHANNELS.BACKUP_CREATE).toBe('backup:create');
    expect(IPC_CHANNELS.BACKUP_GET_POLICY).toBe('backup:get-policy');
    expect(IPC_CHANNELS.BACKUP_LIST).toBe('backup:list');
    expect(IPC_CHANNELS.BACKUP_RESTORE).toBe('backup:restore');
    expect(IPC_CHANNELS.BACKUP_SET_POLICY).toBe('backup:set-policy');
    expect(IPC_CHANNELS.SECURITY_LOG_EVENT).toBe('security:log-event');
    expect(IPC_CHANNELS.SECURITY_LIST_EVENTS).toBe('security:list-events');
    expect(IPC_CHANNELS.OPS_RECORD_SHIFT_HANDOVER).toBe('ops:record-shift-handover');
    expect(IPC_CHANNELS.OPS_LIST_SHIFT_HANDOVERS).toBe('ops:list-shift-handovers');
    expect(IPC_CHANNELS.OPS_RECORD_CASH_MOVEMENT).toBe('ops:record-cash-movement');
    expect(IPC_CHANNELS.OPS_LIST_CASH_MOVEMENTS).toBe('ops:list-cash-movements');
    expect(IPC_CHANNELS.REPORTS_GET_LOCAL_DAILY).toBe('reports:get-local-daily');
    expect(IPC_CHANNELS.BACKOFFICE_GET_SETTINGS).toBe('backoffice:get-settings');
    expect(IPC_CHANNELS.BACKOFFICE_SET_SETTINGS).toBe('backoffice:set-settings');
    expect(IPC_CHANNELS.DB_QUEUE_PRODUCT_OP).toBe('db:queue-product-op');
    expect(IPC_CHANNELS.DB_QUEUE_STOCK_OP).toBe('db:queue-stock-op');
    expect(IPC_CHANNELS.DB_LIST_PENDING_CUSTOMER_OPS).toBe('db:list-pending-customer-ops');
    expect(IPC_CHANNELS.DB_LIST_PENDING_PRODUCT_OPS).toBe('db:list-pending-product-ops');
    expect(IPC_CHANNELS.DB_LIST_PENDING_SUPPLIER_OPS).toBe('db:list-pending-supplier-ops');
    expect(IPC_CHANNELS.DB_LIST_PENDING_PURCHASE_OPS).toBe('db:list-pending-purchase-ops');
    expect(IPC_CHANNELS.DB_LIST_PENDING_STOCK_OPS).toBe('db:list-pending-stock-ops');
  });

  it('has no duplicate channel values', () => {
    const values = Object.values(IPC_CHANNELS);
    expect(new Set(values).size).toBe(values.length);
  });
});
