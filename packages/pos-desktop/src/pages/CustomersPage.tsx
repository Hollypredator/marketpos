import React, { useEffect, useState } from 'react';
import { formatCurrency } from '@marketpos/shared';
import { fetchCustomers, createCustomer, updateCustomer, explainRuntimeError } from '../services/pos-runtime';
import type { CustomerRecord } from '../services/types';
import { selectAuthSession, useApp, useToast } from '../store';
import CustomerModal from '../components/CustomerModal';

export default function CustomersPage() {
  const toast = useToast();
  const { state } = useApp();
  const activeSession = selectAuthSession(state);

  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null | undefined>(undefined);

  const loadCustomers = async () => {
    if (!activeSession) return;
    setIsLoading(true);
    try {
      const data = await fetchCustomers(activeSession, { search });
      setCustomers(data);
    } catch (err) {
      toast.error(explainRuntimeError(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadCustomers();
  }, [search, activeSession?.sessionId]);

  const handleSaveCustomer = async (data: Partial<CustomerRecord>) => {
    if (!activeSession) return;
    try {
      if (editingCustomer) {
        await updateCustomer(activeSession, editingCustomer.id, data);
        toast.success('Müşteri başarıyla güncellendi.');
      } else {
        await createCustomer(activeSession, data);
        toast.success('Yeni müşteri başarıyla oluşturuldu.');
      }
      void loadCustomers();
    } catch (err) {
      throw err; // Modal handles error display
    }
  };

  return (
    <div className="page-shell">
      <div className="header" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>
        <h2 className="header-title" style={{ color: 'var(--text-primary)' }}>Müşteri & Cari Yönetimi</h2>
        <div className="header-info" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input 
            type="text" 
            className="input" 
            placeholder="Müşteri ara..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '250px' }}
          />
          <button 
            className="btn btn-primary btn-lg"
            onClick={() => setEditingCustomer(null)}
            style={{ 
              padding: '0.75rem 2rem', 
              fontSize: '1rem', 
              fontWeight: '700',
              boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.5)'
            }}
          >
            + Yeni Müşteri Ekle
          </button>
        </div>
      </div>

      <div className="stock-page stock-page-neo">
        <div className="stock-main-grid">
          <div className="card stock-section" style={{ border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <h3 className="card-title stock-section-title" style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Müşteri & Cari Listesi</h3>
            <div className="table-wrapper stock-table-wrapper">
              <table className="table stock-table">
                <thead>
                  <tr>
                    <th style={{ padding: '1rem' }}>Müşteri Bilgisi</th>
                    <th>İletişim</th>
                    <th style={{ textAlign: 'right' }}>Güncel Bakiye</th>
                    <th style={{ textAlign: 'right' }}>Vergi/TC No</th>
                    <th style={{ textAlign: 'right', padding: '1rem' }}>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id}>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontWeight: '700', fontSize: '1.05rem', color: 'var(--text-primary)' }}>{customer.fullName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {customer.id.slice(0,8)}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.9rem' }}>{customer.phone || '-'}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{customer.email || 'E-posta yok'}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '800', fontSize: '1.1rem', color: (customer.balance || 0) > 0 ? '#ef4444' : '#10b981' }}>
                        {formatCurrency(customer.balance || 0)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{customer.taxNumber || '-'}</td>
                      <td style={{ textAlign: 'right', padding: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button 
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditingCustomer(customer)}
                            style={{ background: 'var(--bg-app)', border: '1px solid var(--border)' }}
                          >
                            Düzenle
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ background: 'var(--bg-app)', border: '1px solid var(--border)' }}>Ekstre</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {customers.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={5} className="stock-empty-cell">Müşteri bulunamadı.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {editingCustomer !== undefined && (
        <CustomerModal 
          customer={editingCustomer}
          onClose={() => setEditingCustomer(undefined)}
          onSave={handleSaveCustomer}
        />
      )}
    </div>
  );
}
