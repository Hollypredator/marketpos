import React, { useEffect, useMemo, useState } from 'react';

import { PaginationControls } from '../components/PaginationControls';
import { TableState } from '../components/TableState';
import { useClientPagination } from '../hooks/use-client-pagination';
import type {
  BulkProductUpdateForm,
  BulkProductUpdateResult,
  ProductListFilters,
} from '../domain/catalog/types';

interface CategoryRow {
  parentId?: string | null;
  id: string;
  name: string;
  sortOrder: number;
  color?: string | null;
}

interface ProductRow {
  brand?: string | null;
  categoryId?: string | null;
  id: string;
  barcode: string;
  isActive: boolean;
  minStock: number;
  name: string;
  purchasePrice: number;
  salePrice: number;
  supplierId?: string | null;
  vatRate: number;
  expiryDate?: string | null;
}

interface SupplierRow {
  id: string;
  isActive: boolean;
  name: string;
}

interface CategoryForm {
  color: string;
  name: string;
  parentId: string;
  sortOrder: string;
}

interface ProductForm {
  barcode: string;
  brand: string;
  categoryId: string;
  supplierId: string;
  minStock: string;
  name: string;
  purchasePrice: string;
  salePrice: string;
  vatRate: string;
  expiryDate: string;
}

interface CatalogPageProps {
  bulkForm: BulkProductUpdateForm;
  categories: CategoryRow[];
  categoriesErrorText: string | null;
  categoriesLoading: boolean;
  categoryEditForm: CategoryForm;
  categoryForm: CategoryForm;
  companyId: string;
  onAddCategory: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onAddProduct: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onApplyBulk: (productIds: string[], form: BulkProductUpdateForm) => Promise<void>;
  onBulkFormChange: (updater: (current: BulkProductUpdateForm) => BulkProductUpdateForm) => void;
  onCategoryEditFormChange: (updater: (current: CategoryForm) => CategoryForm) => void;
  onCategoryFormChange: (updater: (current: CategoryForm) => CategoryForm) => void;
  onDeleteCategory: () => Promise<void>;
  onDeleteProduct: (productId: string) => Promise<void>;
  onPreviewBulk: (
    productIds: string[],
    form: BulkProductUpdateForm,
  ) => Promise<BulkProductUpdateResult | null>;
  onProductEditFormChange: (updater: (current: ProductForm) => ProductForm) => void;
  onProductFiltersChange: (updater: (current: ProductListFilters) => ProductListFilters) => void;
  onProductFormChange: (updater: (current: ProductForm) => ProductForm) => void;
  onSelectCategory: (categoryId: string) => void;
  onSelectProduct: (productId: string) => void;
  onToggleProductActive: (productId: string, isActive: boolean) => Promise<void>;
  onUpdateCategory: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onUpdateProduct: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  productEditForm: ProductForm;
  productFilters: ProductListFilters;
  productForm: ProductForm;
  products: ProductRow[];
  productsErrorText: string | null;
  productsLoading: boolean;
  saving: boolean;
  selectedCategoryId: string;
  selectedProductId: string;
  suppliers: SupplierRow[];
  toMoney: (value: number) => string;
}

type ProductSort = 'NAME_ASC' | 'PRICE_ASC' | 'PRICE_DESC';

function normalizeTr(value: string): string {
  return value.trim().toLocaleLowerCase('tr-TR');
}

export function CatalogPage({
  bulkForm,
  categories,
  categoriesErrorText,
  categoriesLoading,
  categoryEditForm,
  categoryForm,
  companyId,
  onAddCategory,
  onAddProduct,
  onApplyBulk,
  onBulkFormChange,
  onCategoryEditFormChange,
  onCategoryFormChange,
  onDeleteCategory,
  onDeleteProduct,
  onPreviewBulk,
  onProductEditFormChange,
  onProductFiltersChange,
  onProductFormChange,
  onSelectCategory,
  onSelectProduct,
  onToggleProductActive,
  onUpdateCategory,
  onUpdateProduct,
  productEditForm,
  productFilters,
  productForm,
  products,
  productsErrorText,
  productsLoading,
  saving,
  selectedCategoryId,
  selectedProductId,
  suppliers,
  toMoney,
}: CatalogPageProps): React.ReactElement {
  const [categorySearch, setCategorySearch] = useState('');
  const [productSort, setProductSort] = useState<ProductSort>('NAME_ASC');
  const [productPageSize, setProductPageSize] = useState(50);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [bulkPreview, setBulkPreview] = useState<BulkProductUpdateResult | null>(null);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const supplierLabelById = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier.name])),
    [suppliers],
  );
  const supplierOptions = useMemo(
    () => [...suppliers].sort((left, right) => left.name.localeCompare(right.name, 'tr')),
    [suppliers],
  );
  const brandOptions = useMemo(
    () =>
      Array.from(
        new Set(
          products
            .map((product) => product.brand?.trim() ?? '')
            .filter((brand) => brand.length > 0),
        ),
      ).sort((left, right) => left.localeCompare(right, 'tr')),
    [products],
  );

  const categoryLabelById = useMemo(() => {
    const labels = new Map<string, string>();
    for (const category of categories) {
      const path: string[] = [category.name];
      let cursor = category.parentId ?? null;
      let guard = 0;
      while (cursor && guard < 20) {
        const parent = categoryById.get(cursor);
        if (!parent) {
          break;
        }
        path.unshift(parent.name);
        cursor = parent.parentId ?? null;
        guard += 1;
      }
      labels.set(category.id, path.join(' > '));
    }
    return labels;
  }, [categories, categoryById]);

  const categoryOptions = useMemo(
    () =>
      [...categories].sort((left, right) => {
        const leftLabel = categoryLabelById.get(left.id) ?? left.name;
        const rightLabel = categoryLabelById.get(right.id) ?? right.name;
        return leftLabel.localeCompare(rightLabel, 'tr');
      }),
    [categories, categoryLabelById],
  );

  const filteredCategories = useMemo(() => {
    const normalized = normalizeTr(categorySearch);
    if (!normalized) {
      return categories;
    }
    return categories.filter((category) =>
      (categoryLabelById.get(category.id) ?? category.name).toLocaleLowerCase('tr-TR').includes(normalized),
    );
  }, [categories, categoryLabelById, categorySearch]);

  const sortedProducts = useMemo(() => {
    const rows = [...products];
    rows.sort((left, right) => {
      if (productSort === 'PRICE_ASC') {
        return left.salePrice - right.salePrice;
      }
      if (productSort === 'PRICE_DESC') {
        return right.salePrice - left.salePrice;
      }
      return left.name.localeCompare(right.name, 'tr');
    });
    return rows;
  }, [productSort, products]);

  const categoriesPagination = useClientPagination(filteredCategories, { pageSize: 20 });
  const productsPagination = useClientPagination(sortedProducts, {
    pageSize: productPageSize === 0 ? Math.max(1, sortedProducts.length) : productPageSize,
  });

  useEffect(() => {
    setSelectedProductIds((current) =>
      current.filter((productId) => products.some((product) => product.id === productId)),
    );
  }, [products]);

  const allVisibleSelected =
    productsPagination.visibleRows.length > 0 &&
    productsPagination.visibleRows.every((row) => selectedProductIds.includes(row.id));

  return (
    <section className="panel-grid two-col">
      <article className="card">
        <h2>Kategoriler ({categoriesPagination.total}/{categories.length})</h2>
        <div className="inline-row two">
          <input
            placeholder="Kategori ara (ad/yol)"
            value={categorySearch}
            onChange={(event) => setCategorySearch(event.target.value)}
          />
          <button
            className="btn ghost"
            type="button"
            onClick={() => setCategorySearch('')}
            disabled={categorySearch.trim().length === 0}
          >
            Aramayi Temizle
          </button>
        </div>

        <ul className="list">
          {categoriesPagination.visibleRows.map((category) => (
            <li key={category.id} className={selectedCategoryId === category.id ? 'active' : ''}>
              <button className="list-button" type="button" onClick={() => onSelectCategory(category.id)}>
                <span>{categoryLabelById.get(category.id) ?? category.name}</span>
                <small>Sira: {category.sortOrder}</small>
              </button>
              <span className="dot" style={{ backgroundColor: category.color ?? '#0f766e' }} />
            </li>
          ))}
        </ul>
        {categoriesLoading && <p className="muted">Kategoriler yukleniyor...</p>}
        {!categoriesLoading && categoriesErrorText && <p className="muted">{categoriesErrorText}</p>}
        <PaginationControls
          onPageChange={categoriesPagination.setPage}
          page={categoriesPagination.page}
          pageSize={categoriesPagination.pageSize}
          total={categoriesPagination.total}
        />

        {selectedCategoryId.length > 0 && (
          <form className="form-grid compact" onSubmit={onUpdateCategory}>
            <h3>Secili Kategoriyi Duzenle</h3>
            <input
              placeholder="Kategori adi"
              value={categoryEditForm.name}
              onChange={(event) =>
                onCategoryEditFormChange((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
            <select
              value={categoryEditForm.parentId}
              onChange={(event) =>
                onCategoryEditFormChange((current) => ({ ...current, parentId: event.target.value }))
              }
            >
              <option value="">Ana kategori</option>
              {categoryOptions
                .filter((category) => category.id !== selectedCategoryId)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {categoryLabelById.get(category.id) ?? category.name}
                  </option>
                ))}
            </select>
            <div className="inline-row two">
              <input
                placeholder="#0f766e"
                value={categoryEditForm.color}
                onChange={(event) =>
                  onCategoryEditFormChange((current) => ({ ...current, color: event.target.value }))
                }
              />
              <input
                type="number"
                value={categoryEditForm.sortOrder}
                onChange={(event) =>
                  onCategoryEditFormChange((current) => ({ ...current, sortOrder: event.target.value }))
                }
              />
            </div>
            <div className="inline-row two">
              <button className="btn primary" disabled={saving} type="submit">
                Kategoriyi Guncelle
              </button>
              <button className="btn danger" disabled={saving} type="button" onClick={() => void onDeleteCategory()}>
                Kategoriyi Sil
              </button>
            </div>
          </form>
        )}

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
          <select
            value={categoryForm.parentId}
            onChange={(event) =>
              onCategoryFormChange((current) => ({ ...current, parentId: event.target.value }))
            }
          >
            <option value="">Ana kategori</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {categoryLabelById.get(category.id) ?? category.name}
              </option>
            ))}
          </select>
          <div className="inline-row two">
            <input
              placeholder="#0f766e"
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
        <div className="legacy-filter-box">
          <div className="inline-row three">
            <input
              placeholder="Sunucu arama (urun, barkod, marka, kategori, tedarikci)"
              value={productFilters.search}
              onChange={(event) =>
                onProductFiltersChange((current) => ({ ...current, search: event.target.value }))
              }
            />
            <select
              value={productFilters.categoryId}
              onChange={(event) =>
                onProductFiltersChange((current) => ({ ...current, categoryId: event.target.value }))
              }
            >
              <option value="">Tum kategoriler</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {categoryLabelById.get(category.id) ?? category.name}
                </option>
              ))}
            </select>
            <select
              value={productFilters.supplierId}
              onChange={(event) =>
                onProductFiltersChange((current) => ({
                  ...current,
                  supplierId: event.target.value,
                }))
              }
            >
              <option value="">Tum tedarikciler</option>
              {supplierOptions.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
          <div className="inline-row three">
            <select
              value={productFilters.brand}
              onChange={(event) =>
                onProductFiltersChange((current) => ({ ...current, brand: event.target.value }))
              }
            >
              <option value="">Tum markalar</option>
              {brandOptions.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
            <select
              value={productFilters.active}
              onChange={(event) =>
                onProductFiltersChange((current) => ({
                  ...current,
                  active: event.target.value as ProductListFilters['active'],
                }))
              }
            >
              <option value="">Tum durumlar</option>
              <option value="true">Aktif</option>
              <option value="false">Pasif</option>
            </select>
            <select
              value={productFilters.vatRate}
              onChange={(event) =>
                onProductFiltersChange((current) => ({ ...current, vatRate: event.target.value }))
              }
            >
              <option value="">Tum KDV</option>
              <option value="1">%1</option>
              <option value="10">%10</option>
              <option value="20">%20</option>
            </select>
          </div>
          <div className="inline-row three">
            <input
              type="number"
              placeholder="Satis min"
              value={productFilters.minPrice}
              onChange={(event) =>
                onProductFiltersChange((current) => ({ ...current, minPrice: event.target.value }))
              }
            />
            <input
              type="number"
              placeholder="Satis maks"
              value={productFilters.maxPrice}
              onChange={(event) =>
                onProductFiltersChange((current) => ({ ...current, maxPrice: event.target.value }))
              }
            />
            <input
              type="number"
              placeholder="Alis min"
              value={productFilters.minPurchasePrice}
              onChange={(event) =>
                onProductFiltersChange((current) => ({
                  ...current,
                  minPurchasePrice: event.target.value,
                }))
              }
            />
          </div>
          <div className="inline-row three">
            <input
              type="number"
              placeholder="Alis maks"
              value={productFilters.maxPurchasePrice}
              onChange={(event) =>
                onProductFiltersChange((current) => ({
                  ...current,
                  maxPurchasePrice: event.target.value,
                }))
              }
            />
            <input
              type="date"
              value={productFilters.updatedFrom}
              onChange={(event) =>
                onProductFiltersChange((current) => ({ ...current, updatedFrom: event.target.value }))
              }
            />
            <input
              type="date"
              value={productFilters.updatedTo}
              onChange={(event) =>
                onProductFiltersChange((current) => ({ ...current, updatedTo: event.target.value }))
              }
            />
            <button
              className="btn ghost"
              type="button"
              onClick={() =>
                onProductFiltersChange(() => ({
                  active: '',
                  brand: '',
                  categoryId: '',
                  maxPrice: '',
                  maxPurchasePrice: '',
                  minPrice: '',
                  minPurchasePrice: '',
                  search: '',
                  supplierId: '',
                  updatedFrom: '',
                  updatedTo: '',
                  vatRate: '',
                }))
              }
            >
              Sunucu Filtresini Sifirla
            </button>
          </div>
          <div className="inline-row three">
            <select value={productSort} onChange={(event) => setProductSort(event.target.value as ProductSort)}>
              <option value="NAME_ASC">Ada gore (A-Z)</option>
              <option value="PRICE_ASC">Fiyata gore (artan)</option>
              <option value="PRICE_DESC">Fiyata gore (azalan)</option>
            </select>
            <select value={String(productPageSize)} onChange={(event) => setProductPageSize(Number(event.target.value))}>
              <option value="20">20 kayit</option>
              <option value="50">50 kayit</option>
              <option value="100">100 kayit</option>
              <option value="0">Tum kayitlar</option>
            </select>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(event) => {
                  if (event.target.checked) {
                    setSelectedProductIds((current) =>
                      Array.from(new Set([...current, ...productsPagination.visibleRows.map((row) => row.id)])),
                    );
                    return;
                  }
                  setSelectedProductIds((current) =>
                    current.filter((id) => !productsPagination.visibleRows.some((row) => row.id === id)),
                  );
                }}
              />
              <span>Sayfadakileri sec</span>
            </label>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th />
                <th>Urun</th>
                <th>Barkod</th>
                <th>Marka</th>
                <th>Tedarikci</th>
                <th>Satis</th>
                <th>Alis</th>
                <th>Durum</th>
                <th>Kategori</th>
                <th>Islem</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={10}
                emptyText="Urun kaydi bulunmadi."
                errorText={productsErrorText}
                loading={productsLoading}
                rowCount={productsPagination.total}
              />
              {productsPagination.visibleRows.map((product) => (
                <tr key={product.id} className={selectedProductId === product.id ? 'row-selected' : ''}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedProductIds.includes(product.id)}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedProductIds((current) => [...current, product.id]);
                        } else {
                          setSelectedProductIds((current) => current.filter((id) => id !== product.id));
                        }
                      }}
                    />
                  </td>
                  <td>{product.name}</td>
                  <td>{product.barcode}</td>
                  <td>{product.brand?.trim().length ? product.brand : '-'}</td>
                  <td>{product.supplierId ? supplierLabelById.get(product.supplierId) ?? '-' : '-'}</td>
                  <td>{toMoney(product.salePrice)}</td>
                  <td>{toMoney(product.purchasePrice)}</td>
                  <td>{product.isActive ? 'Aktif' : 'Pasif'}</td>
                  <td>{product.categoryId ? categoryLabelById.get(product.categoryId) ?? '-' : '-'}</td>
                  <td>
                    <div className="inline-row two">
                      <button className="btn ghost" type="button" onClick={() => onSelectProduct(product.id)}>
                        Duzenle
                      </button>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => void onToggleProductActive(product.id, !product.isActive)}
                      >
                        {product.isActive ? 'Pasif Yap' : 'Aktif Yap'}
                      </button>
                    </div>
                    <button
                      className="btn danger"
                      type="button"
                      onClick={() => void onDeleteProduct(product.id)}
                    >
                      Sil
                    </button>
                  </td>
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

        <form className="form-grid compact" onSubmit={onUpdateProduct}>
          <h3>Secili Urunu Duzenle</h3>
          <div className="inline-row two">
            <input
              placeholder="Barkod"
              value={productEditForm.barcode}
              onChange={(event) =>
                onProductEditFormChange((current) => ({ ...current, barcode: event.target.value }))
              }
              required
            />
            <input
              placeholder="Urun adi"
              value={productEditForm.name}
              onChange={(event) =>
                onProductEditFormChange((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
          </div>
          <div className="inline-row two">
            <input
              placeholder="Marka"
              value={productEditForm.brand}
              onChange={(event) =>
                onProductEditFormChange((current) => ({ ...current, brand: event.target.value }))
              }
            />
            <select
              value={productEditForm.supplierId}
              onChange={(event) =>
                onProductEditFormChange((current) => ({ ...current, supplierId: event.target.value }))
              }
            >
              <option value="">Tedarikci yok</option>
              {supplierOptions.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
          <div className="inline-row three">
            <select
              value={productEditForm.categoryId}
              onChange={(event) =>
                onProductEditFormChange((current) => ({ ...current, categoryId: event.target.value }))
              }
            >
              <option value="">Kategori yok</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {categoryLabelById.get(category.id) ?? category.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              placeholder="Alis"
              value={productEditForm.purchasePrice}
              onChange={(event) =>
                onProductEditFormChange((current) => ({ ...current, purchasePrice: event.target.value }))
              }
            />
            <input
              type="number"
              step="0.01"
              placeholder="Satis"
              value={productEditForm.salePrice}
              onChange={(event) =>
                onProductEditFormChange((current) => ({ ...current, salePrice: event.target.value }))
              }
            />
          </div>
          <div className="inline-row three">
            <select
              value={productEditForm.vatRate}
              onChange={(event) =>
                onProductEditFormChange((current) => ({ ...current, vatRate: event.target.value }))
              }
            >
              <option value="1">%1</option>
              <option value="10">%10</option>
              <option value="20">%20</option>
            </select>
            <input
              type="number"
              placeholder="Min stok"
              value={productEditForm.minStock}
              onChange={(event) =>
                onProductEditFormChange((current) => ({ ...current, minStock: event.target.value }))
              }
            />
            <label>
              SKT (Son Kullanma Tarihi)
              <input
                type="date"
                value={productEditForm.expiryDate ? productEditForm.expiryDate.split('T')[0] : ''}
                onChange={(event) =>
                  onProductEditFormChange((current) => ({ ...current, expiryDate: event.target.value }))
                }
              />
            </label>
            <button className="btn primary" disabled={saving || selectedProductId.length === 0} type="submit">
              Urunu Guncelle
            </button>
          </div>
        </form>

        <form className="form-grid compact" onSubmit={onAddProduct}>
          <h3>Yeni Urun</h3>
          <div className="inline-row two">
            <input
              placeholder="Barkod"
              value={productForm.barcode}
              onChange={(event) =>
                onProductFormChange((current) => ({ ...current, barcode: event.target.value }))
              }
              required
            />
            <input
              placeholder="Urun adi"
              value={productForm.name}
              onChange={(event) =>
                onProductFormChange((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
          </div>
          <div className="inline-row two">
            <input
              placeholder="Marka"
              value={productForm.brand}
              onChange={(event) =>
                onProductFormChange((current) => ({ ...current, brand: event.target.value }))
              }
            />
            <select
              value={productForm.supplierId}
              onChange={(event) =>
                onProductFormChange((current) => ({ ...current, supplierId: event.target.value }))
              }
            >
              <option value="">Tedarikci yok</option>
              {supplierOptions.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
          <div className="inline-row three">
            <select
              value={productForm.categoryId}
              onChange={(event) =>
                onProductFormChange((current) => ({ ...current, categoryId: event.target.value }))
              }
            >
              <option value="">Kategori yok</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {categoryLabelById.get(category.id) ?? category.name}
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
            <label>
              SKT (Son Kullanma Tarihi)
              <input
                type="date"
                value={productForm.expiryDate}
                onChange={(event) =>
                  onProductFormChange((current) => ({ ...current, expiryDate: event.target.value }))
                }
              />
            </label>
            <button className="btn primary" disabled={saving || companyId.length === 0} type="submit">
              Urun Ekle
            </button>
          </div>
        </form>

        <div className="form-grid compact">
          <h3>Toplu Urun Islemi</h3>
          <p className="muted">Secili urun: {selectedProductIds.length}</p>
          <BulkFormControls
            bulkForm={bulkForm}
            categoryOptions={categoryOptions}
            categoryLabelById={categoryLabelById}
            onBulkFormChange={onBulkFormChange}
          />
          <div className="inline-row two">
            <button
              className="btn ghost"
              type="button"
              disabled={selectedProductIds.length === 0 || saving}
              onClick={async () => {
                const preview = await onPreviewBulk(selectedProductIds, bulkForm);
                setBulkPreview(preview);
              }}
            >
              Onizleme Al
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={selectedProductIds.length === 0 || saving}
              onClick={async () => {
                if (!window.confirm('Toplu islemi uygulamak istiyor musunuz?')) {
                  return;
                }
                await onApplyBulk(selectedProductIds, bulkForm);
              }}
            >
              Toplu Islemi Uygula
            </button>
          </div>
          {bulkPreview && (
            <div className="setup-summary">
              <strong>
                Onizleme: {bulkPreview.preview.willChange}/{bulkPreview.preview.totalResolved} urun degisecek
              </strong>
              <ul className="list">
                {bulkPreview.preview.sample.map((row) => (
                  <li key={row.id}>
                    <span>{row.id}</span>
                    <small>{row.changed ? 'Degisecek' : 'Degismeyecek'}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}

function BulkFormControls(props: {
  bulkForm: BulkProductUpdateForm;
  categoryOptions: CategoryRow[];
  categoryLabelById: Map<string, string>;
  onBulkFormChange: (updater: (current: BulkProductUpdateForm) => BulkProductUpdateForm) => void;
}): React.ReactElement {
  const { bulkForm, categoryLabelById, categoryOptions, onBulkFormChange } = props;
  return (
    <>
      <select
        value={bulkForm.mode}
        onChange={(event) =>
          onBulkFormChange((current) => ({
            ...current,
            mode: event.target.value as BulkProductUpdateForm['mode'],
          }))
        }
      >
        <option value="SET_PRICE">Satis fiyatini sabit deger yap</option>
        <option value="ADJUST_PRICE_PERCENT">Satis fiyatini yuzde degistir</option>
        <option value="SET_MIN_STOCK">Min stok sabitle</option>
        <option value="MOVE_CATEGORY">Kategori tasi</option>
        <option value="SET_ACTIVE">Aktif/Pasif yap</option>
      </select>

      {bulkForm.mode === 'SET_PRICE' && (
        <input
          type="number"
          step="0.01"
          placeholder="Yeni satis fiyati"
          value={bulkForm.salePrice}
          onChange={(event) =>
            onBulkFormChange((current) => ({ ...current, salePrice: event.target.value }))
          }
        />
      )}
      {bulkForm.mode === 'ADJUST_PRICE_PERCENT' && (
        <input
          type="number"
          step="0.01"
          placeholder="Yuzde artis/azalis (or: 10 veya -5)"
          value={bulkForm.percentage}
          onChange={(event) =>
            onBulkFormChange((current) => ({ ...current, percentage: event.target.value }))
          }
        />
      )}
      {bulkForm.mode === 'SET_MIN_STOCK' && (
        <input
          type="number"
          placeholder="Yeni min stok"
          value={bulkForm.minStock}
          onChange={(event) =>
            onBulkFormChange((current) => ({ ...current, minStock: event.target.value }))
          }
        />
      )}
      {bulkForm.mode === 'MOVE_CATEGORY' && (
        <select
          value={bulkForm.categoryId}
          onChange={(event) =>
            onBulkFormChange((current) => ({ ...current, categoryId: event.target.value }))
          }
        >
          <option value="">Kategori kaldir (bos)</option>
          {categoryOptions.map((category) => (
            <option key={category.id} value={category.id}>
              {categoryLabelById.get(category.id) ?? category.name}
            </option>
          ))}
        </select>
      )}
      {bulkForm.mode === 'SET_ACTIVE' && (
        <select
          value={bulkForm.isActive}
          onChange={(event) =>
            onBulkFormChange((current) => ({
              ...current,
              isActive: event.target.value as BulkProductUpdateForm['isActive'],
            }))
          }
        >
          <option value="true">Aktif</option>
          <option value="false">Pasif</option>
        </select>
      )}
    </>
  );
}
