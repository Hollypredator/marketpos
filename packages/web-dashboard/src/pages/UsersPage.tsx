import React from 'react';

import { PaginationControls } from '../components/PaginationControls';
import { useClientPagination } from '../hooks/use-client-pagination';

type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'CASHIER' | 'ACCOUNTANT';

interface BranchRow {
  id: string;
  name: string;
}

interface UserRow {
  id: string;
  createdAt: string;
  fullName: string;
  isActive: boolean;
  role: UserRole;
  username: string;
}

interface UserCreateForm {
  branchId: string;
  fullName: string;
  password: string;
  pin: string;
  role: UserRole;
  username: string;
}

interface UserEditForm {
  branchId: string;
  fullName: string;
  isActive: boolean;
  password: string;
  pin: string;
  role: UserRole;
  username: string;
}

interface UsersPageProps {
  branches: BranchRow[];
  canCreateUser: boolean;
  canEditSelectedUser: boolean;
  companyId: string;
  isSelfUserSelected: boolean;
  onCreateUser: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onDeleteUser: () => Promise<void>;
  onSelectUser: (userId: string) => void;
  onUserCreateFormChange: (updater: (current: UserCreateForm) => UserCreateForm) => void;
  onUserEditFormChange: (updater: (current: UserEditForm) => UserEditForm) => void;
  onUpdateUser: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  createRoleOptions: readonly UserRole[];
  editRoleOptions: readonly UserRole[];
  saving: boolean;
  selectedUser: UserRow | null;
  selectedUserRestrictionMessage: string | null;
  selectedUserId: string;
  toDateTime: (value?: string | null) => string;
  usersErrorText: string | null;
  usersLoading: boolean;
  userCreateForm: UserCreateForm;
  userEditForm: UserEditForm;
  users: UserRow[];
}

export function UsersPage({
  branches,
  canCreateUser,
  canEditSelectedUser,
  companyId,
  isSelfUserSelected,
  onCreateUser,
  onDeleteUser,
  onSelectUser,
  onUserCreateFormChange,
  onUserEditFormChange,
  onUpdateUser,
  createRoleOptions,
  editRoleOptions,
  saving,
  selectedUser,
  selectedUserRestrictionMessage,
  selectedUserId,
  toDateTime,
  usersErrorText,
  usersLoading,
  userCreateForm,
  userEditForm,
  users,
}: UsersPageProps): React.ReactElement {
  const usersPagination = useClientPagination(users, { pageSize: 20 });

  return (
    <section className="panel-grid two-col">
      <article className="card">
        <h2>Kullanicilar ({usersPagination.total})</h2>
        <ul className="list">
          {usersPagination.visibleRows.map((user) => (
            <li key={user.id} className={user.id === selectedUserId ? 'active' : ''}>
              <button className="list-button" type="button" onClick={() => onSelectUser(user.id)}>
                <span>{user.fullName}</span>
                <small>
                  {user.username} | {user.role}
                </small>
              </button>
              <span className={`state-pill ${user.isActive ? 'ok' : 'off'}`}>
                {user.isActive ? 'Aktif' : 'Pasif'}
              </span>
            </li>
          ))}
        </ul>
        {usersLoading && <p className="muted">Kullanicilar yukleniyor...</p>}
        {!usersLoading && usersErrorText && <p className="muted">{usersErrorText}</p>}
        {!usersLoading && !usersErrorText && usersPagination.total === 0 && (
          <p className="muted">Kullanici kaydi bulunmadi.</p>
        )}
        <PaginationControls
          onPageChange={usersPagination.setPage}
          page={usersPagination.page}
          pageSize={usersPagination.pageSize}
          total={usersPagination.total}
        />

        <form className="form-grid compact" onSubmit={onCreateUser}>
          <h3>Yeni Kullanici</h3>
          <div className="inline-row two">
            <input
              placeholder="Ad soyad"
              value={userCreateForm.fullName}
              onChange={(event) =>
                onUserCreateFormChange((current) => ({ ...current, fullName: event.target.value }))
              }
              required
              disabled={!canCreateUser || saving}
            />
            <input
              placeholder="Kullanici adi"
              value={userCreateForm.username}
              onChange={(event) =>
                onUserCreateFormChange((current) => ({ ...current, username: event.target.value }))
              }
              required
              disabled={!canCreateUser || saving}
            />
          </div>
          <div className="inline-row three">
            <input
              type="password"
              placeholder="Sifre"
              value={userCreateForm.password}
              onChange={(event) =>
                onUserCreateFormChange((current) => ({ ...current, password: event.target.value }))
              }
              required
              disabled={!canCreateUser || saving}
            />
            <select
              value={userCreateForm.role}
              onChange={(event) =>
                onUserCreateFormChange((current) => ({
                  ...current,
                  role: event.target.value as UserRole,
                }))
              }
              disabled={!canCreateUser || saving || createRoleOptions.length === 0}
            >
              {createRoleOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <input
              placeholder="PIN (opsiyonel)"
              value={userCreateForm.pin}
              onChange={(event) =>
                onUserCreateFormChange((current) => ({ ...current, pin: event.target.value }))
              }
              disabled={!canCreateUser || saving}
            />
          </div>
          <select
            value={userCreateForm.branchId}
            onChange={(event) =>
              onUserCreateFormChange((current) => ({ ...current, branchId: event.target.value }))
            }
            disabled={!canCreateUser || saving}
          >
            <option value="">Sube atama yok</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <button
            className="btn primary"
            type="submit"
            disabled={saving || companyId.length === 0 || !canCreateUser || createRoleOptions.length === 0}
          >
            Kullanici Ekle
          </button>
          {!canCreateUser && (
            <p className="muted">Firma ici rol hiyerarsisi nedeniyle bu seviyede kullanici olusturamazsiniz.</p>
          )}
        </form>
      </article>

      <article className="card">
        <h2>Secili Kullaniciyi Guncelle</h2>
        {selectedUser ? (
          <form className="form-grid compact" onSubmit={onUpdateUser}>
            <div className="inline-row two">
              <input
                placeholder="Ad soyad"
                value={userEditForm.fullName}
                onChange={(event) =>
                  onUserEditFormChange((current) => ({ ...current, fullName: event.target.value }))
                }
                required
                disabled={!canEditSelectedUser || saving}
              />
              <input
                placeholder="Kullanici adi"
                value={userEditForm.username}
                onChange={(event) =>
                  onUserEditFormChange((current) => ({ ...current, username: event.target.value }))
                }
                required
                disabled={!canEditSelectedUser || saving}
              />
            </div>
            <div className="inline-row three">
              <input
                type="password"
                placeholder="Yeni sifre (opsiyonel)"
                value={userEditForm.password}
                onChange={(event) =>
                  onUserEditFormChange((current) => ({ ...current, password: event.target.value }))
                }
                disabled={!canEditSelectedUser || saving}
              />
              <select
                value={userEditForm.role}
                onChange={(event) =>
                  onUserEditFormChange((current) => ({
                    ...current,
                    role: event.target.value as UserRole,
                  }))
                }
                disabled={
                  !canEditSelectedUser || saving || editRoleOptions.length === 0 || isSelfUserSelected
                }
              >
                {editRoleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <input
                placeholder="PIN (bos birakirsan temizlenir)"
                value={userEditForm.pin}
                onChange={(event) =>
                  onUserEditFormChange((current) => ({ ...current, pin: event.target.value }))
                }
                disabled={!canEditSelectedUser || saving}
              />
            </div>
            <select
              value={userEditForm.branchId}
              onChange={(event) =>
                onUserEditFormChange((current) => ({ ...current, branchId: event.target.value }))
              }
              disabled={!canEditSelectedUser || saving || isSelfUserSelected}
            >
              <option value="">Sube atama yok</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={userEditForm.isActive}
                onChange={(event) =>
                  onUserEditFormChange((current) => ({ ...current, isActive: event.target.checked }))
                }
                disabled={!canEditSelectedUser || saving}
              />
              Aktif kullanici
            </label>
            <div className="action-row">
              <button className="btn primary" type="submit" disabled={saving || !canEditSelectedUser}>
                Guncelle
              </button>
              <button
                className="btn danger"
                type="button"
                disabled={saving || !canEditSelectedUser || isSelfUserSelected}
                onClick={() => void onDeleteUser()}
              >
                Sil
              </button>
            </div>
            {selectedUserRestrictionMessage && <p className="muted">{selectedUserRestrictionMessage}</p>}
            <p className="muted">Olusturma tarihi: {toDateTime(selectedUser.createdAt)}</p>
          </form>
        ) : (
          <p className="muted">Duzenlemek icin soldan bir kullanici secin.</p>
        )}
      </article>
    </section>
  );
}
