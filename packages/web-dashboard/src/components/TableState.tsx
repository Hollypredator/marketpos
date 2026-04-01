import React from 'react';

interface TableStateProps {
  colSpan: number;
  emptyText: string;
  errorText?: string | null;
  loading: boolean;
  rowCount: number;
}

export function TableState({
  colSpan,
  emptyText,
  errorText,
  loading,
  rowCount,
}: TableStateProps): React.ReactElement | null {
  if (loading) {
    return (
      <tr>
        <td colSpan={colSpan} className="muted">
          Yukleniyor...
        </td>
      </tr>
    );
  }
  if (errorText) {
    return (
      <tr>
        <td colSpan={colSpan} className="muted">
          {errorText}
        </td>
      </tr>
    );
  }
  if (rowCount === 0) {
    return (
      <tr>
        <td colSpan={colSpan} className="muted">
          {emptyText}
        </td>
      </tr>
    );
  }
  return null;
}
