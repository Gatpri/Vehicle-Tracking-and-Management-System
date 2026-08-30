import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import LiveDeliveryMap from "../components/LiveDeliveryMap";
import { destinationFor } from "../lib/deliveryDestination";
import { legStatusLabel } from "../lib/bookingWorkflow";

interface AssignableRow {
  booking: {
    _id: string;
    serviceType: string;
    pickupLocation?: { lat: number; lng: number; address: string };
    vehicle: { plateNumber: string; make: string; model: string; vehicleType?: string };
    user: { firstname: string; lastname: string; email: string };
  };
  leg: "pickup" | "return";
  workshop: { _id: string; name: string; area: string; region: string; location: { lat: number; lng: number } };
}

interface StaffOption {
  _id: string;
  firstname: string;
  lastname: string;
  area: string;
  region: string;
  // Already mid-delivery elsewhere — the server won't accept an assignment
  // for them until they finish.
  busy?: boolean;
}

// booking/workshop are populated refs, so they come back null if the
// referenced document has been deleted. Typed as nullable because pretending
// otherwise is what let one orphaned record throw and blank the whole page.
interface DeliveryRow {
  _id: string;
  leg: "pickup" | "return";
  status: string;
  area: string;
  // One combined round-trip fee lives on the booking now, shared by both
  // legs (paid once, to whichever single staff member does the round trip).
  booking: {
    serviceType: string;
    vehicle: { plateNumber: string; vehicleType?: string } | null;
    deliveryFee?: number | null;
    distanceKm?: number | null;
  } | null;
  workshop: { name: string; area: string; region: string; location?: { lat: number; lng: number } } | null;
  staff: { _id: string; firstname: string; lastname: string } | null;
  customerLocation?: { lat: number; lng: number; address: string };
}

// Kept in sync with the backend's EN_ROUTE_STATUSES (deliveryController.js,
// deliveryHandlers.js) — every status where a live map has something to show.
const EN_ROUTE = ["en_route_to_pickup", "en_route_to_workshop", "en_route_to_dropoff"];
// Which destination to route toward now lives in lib/deliveryDestination.ts,
// shared with the customer and staff views so all three agree — they had
// drifted, and each carried the same return-leg bug.




function AssignRow({ row, onAssigned }: { row: AssignableRow; onAssigned: () => void }) {
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [staffId, setStaffId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assigned, setAssigned] = useState(false);

  useEffect(() => {
    api
      .get("/deliveries/staff", { params: row.workshop.region ? { region: row.workshop.region } : {} })
      .then((res) => setStaffOptions(res.data.staff))
      .catch(() => setStaffOptions([]));
  }, [row.workshop.region]);

  const assign = async () => {
    if (!staffId) {
      toast.error("Select a staff member");
      return;
    }
    setAssigning(true);
    try {
      await api.post("/deliveries", { bookingId: row.booking._id, leg: row.leg, staffId });
      toast.success("Delivery assigned");
      // Latch locally so the picker and button vanish on the click rather than
      // waiting for the refetch — otherwise the row stays live for a moment
      // and a second click double-submits.
      setAssigned(true);
      onAssigned();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to assign delivery"));
      setAssigning(false);
    }
  };

  // Assigned rows drop out of the assignable list on the next load; until then
  // show the outcome instead of a live control.
  if (assigned) {
    return (
      <div className="ap-row">
        <div className="ap-row-main">
          <span className="ap-row-title">
            {row.leg === "pickup" ? "Pickup" : "Return"} — {row.booking.vehicle?.plateNumber} — {row.workshop.name}
          </span>
        </div>
        <span className="uh-badge uh-badge-blue">Delivery assigned</span>
      </div>
    );
  }

  return (
    <div className="ap-row">
      <div className="ap-row-main">
        <span className="ap-row-title">
          {row.leg === "pickup" ? "Pickup" : "Return"} — {row.booking.vehicle?.plateNumber} — {row.workshop.name}
        </span>
        <span className="ap-row-sub">
          {row.booking.user?.firstname} {row.booking.user?.lastname} · {row.booking.serviceType}
          {row.workshop.region && ` · region: ${row.workshop.region}`}
          {row.workshop.area && ` (${row.workshop.area})`}
        </span>
      </div>
      <div className="ap-row-actions" style={{ gap: 8 }}>
        {/* Busy staff stay listed but unselectable, so it's obvious the roster
            is complete and who simply isn't free — the server refuses them
            anyway, this just says so before the click. */}
        <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8 }}>
          <option value="">Select staff...</option>
          {staffOptions.map((s) => (
            <option key={s._id} value={s._id} disabled={s.busy}>
              {s.firstname} {s.lastname} ({s.region || s.area}){s.busy ? " — busy" : ""}
            </option>
          ))}
        </select>
        <button className="uh-btn uh-btn-sm uh-btn-primary" onClick={assign} disabled={assigning}>
          {assigning ? "Assigning..." : "Assign"}
        </button>
      </div>
    </div>
  );
}

// Read-only once a leg is assigned: an admin sees who is carrying it and can
// follow them on the map, but the assignment itself is final here.
function InFlightRow({ row }: { row: DeliveryRow }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div className="ap-row">
        <div className="ap-row-main">
          <span className="ap-row-title">
            {row.leg === "pickup" ? "Pickup" : "Return"} — {row.booking?.vehicle?.plateNumber ?? "Unknown vehicle"} — {row.workshop?.name ?? "Unknown workshop"}
          </span>
          <span className="ap-row-sub">
            {row.staff ? `${row.staff.firstname} ${row.staff.lastname}` : "Unassigned"} · {row.area}
            {row.booking?.deliveryFee != null &&
              ` · ${row.booking.distanceKm?.toFixed(1) ?? "?"} km · Rs ${(row.booking.deliveryFee / 100).toFixed(2)} round-trip delivery fee`}
          </span>
        </div>
        <div className="ap-row-actions">
          <span className="uh-badge uh-badge-blue">{legStatusLabel(row.leg, row.status)}</span>
          {EN_ROUTE.includes(row.status) && (
            <button className="uh-btn uh-btn-sm uh-btn-ghost" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Hide map" : "Show map"}
            </button>
          )}
        </div>
      </div>
      {expanded && EN_ROUTE.includes(row.status) && (
        <div style={{ margin: "10px 0 18px" }}>
          <LiveDeliveryMap
            deliveryId={row._id}
            status={row.status}
            destination={destinationFor(row)}
            vehicleType={row.booking?.vehicle?.vehicleType}
            height={260}
          />
        </div>
      )}
    </div>
  );
}

function AdminDeliveriesPage() {
  const [area, setArea] = useState("");
  const [region, setRegion] = useState("");
  const [assignable, setAssignable] = useState<AssignableRow[]>([]);
  const [inFlight, setInFlight] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (area) params.area = area;
      if (region) params.region = region;
      const [assignableRes, deliveriesRes] = await Promise.all([
        api.get("/deliveries/assignable", { params }),
        api.get("/deliveries", { params }),
      ]);
      setAssignable(assignableRes.data.assignable);
      setInFlight(deliveriesRes.data.deliveries.filter((d: DeliveryRow) => d.status !== "unassigned"));
    } catch {
      toast.error("Failed to load deliveries");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, region]);

  return (
    <div className="uh-page">
      <div className="uh-page-head">
        <h1>Deliveries</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="Filter by region (e.g. Chitwan)"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--slate-200)" }}
          />
          <input
            type="text"
            placeholder="Filter by area (e.g. Bharatpur)"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--slate-200)" }}
          />
        </div>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <div className="ap-section-title">Ready for assignment</div>
          {assignable.length === 0 ? (
            <div className="uh-empty">Nothing waiting on assignment.</div>
          ) : (
            <div className="uh-list" style={{ marginBottom: 28 }}>
              {assignable.map((row) => (
                <AssignRow key={`${row.booking._id}-${row.leg}`} row={row} onAssigned={load} />
              ))}
            </div>
          )}

          <div className="ap-section-title">In progress / completed</div>
          {inFlight.length === 0 ? (
            <div className="uh-empty">No deliveries yet.</div>
          ) : (
            <div className="uh-list">
              {inFlight.map((row) => (
                <InFlightRow key={row._id} row={row} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AdminDeliveriesPage;
