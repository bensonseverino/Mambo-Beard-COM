/**
 * Size chart table — renders the product's size_chart data from the backend
 * (products.size_chart JSON via the admin dashboard). Purely presentational:
 * it renders whatever sanitized rows/columns the API provides and nothing
 * else. The parent only mounts it for products that actually have data.
 *
 * Expected data shape (see parseSizeChart in functions/lib/product.js):
 *   { columns: ["Chest (cm)", "Length (cm)"],
 *     rows: [{ size: "S", measurements: ["92", "68"] }] }
 */
export default function SizeChartTable({ columns, rows }) {
  return (
    <div className="w-full flex flex-col items-center gap-3">
      <p className="text-[9px] tracking-[0.35em] uppercase text-black/35 font-light">
        Size Chart
      </p>

      <table className="w-full border-collapse text-[10px] font-light">
        <thead>
          <tr>
            <th className="text-left text-[9px] tracking-[0.2em] uppercase text-black/40 px-2 py-1.5 font-light border-b border-black/10">
              Size
            </th>
            {columns.map((col) => (
              <th
                key={col}
                className="text-right text-[9px] tracking-[0.2em] uppercase text-black/40 px-2 py-1.5 font-light border-b border-black/10"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.size}>
              <td className="text-left text-black/60 px-2 py-1.5 border-b border-black/5">
                {row.size}
              </td>
              {columns.map((col, idx) => (
                <td
                  key={col}
                  className="text-right text-black/55 px-2 py-1.5 border-b border-black/5 tabular-nums"
                >
                  {row.measurements[idx] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-[8px] tracking-[0.2em] uppercase text-black/30 font-light">
        Measurements may vary slightly by fabric and color
      </p>
    </div>
  );
}

