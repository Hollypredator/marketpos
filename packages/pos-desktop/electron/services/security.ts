import { LocalDatabaseService } from './database';

export class SecurityService {
  private pendingCodes = new Map<string, { code: string; expiresAt: number }>();
  private readonly CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly db: LocalDatabaseService) {}

  public async requestManagerSmsCode(username: string): Promise<{ success: boolean; message: string }> {
    // 1. Find user and their phone number
    const user = this.db.getManagerByUsername(username);
    if (!user) {
      throw new Error('Yonetici kullanici bulunamadi.');
    }

    // In a real scenario, we would pull the phone number from the user record.
    // For now, we'll assume the username is enough to identify the target.
    // Fake phone for demo: 5xx xxx xx xx
    const phoneNumber = '5XXXXXXXXX'; 

    // 2. Generate a 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // 3. Store the code
    this.pendingCodes.set(username, {
      code,
      expiresAt: Date.now() + this.CODE_TTL_MS,
    });

    // 4. Send SMS (Mocking Netgsm/Mutlucell call)
    console.log(`[SMS GATEWAY] Sending code ${code} to ${username} (${phoneNumber})`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    return {
      success: true,
      message: `${phoneNumber.slice(-4)} ile biten numaraniza onay kodu gonderildi.`,
    };
  }

  public verifyManagerSmsCode(username: string, code: string) {
    const record = this.pendingCodes.get(username);
    
    if (!record) {
      throw new Error('Aktif bir onay kodu bulunamadi. Tekrar kod isteyin.');
    }

    if (Date.now() > record.expiresAt) {
      this.pendingCodes.delete(username);
      throw new Error('Onay kodunun suresi dolmus.');
    }

    if (record.code !== code) {
      throw new Error('Gecersiz onay kodu.');
    }

    // Success - clean up
    this.pendingCodes.delete(username);

    // Return the manager user info
    const user = this.db.getManagerByUsername(username);
    if (!user) throw new Error('Kullanici artik mevcut degil.');

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        role: user.role,
        companyId: user.companyId,
        branchId: user.branchId,
        isActive: user.isActive,
      },
      method: 'SMS' as const,
      requiresPinSetup: false,
    };
  }
}
