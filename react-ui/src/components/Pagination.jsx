import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function buildPageItems(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) {
    items.push('left-ellipsis');
  }

  for (let page = start; page <= end; page += 1) {
    items.push(page);
  }

  if (end < totalPages - 1) {
    items.push('right-ellipsis');
  }

  items.push(totalPages);
  return items;
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  disabled = false,
  className = '',
  pageSize,
  pageSizeOptions = [10, 20, 30, 50],
  onPageSizeChange,
}) {
  const safeTotalPages = Math.max(1, totalPages || 1);
  const items = buildPageItems(currentPage, safeTotalPages);

  return (
    <div className={`pagination-bar pagination-bar--product ${className}`.trim()}>
      <div className="pagination-cluster">
        <button
          className="pagination-icon-button"
          type="button"
          disabled={disabled || currentPage === 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>

        <div className="pagination-number-list" role="navigation" aria-label="Pagination">
          {items.map((item, index) => {
            if (typeof item !== 'number') {
              return (
                <span key={`${item}-${index}`} className="pagination-ellipsis" aria-hidden="true">
                  ...
                </span>
              );
            }

            return (
              <button
                key={item}
                type="button"
                className={`pagination-page-button ${item === currentPage ? 'active' : ''}`}
                disabled={disabled}
                onClick={() => onPageChange(item)}
                aria-current={item === currentPage ? 'page' : undefined}
              >
                {item}
              </button>
            );
          })}
        </div>

        <button
          className="pagination-icon-button"
          type="button"
          disabled={disabled || currentPage >= safeTotalPages}
          onClick={() => onPageChange(Math.min(safeTotalPages, currentPage + 1))}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {typeof pageSize === 'number' && typeof onPageSizeChange === 'function' && (
        <label className="pagination-page-size">
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            disabled={disabled}
            className="pagination-page-size__select"
            aria-label="Results per page"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>{option} / page</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export default Pagination;
