import { useEffect, useMemo, useState } from 'react';

interface ClientPaginationResult<T> {
  page: number;
  pageSize: number;
  setPage: (nextPage: number) => void;
  total: number;
  totalPages: number;
  visibleRows: T[];
}

export function useClientPagination<T>(
  rows: T[],
  options?: { pageSize?: number },
): ClientPaginationResult<T> {
  const pageSize = options?.pageSize ?? 20;
  const [page, setPage] = useState(1);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const visibleRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [page, pageSize, rows]);

  return {
    page,
    pageSize,
    setPage,
    total,
    totalPages,
    visibleRows,
  };
}
