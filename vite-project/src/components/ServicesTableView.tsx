import type { ServiceRow } from "./ServicesTableEditor";
import { toRupees } from "./ServicesTableEditor";

// Read-only price list, shown behind the "View services" button so the
// workshops table can stay a one-line summary instead of a wall of
// comma-separated names.
function ServicesTableView({ rows, caption }: { rows: ServiceRow[]; caption?: string }) {
  if (!rows?.length) {
    return <div className="svc-empty">No services listed.</div>;
  }
  return (
    <div className="svc-editor">
      {caption && <div className="svc-caption">{caption}</div>}
      <table className="svc-table">
        <thead>
          <tr>
            <th>Service</th>
            <th style={{ width: 160 }}>Price (Rs)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>{row.serviceType}</td>
              <td>{toRupees(row.basePrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ServicesTableView;
