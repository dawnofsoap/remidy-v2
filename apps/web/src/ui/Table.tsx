import type { ReactNode } from 'react';
import { cn, focusRing } from './cn.ts';

export interface TableColumn<Row> {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** Right-aligns numbers such as amounts, so their digits line up. */
  numeric?: boolean;
}

interface TableProps<Row> {
  /** Read out as the table's name. */
  label: string;
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  /**
   * Makes each row open something. The first column becomes a button, named by what it shows so
   * speech control can find it, and a click anywhere on the row does the same.
   */
  onRowClick?: (row: Row) => void;
}

/** Rows and columns for comparing many items at once, on screens wide enough to show them. */
export function Table<Row>({ label, columns, rows, rowKey, onRowClick }: TableProps<Row>) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table aria-label={label} className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-sm text-ink-2">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn('px-4 py-3 font-semibold', column.numeric && 'text-right')}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={cn(onRowClick && 'cursor-pointer hover:bg-surface-2')}
              onClick={
                onRowClick
                  ? () => {
                      onRowClick(row);
                    }
                  : undefined
              }
            >
              {columns.map((column, index) => (
                <td
                  key={column.key}
                  className={cn(
                    'px-4 py-3 align-middle',
                    column.numeric && 'text-right tabular-nums',
                  )}
                >
                  {index === 0 && onRowClick ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        // The row's own click does the work, once.
                        event.stopPropagation();
                        onRowClick(row);
                      }}
                      className={cn('min-h-11 cursor-pointer rounded-md text-left', focusRing)}
                    >
                      {column.cell(row)}
                    </button>
                  ) : (
                    column.cell(row)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
