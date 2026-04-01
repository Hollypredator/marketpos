import React from 'react';

import { PaginationControls } from '../components/PaginationControls';
import { TableState } from '../components/TableState';
import { useClientPagination } from '../hooks/use-client-pagination';

interface CategoryRow {
  id: string;
  name: string;
  sortOrder: number;
  color?: string | null;
}

interface ProductRow {
  id: string;
  barcode: string;
  minStock: number;
  name: string;
  salePrice: number;
  vatRate: number;
}

interface CategoryForm {
  color: string;
  name: string;
  sortOrder: string;
}

interface ProductForm {
  barcode: string;
  categoryId: string;
  minStock: string;
  name: string;
  purchasePrice: string;
  salePrice: string;
  vatRate: string;
}

interface CatalogPageProps {
  categories: CategoryRow[];
  categoriesErrorText: string | null;
  categoriesLoading: boolean;
  categoryForm: CategoryForm;
  companyId: string;
  onAddCategory: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onAddProduct: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onCategoryFormChange: (updater: (current: CategoryForm) => CategoryForm) => void;
  onProductFormChange: (updater: (current: ProductForm) => ProductForm) => void;
  productForm: ProductForm;
  products: ProductRow[];
  productsErrorText: string | null;
  productsLoading: boolean;
  saving: boolean;
  toMoney: (value: number) => string;
}

export function CatalogPage({
  categories,
  categoriesErrorText,
  categoriesLoading,
  categoryForm,
  companyId,
  onAddCategory,
  onAddProduct,
  onCategoryFormChange,
  onProductFormChange,
  productForm,
  products,
  productsErrorText,
  productsLoading,
  saving,
  toMoney,
}: CatalogPageProps): React.ReactElement {
  const categoriesPagination = useClientPagination(categories, { pageSize: 20 });
  const productsPagination = useClientPagination(products, { pageSize: 20 });

  return (
    <section className="panel-grid two-col">
      <article className="card">
        <h2>Kategoriler ({categoriesPagination.total})</h2>
        <ul className="list">
          {categoriesPagination.visibleRows.map((category) => (
            <li key={category.id}>
              <div className="stacked-row">
                <span>{category.name}</span>
                <small>Sira: {category.sortOrder}</small>
              </div>
              <span className="dot" style={{ backgroundColor: category.color ?? '#64748b' }} />
            </li>
          ))}
        </ul>
        {categoriesLoading && <p className="muted">Kategoriler yukleniyor...</p>}
        {!categoriesLoading && categoriesErrorText && <p className="muted">{categoriesErrorText}</p>}
        {!categoriesLoading && !categoriesErrorText && categoriesPagination.total === 0 && (
          <p className="muted">Kategori kaydi bulunmadi.</p>
        )}
        <PaginationControls
          onPageChange={categoriesPagination.setPage}
          page={categoriesPagination.page}
          pageSize={categoriesPagination.pageSize}
          total={categoriesPagination.total}
        />

        <form className="form-grid compact" onSubmit={onAddCategory}>
          <h3>Yeni Kategori</h3>
          <input
            placeholder="Kategori adi"
            value={categoryForm.name}
            onChange={(event) =>
              onCategoryFormChange((current) => ({ ...current, name: event.target.value }))
            }
            required
          />
          <div className="inline-row two">
            <input
              placeholder="#6366f1"
              value={categoryForm.color}
              onChange={(event) =>
                onCategoryFormChange((current) => ({ ...current, color: event.target.value }))
              }
            />
            <input
              type="number"
              value={categoryForm.sortOrder}
              onChange={(event) =>
                onCategoryFormChange((current) => ({ ...current, sortOrder: event.target.value }))
              }
            />
          </div>
          <button className="btn primary" disabled={saving || companyId.length === 0} type="submit">
            Kategori Ekle
          </button>
        </form>
      </article>

      <article className="card">
        <h2>Urunler ({productsPagination.total})</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Urun</th>
                <th>Barkod</th>
                <th>Satis</th>
                <th>KDV</th>
                <th>Min</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={5}
                emptyText="Urun kaydi bulunmadi."
                errorText={productsErrorText}
                loading={productsLoading}
                rowCount={productsPagination.total}
              />
              {productsPagination.visibleRows.map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{product.barcode}</td>
                  <td>{toMoney(product.salePrice)}</td>
                  <td>%{product.vatRate}</td>
                  <td>{product.minStock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationControls
          onPageChange={productsPagination.setPage}
          page={productsPagination.page}
          pageSize={productsPagination.pageSize}
          total={productsPagination.total}
        />

        <form className="form-grid compact" onSubmit={onAddProduct}>
          <h3>Yeni Urun</h3>
          <div className="inline-row two">
            <input
              placeholder="Urun adi"
              value={productForm.name}
              onChange={(event) =>
                onProductFormChange((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
            <input
              placeholder="Barkod"
              value={productForm.barcode}
              onChange={(event) =>
                onProductFormChange((current) => ({ ...current, barcode: event.target.value }))
              }
              required
            />
          </div>
          <div className="inline-row three">
            <select
              value={productForm.categoryId}
              onChange={(event) =>
                onProductFormChange((current) => ({ ...current, categoryId: event.target.value }))
              }
            >
              <option value="">Kategori yok</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              placeholder="Alis"
              value={productForm.purchasePrice}
              onChange={(event) =>
                onProductFormChange((current) => ({ ...current, purchasePrice: event.target.value }))
              }
            />
            <input
              type="number"
              step="0.01"
              placeholder="Satis"
              value={productForm.salePrice}
              onChange={(event) =>
                onProductFormChange((current) => ({ ...current, salePrice: event.target.value }))
              }
            />
          </div>
          <div className="inline-row three">
            <select
              value={productForm.vatRate}
              onChange={(event) =>
                onProductFormChange((current) => ({ ...current, vatRate: event.target.value }))
              }
            >
              <option value="1">%1</option>
              <option value="10">%10</option>
              <option value="20">%20</option>
            </select>
            <input
              type="number"
              placeholder="Min stok"
              value={productForm.minStock}
              onChange={(event) =>
                onProductFormChange((current) => ({ ...current, minStock: event.target.value }))
              }
            />
            <div />
          </div>
          <button className="btn primary" disabled={saving || companyId.length === 0} type="submit">
            Urun Ekle
          </button>
        </form>
      </article>
    </section>
  );
}
