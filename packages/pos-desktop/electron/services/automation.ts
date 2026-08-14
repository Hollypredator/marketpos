import { getDatabaseService } from './database';

export class AutomationService {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  public start(): void {
    if (this.timer) return;
    // Check every minute
    this.timer = setInterval(() => void this.checkAutomation(), 60000);
    console.log('[AutomationService] Started background checks');
    // Initial check
    void this.checkAutomation();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async checkAutomation(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      let db;
      try {
        db = getDatabaseService();
      } catch {
        // Database not initialized yet (e.g. initial setup gate)
        return;
      }
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"

      // 1. Auto Close
      const autoCloseEnabled = db.getLocalSetting('marketpos_auto_close_enabled') === 'true';
      const autoCloseTime = db.getLocalSetting('marketpos_auto_close_time') || '02:00';
      const shiftStart = db.getLocalSetting('marketpos_shift_start_time');

      if (autoCloseEnabled && currentTime === autoCloseTime && shiftStart) {
         console.log(`[AutomationService] Auto-closing shift at ${currentTime}`);
         // We'll perform a blind close logic here
         // For a real app, this would involve calling recordShiftHandover and closeSession logically.
         // Since we don't have the session object here (it's in the renderer usually), 
         // we might need to expose a dedicated 'performAutoClose' method in DatabaseService 
         // that doesn't rely on frontend session if possible, OR just clear the local flags.
         
         // For now, let's at least clear the local flags so the next day starts fresh.
         // In a robust implementation, we would also create a ShiftHandover record with 'blind_close = true'.
         db.setLocalSetting('marketpos_shift_start_time', '');
         db.setLocalSetting('marketpos_shift_opening_cash', '');
         
         // Log the event
         db.logSecurityEvent({
           eventType: 'SYSTEM_ERROR', // Using existing categories or adding one
           message: `Otomatik gün sonu işlemi gerçekleştirildi (${currentTime})`,
           severity: 'INFO',
           operatorUserId: 'SYSTEM'
         });
      }

      // 2. Auto Open
      const autoOpenEnabled = db.getLocalSetting('marketpos_auto_open_enabled') === 'true';
      const autoOpenTime = db.getLocalSetting('marketpos_auto_open_time') || '08:00';
      const autoOpenCash = db.getLocalSetting('marketpos_auto_open_cash') || '0';

      if (autoOpenEnabled && currentTime === autoOpenTime && !shiftStart) {
         console.log(`[AutomationService] Auto-opening shift at ${currentTime} with ${autoOpenCash} TL`);
         db.setLocalSetting('marketpos_shift_start_time', now.toISOString());
         db.setLocalSetting('marketpos_shift_opening_cash', autoOpenCash);
         
         db.logSecurityEvent({
           eventType: 'SYSTEM_ERROR',
           message: `Otomatik gün başı işlemi gerçekleştirildi (${currentTime})`,
           severity: 'INFO',
           operatorUserId: 'SYSTEM'
         });
      }

    } catch (err) {
      console.error('[AutomationService] Error:', err);
    } finally {
      this.isProcessing = false;
    }
  }
}

let instance: AutomationService | null = null;

export function getAutomationService(): AutomationService {
  if (!instance) {
    instance = new AutomationService();
  }
  return instance;
}
