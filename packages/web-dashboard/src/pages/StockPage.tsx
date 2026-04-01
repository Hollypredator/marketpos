import React from 'react';

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
}

interface StockMovementRow {
  id: string;
  createdAt: string;
  product: { name: string };
  quantity: number;
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
  onMovementFormChange: (updater: (current: MovementForm) => MovementForm) => void;
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

export function StockPage({
  branchId,
  movementForm,
  onMovementFormChange,
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
  const movementsPagination = useClientPagination(stockMovements, { pageSize: 20 });
  const levelsPagination = useClientPagination(stockLevels, { pageSize: 20 });

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

        <h3>Son Hareketler ({movementsPagination.total})</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Urun</th>
                <th>Tip</th>
                <th>Miktar</th>
                <th>Kullanici</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={5}
                emptyText="Stok hareketi bulunmadi."
                errorText={stockMovementsErrorText}
                loading={stockMovementsLoading}
                rowCount={movementsPagination.total}
              />
              {movementsPagination.visibleRows.map((movement) => (
                <tr key={movement.id}>
                  <td>{toDateTime(movement.createdAt)}</td>
                  <td>{movement.product.name}</td>
                  <td>{movement.type}</td>
                  <td>{movement.quantity}</td>
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
        <h2>Stok Seviyeleri ({levelsPagination.total})</h2>
        <div className="table-wrap tall">
          <table>
            <thead>
              <tr>
                <th>Urun</th>
                <th>Barkod</th>
                <th>Miktar</th>
                <th>Min</th>
                <th>Guncelleme</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={5}
                emptyText="Stok seviyesi kaydi bulunmadi."
                errorText={stockLevelsErrorText}
                loading={stockLevelsLoading}
                rowCount={levelsPagination.total}
              />
              {levelsPagination.visibleRows.map((stockLevel) => (
                <tr key={stockLevel.id}>
                  <td>{stockLevel.product.name}</td>
                  <td>{stockLevel.product.barcode}</td>
                  <td>{stockLevel.quantity}</td>
                  <td>{stockLevel.product.minStock}</td>
                  <td>{toDateTime(stockLevel.updatedAt)}</td>
                </tr>
              ))}
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
