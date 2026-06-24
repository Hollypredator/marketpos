import React, { useMemo, useState } from 'react';

import { PaginationControls } from '../components/PaginationControls';
import { TableState } from '../components/TableState';
import { useClientPagination } from '../hooks/use-client-pagination';

interface ProductRow {
  id: string;
  barcode: string;
  name: string;
}

interface MovementForm {
  note: string;
  productId: string;
  quantity: string;
  reference: string;
  type: string;
}

interface MovementFilters {
  dateFrom: string;
  dateTo: string;
  maxQuantity: string;
  minQuantity: string;
  search: string;
  type: string;
  userSearch: string;
}

interface StockMovementRow {
  id: string;
  createdAt: string;
  note?: string | null;
  product: { barcode: string; name: string };
  quantity: number;
  reference?: string | null;
  type: string;
  user: { fullName: string };
}

interface StockLevelRow {
  id: string;
  product: { barcode: string; minStock: number; name: string };
  quantity: number;
  updatedAt: string;
}

interface StockPageProps {
  branchId: string;
  movementForm: MovementForm;
  movementFilters: MovementFilters;
  onMovementFormChange: (updater: (current: MovementForm) => MovementForm) => void;
  onMovementFiltersChange: (updater: (current: MovementFilters) => MovementFilters) => void;
  onSubmitMovement: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  products: ProductRow[];
  saving: boolean;
  selectedBranchName: string;
  stockLevelsErrorText: string | null;
  stockLevelsLoading: boolean;
  stockLevels: StockLevelRow[];
  stockMovementsErrorText: string | null;
  stockMovementsLoading: boolean;
  stockMovements: StockMovementRow[];
  toDateTime: (value?: string | null) => string;
}

function normalizeTr(value: string): string {
  return value.trim().toLocaleLowerCase('tr-TR');
}

function parseDateBoundary(value: string, asEndOfDay: boolean): number | null {
  if (value.trim().length === 0) {
    return null;
  }
  const suffix = asEndOfDay ? 'T23:59:59.999' : 'T00:00:00.000';
  const parsed = new Date(`${value}${suffix}`).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function StockPage({
  branchId,
  movementForm,
  movementFilters,
  onMovementFormChange,
  onMovementFiltersChange,
  onSubmitMovement,
  products,
  saving,
  selectedBranchName,
  stockLevelsErrorText,
  stockLevelsLoading,
  stockLevels,
  stockMovementsErrorText,
  stockMovementsLoading,
  stockMovements,
  toDateTime,
}: StockPageProps): React.ReactElement {
  const [movementSearch, setMovementSearch] = useState(movementFilters.search);
  const [movementTypeFilter, setMovementTypeFilter] = useState(movementFilters.type);
  const [movementDirectionFilter, setMovementDirectionFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [movementUserFilter, setMovementUserFilter] = useState(movementFilters.userSearch);
  const [movementDateFrom, setMovementDateFrom] = useState(movementFilters.dateFrom);
  const [movementDateTo, setMovementDateTo] = useState(movementFilters.dateTo);
  const [movementMinQuantity, setMovementMinQuantity] = useState(movementFilters.minQuantity);
  const [movementMaxQuantity, setMovementMaxQuantity] = useState(movementFilters.maxQuantity);
  const [movementPageSize, setMovementPageSize] = useState(50);

  const [levelSearch, setLevelSearch] = useState('');
  const [levelStockStatus, setLevelStockStatus] = useState<'ALL' | 'LOW' | 'OK'>('ALL');
  const [levelQtyMin, setLevelQtyMin] = useState('');
  const [levelQtyMax, setLevelQtyMax] = useState('');
  const [levelPageSize, setLevelPageSize] = useState(50);

  const normalizedMovementSearch = normalizeTr(movementSearch);
  const movementFromTs = parseDateBoundary(movementDateFrom, false);
  const movementToTs = parseDateBoundary(movementDateTo, true);

  const movementTypes = useMemo(
    () => [...new Set(stockMovements.map((movement) => movement.type))].sort((a, b) => a.localeCompare(b, 'tr')),
    [stockMovements],
  );
  const movementUsers = useMemo(
    () =>
      [...new Set(stockMovements.map((movement) => movement.user.fullName))]
        .filter((name) => name.trim().length > 0)
        .sort((a, b) => a.localeCompare(b, 'tr')),
    [stockMovements],
  );

  const filteredMovements = useMemo(
    () =>
      stockMovements.filter((movement) => {
        if (movementTypeFilter.length > 0 && movement.type !== movementTypeFilter) {
          return false;
        }
        if (movementUserFilter.length > 0 && movement.user.fullName !== movementUserFilter) {
          return false;
        }
        if (movementDirectionFilter === 'IN' && movement.quantity <= 0) {
          return false;
        }
        if (movementDirectionFilter === 'OUT' && movement.quantity >= 0) {
          return false;
        }

        const movementTs = new Date(movement.createdAt).getTime();
        if (typeof movementFromTs === 'number' && Number.isFinite(movementTs) && movementTs < movementFromTs) {
          return false;
        }
        if (typeof movementToTs === 'number' && Number.isFinite(movementTs) && movementTs > movementToTs) {
          return false;
        }

        if (normalizedMovementSearch.length === 0) {
          return true;
        }

        const haystack = normalizeTr(
          `${movement.product.name} ${movement.product.barcode} ${movement.reference ?? ''} ${movement.note ?? ''} ${movement.user.fullName} ${movement.type}`,
        );
        return haystack.includes(normalizedMovementSearch);
      }),
    [
      movementDirectionFilter,
      movementFromTs,
      movementToTs,
      movementTypeFilter,
      movementUserFilter,
      normalizedMovementSearch,
      stockMovements,
    ],
  );

  const normalizedLevelSearch = normalizeTr(levelSearch);
  const minQty = Number(levelQtyMin);
  const maxQty = Number(levelQtyMax);

  const filteredLevels = useMemo(
    () =>
      stockLevels.filter((stockLevel) => {
        if (levelStockStatus === 'LOW' && stockLevel.quantity > stockLevel.product.minStock) {
          return false;
        }
        if (levelStockStatus === 'OK' && stockLevel.quantity <= stockLevel.product.minStock) {
          return false;
        }
        if (Number.isFinite(minQty) && levelQtyMin.trim().length > 0 && stockLevel.quantity < minQty) {
          return false;
        }
        if (Number.isFinite(maxQty) && levelQtyMax.trim().length > 0 && stockLevel.quantity > maxQty) {
          return false;
        }
        if (normalizedLevelSearch.length === 0) {
          return true;
        }
        const haystack = normalizeTr(`${stockLevel.product.name} ${stockLevel.product.barcode}`);
        return haystack.includes(normalizedLevelSearch);
      }),
    [levelQtyMax, levelQtyMin, levelStockStatus, maxQty, minQty, normalizedLevelSearch, stockLevels],
  );

  const movementPageSizeValue = movementPageSize === 0 ? Math.max(1, filteredMovements.length) : movementPageSize;
  const levelPageSizeValue = levelPageSize === 0 ? Math.max(1, filteredLevels.length) : levelPageSize;

  const movementsPagination = useClientPagination(filteredMovements, { pageSize: movementPageSizeValue });
  const levelsPagination = useClientPagination(filteredLevels, { pageSize: levelPageSizeValue });

  return (
    <section className="panel-grid two-col">
      <article className="card">
        <h2>Stok Hareketi</h2>
        <p className="muted">Aktif sube: {selectedBranchName}</p>
        <form className="form-grid compact" onSubmit={onSubmitMovement}>
          <select
            value={movementForm.productId}
            onChange={(event) =>
              onMovementFormChange((current) => ({ ...current, productId: event.target.value }))
            }
            required
          >
            <option value="">Urun secin</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.barcode})
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            value={movementForm.quantity}
            onChange={(event) =>
              onMovementFormChange((current) => ({ ...current, quantity: event.target.value }))
            }
            placeholder="Miktar"
            required
          />
          <select
            value={movementForm.type}
            onChange={(event) =>
              onMovementFormChange((current) => ({ ...current, type: event.target.value }))
            }
          >
            <option value="">Otomatik tip</option>
            <option value="PURCHASE">PURCHASE</option>
            <option value="ADJUSTMENT">ADJUSTMENT</option>
            <option value="WASTE">WASTE</option>
            <option value="REFUND">REFUND</option>
            <option value="SALE">SALE</option>
          </select>
          <input
            value={movementForm.reference}
            onChange={(event) =>
              onMovementFormChange((current) => ({ ...current, reference: event.target.value }))
            }
            placeholder="Referans"
          />
          <input
            value={movementForm.note}
            onChange={(event) =>
              onMovementFormChange((current) => ({ ...current, note: event.target.value }))
            }
            placeholder="Not"
          />
          <button className="btn primary" disabled={saving || branchId.length === 0} type="submit">
            Hareket Kaydet
          </button>
        </form>

        <h3>Hareket Listesi ({movementsPagination.total}/{stockMovements.length})</h3>
        <div className="legacy-filter-box">
          <div className="inline-row three">
            <input
              value={movementSearch}
              onChange={(event) => setMovementSearch(event.target.value)}
              placeholder="Urun, barkod, referans, not"
            />
            <select value={movementTypeFilter} onChange={(event) => setMovementTypeFilter(event.target.value)}>
              <option value="">Tum tipler</option>
              {movementTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <select
              value={movementDirectionFilter}
              onChange={(event) => setMovementDirectionFilter(event.target.value as 'ALL' | 'IN' | 'OUT')}
            >
              <option value="ALL">Tum yonler</option>
              <option value="IN">Yalniz giris (+)</option>
              <option value="OUT">Yalniz cikis (-)</option>
            </select>
          </div>
          <div className="inline-row three">
            <select value={movementUserFilter} onChange={(event) => setMovementUserFilter(event.target.value)}>
              <option value="">Tum kullanicilar</option>
              {movementUsers.map((userName) => (
                <option key={userName} value={userName}>
                  {userName}
                </option>
              ))}
            </select>
            <input type="date" value={movementDateFrom} onChange={(event) => setMovementDateFrom(event.target.value)} />
            <input type="date" value={movementDateTo} onChange={(event) => setMovementDateTo(event.target.value)} />
          </div>
          <div className="inline-row three">
            <input
              type="number"
              step="0.01"
              placeholder="Miktar min (sunucu)"
              value={movementMinQuantity}
              onChange={(event) => setMovementMinQuantity(event.target.value)}
            />
            <input
              type="number"
              step="0.01"
              placeholder="Miktar max (sunucu)"
              value={movementMaxQuantity}
              onChange={(event) => setMovementMaxQuantity(event.target.value)}
            />
            <button
              className="btn ghost"
              type="button"
              onClick={() =>
                onMovementFiltersChange(() => ({
                  dateFrom: movementDateFrom,
                  dateTo: movementDateTo,
                  maxQuantity: movementMaxQuantity,
                  minQuantity: movementMinQuantity,
                  search: movementSearch,
                  type: movementTypeFilter,
                  userSearch: movementUserFilter,
                }))
              }
            >
              Sunucu Filtresini Uygula
            </button>
          </div>
          <div className="inline-row three">
            <select
              value={String(movementPageSize)}
              onChange={(event) => setMovementPageSize(Number(event.target.value))}
            >
              <option value="20">20 kayit</option>
              <option value="50">50 kayit</option>
              <option value="100">100 kayit</option>
              <option value="0">Tum kayitlar</option>
            </select>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setMovementSearch('');
                setMovementTypeFilter('');
                setMovementDirectionFilter('ALL');
                setMovementUserFilter('');
                setMovementDateFrom('');
                setMovementDateTo('');
                setMovementMinQuantity('');
                setMovementMaxQuantity('');
                onMovementFiltersChange(() => ({
                  dateFrom: '',
                  dateTo: '',
                  maxQuantity: '',
                  minQuantity: '',
                  search: '',
                  type: '',
                  userSearch: '',
                }));
              }}
              disabled={
                movementSearch.trim().length === 0 &&
                movementTypeFilter.length === 0 &&
                movementDirectionFilter === 'ALL' &&
                movementUserFilter.length === 0 &&
                movementDateFrom.length === 0 &&
                movementDateTo.length === 0 &&
                movementMinQuantity.length === 0 &&
                movementMaxQuantity.length === 0
              }
            >
              Filtreyi Temizle
            </button>
            <div className="legacy-filter-summary">
              Gorunen kayit: {movementsPagination.total} / {stockMovements.length}
            </div>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Urun</th>
                <th>Barkod</th>
                <th>Tip</th>
                <th>Miktar</th>
                <th>Referans</th>
                <th>Kullanici</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={7}
                emptyText="Stok hareketi bulunmadi."
                errorText={stockMovementsErrorText}
                loading={stockMovementsLoading}
                rowCount={movementsPagination.total}
              />
              {movementsPagination.visibleRows.map((movement) => (
                <tr key={movement.id}>
                  <td>{toDateTime(movement.createdAt)}</td>
                  <td>{movement.product.name}</td>
                  <td>{movement.product.barcode}</td>
                  <td>{movement.type}</td>
                  <td>{movement.quantity}</td>
                  <td>{movement.reference?.trim().length ? movement.reference : '-'}</td>
                  <td>{movement.user.fullName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationControls
          onPageChange={movementsPagination.setPage}
          page={movementsPagination.page}
          pageSize={movementsPagination.pageSize}
          total={movementsPagination.total}
        />
      </article>

      <article className="card">
        <h2>Stok Seviyeleri ({levelsPagination.total}/{stockLevels.length})</h2>
        <div className="legacy-filter-box">
          <div className="inline-row three">
            <input
              placeholder="Urun veya barkod ara"
              value={levelSearch}
              onChange={(event) => setLevelSearch(event.target.value)}
            />
            <select
              value={levelStockStatus}
              onChange={(event) => setLevelStockStatus(event.target.value as 'ALL' | 'LOW' | 'OK')}
            >
              <option value="ALL">Tum durumlar</option>
              <option value="LOW">Kritik stokta</option>
              <option value="OK">Normal stokta</option>
            </select>
            <select value={String(levelPageSize)} onChange={(event) => setLevelPageSize(Number(event.target.value))}>
              <option value="20">20 kayit</option>
              <option value="50">50 kayit</option>
              <option value="100">100 kayit</option>
              <option value="0">Tum kayitlar</option>
            </select>
          </div>
          <div className="inline-row three">
            <input
              type="number"
              step="0.01"
              placeholder="Min miktar"
              value={levelQtyMin}
              onChange={(event) => setLevelQtyMin(event.target.value)}
            />
            <input
              type="number"
              step="0.01"
              placeholder="Maks miktar"
              value={levelQtyMax}
              onChange={(event) => setLevelQtyMax(event.target.value)}
            />
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setLevelSearch('');
                setLevelStockStatus('ALL');
                setLevelQtyMin('');
                setLevelQtyMax('');
              }}
              disabled={
                levelSearch.trim().length === 0 &&
                levelStockStatus === 'ALL' &&
                levelQtyMin.trim().length === 0 &&
                levelQtyMax.trim().length === 0
              }
            >
              Filtreyi Temizle
            </button>
          </div>
        </div>

        <div className="table-wrap tall">
          <table>
            <thead>
              <tr>
                <th>Urun</th>
                <th>Barkod</th>
                <th>Miktar</th>
                <th>Min</th>
                <th>Durum</th>
                <th>Guncelleme</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={6}
                emptyText="Stok seviyesi kaydi bulunmadi."
                errorText={stockLevelsErrorText}
                loading={stockLevelsLoading}
                rowCount={levelsPagination.total}
              />
              {levelsPagination.visibleRows.map((stockLevel) => {
                const isLow = stockLevel.quantity <= stockLevel.product.minStock;
                return (
                  <tr key={stockLevel.id}>
                    <td>{stockLevel.product.name}</td>
                    <td>{stockLevel.product.barcode}</td>
                    <td>{stockLevel.quantity}</td>
                    <td>{stockLevel.product.minStock}</td>
                    <td>{isLow ? 'Kritik' : 'Normal'}</td>
                    <td>{toDateTime(stockLevel.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationControls
          onPageChange={levelsPagination.setPage}
          page={levelsPagination.page}
          pageSize={levelsPagination.pageSize}
          total={levelsPagination.total}
        />
      </article>
    </section>
  );
}
