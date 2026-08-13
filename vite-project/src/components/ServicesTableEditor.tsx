import { useState } from "react";

export interface ServiceRow {
  serviceType: string;
  basePrice: number; // paisa
}

// Prices are stored in paisa but nobody thinks in paisa, so the table talks
// rupees and converts at the edge.
const toRupees = (paisa: number) => (paisa / 100).toFixed(2);
const toPaisa = (rupees: string) => Math.round(Number(rupees) * 100);

/**
 * A proper add/edit table for a workshop's price list, replacing the old
 * "oil_change:150000, tyre:80000" free-text field — that format was unreadable,
 * silently dropped any row it couldn't parse, and made the paisa/rupee
 * distinction invisible.
 *
 * Controlled: the parent owns the rows and decides what saving means (a direct
 * update for an admin, a change request for a workshop-admin).
 */
function ServicesTableEditor({
  rows,
  onChange,
  disabled = false,
}: {
  rows: ServiceRow[];
  onChange: (rows: ServiceRow[]) => void;
  disabled?: boolean;
}) {
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");

  const duplicate = (name: string, ignoreIndex = -1) =>
    rows.some((r, i) => i !== ignoreIndex && r.serviceType.trim().toLowerCase() === name.trim().toLowerCase());

  const addRow = () => {
    const serviceType = newName.trim();
    if (!serviceType) return;
    if (duplicate(serviceType)) return; // the inline hint already explains why
    const price = toPaisa(newPrice || "0");
    if (!Number.isFinite(price) || price < 0) return;
    onChange([...rows, { serviceType, basePrice: price }]);
    setNewName("");
    setNewPrice("");
  };

  const updateRow = (index: number, patch: Partial<ServiceRow>) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index));

  const addBlocked = !newName.trim() || duplicate(newName);

  return (
    <div className="svc-editor">
      <table className="svc-table">
        <thead>
          <tr>
            <th>Service</th>
            <th style={{ width: 160 }}>Price (Rs)</th>
            <th style={{ width: 70 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="svc-empty">No services yet — add one below.</td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr key={i}>
              <td>
                <input
                  className="svc-input"
                  value={row.serviceType}
                  disabled={disabled}
                  onChange={(e) => updateRow(i, { serviceType: e.target.value })}
                />
                {duplicate(row.serviceType, i) && (
                  <div className="svc-warn">Duplicate service name</div>
                )}
              </td>
              <td>
                <input
                  className="svc-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={toRupees(row.basePrice)}
                  disabled={disabled}
                  onChange={(e) => updateRow(i, { basePrice: toPaisa(e.target.value || "0") })}
                />
              </td>
              <td>
                {!disabled && (
                  <button type="button" className="svc-remove" onClick={() => removeRow(i)}>
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!disabled && (
        <div className="svc-add">
          <input
            className="svc-input"
            placeholder="Service name (e.g. oil change)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              // Enter adds a row rather than submitting the surrounding form,
              // which would save a half-filled price list.
              if (e.key === "Enter") {
                e.preventDefault();
                addRow();
              }
            }}
          />
          <input
            className="svc-input"
            type="number"
            min="0"
            step="0.01"
            placeholder="Price (Rs)"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addRow();
              }
            }}
          />
          <button type="button" className="uh-btn uh-btn-sm uh-btn-primary" onClick={addRow} disabled={addBlocked}>
            + Add service
          </button>
        </div>
      )}
      {newName.trim() && duplicate(newName) && (
        <div className="svc-warn">"{newName.trim()}" is already listed.</div>
      )}
    </div>
  );
}

export default ServicesTableEditor;
export { toRupees };
