import React from 'react';

interface PaginationControlsProps {
  onPageChange: (nextPage: number) => void;
  page: number;
  pageSize: number;
  total: number;
}

export function PaginationControls({
  onPageChange,
  page,
  pageSize,
  total,
}: PaginationControlsProps): React.ReactElement | null {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="pagination-controls">
      <button
        className="btn"
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Onceki
      </button>
      <span className="muted">
        Sayfa {page} / {totalPages}
      </span>
      <button
        className="btn"
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Sonraki
      </button>
    </div>
  );
}
