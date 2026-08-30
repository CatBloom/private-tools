import { useEffect, useState } from 'react'

const PAGE_SIZE = 10

export const usePaginatedRows = <T,>(rows: T[]) => {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * PAGE_SIZE

  useEffect(() => {
    setPage(1)
  }, [rows])

  return {
    page: currentPage,
    pageCount,
    pageRows: rows.slice(start, start + PAGE_SIZE),
    setPage,
    start
  }
}

type PaginationProps = {
  page: number
  pageCount: number
  totalCount: number
  start: number
  onPageChange: (page: number) => void
}

export const Pagination = ({ page, pageCount, totalCount, start, onPageChange }: PaginationProps) => {
  if (totalCount <= PAGE_SIZE) {
    return null
  }

  const firstItem = start + 1
  const lastItem = Math.min(start + PAGE_SIZE, totalCount)

  return (
    <nav className="ccsv-pagination" aria-label="テーブルのページ">
      <span className="ccsv-pagination-status">
        {totalCount.toLocaleString('ja-JP')}件中 {firstItem.toLocaleString('ja-JP')}〜
        {lastItem.toLocaleString('ja-JP')}件
      </span>
      <div className="ccsv-pagination-controls">
        <button type="button" disabled={page === 1} onClick={() => onPageChange(page - 1)}>
          前へ
        </button>
        <span aria-live="polite">
          {page} / {pageCount}
        </span>
        <button type="button" disabled={page === pageCount} onClick={() => onPageChange(page + 1)}>
          次へ
        </button>
      </div>
    </nav>
  )
}
