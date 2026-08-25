/**
 * Shapes the API returns, as the screens actually consume them.
 *
 * These are deliberately partial. The backend documents are wider than this,
 * but typing only the fields the mobile screens read keeps the definitions
 * honest — a field listed here is one that some screen genuinely displays.
 * Optional markers reflect fields that are genuinely absent on some records
 * (an unassigned delivery has no staff, an unreviewed booking no rating).
 */

export interface Vehicle {
  _id: string;
  make?: string;
  model?: string;
  year?: number;
  numberPlate?: string;
  color?: string;
  vin?: string;
  status?: string;
  photos?: string[];
  /**
   * Plate and vehicle shots held per angle. The backend keeps these alongside
   * the older flat `photos`/`plateImageUrl` fields rather than replacing them,
   * so CCTV matching and the web pages keep working unchanged.
   */
  plateImages?: { url: string; angle: "front" | "back" }[];
  vehicleImages?: { url: string; angle: "front" | "back" | "left" | "right" }[];
  owner?: string;
  isFlagged?: boolean;
}

export interface WorkshopService {
  serviceType: string;
  /** Paisa, not rupees — see formatMoney. */
  basePrice: number;
}

export interface Workshop {
  _id: string;
  name: string;
  address?: string;
  area?: string;
  region?: string;
  contactPhone?: string;
  contactEmail?: string;
  logoUrl?: string;
  images?: string[];
  /** An object on this model, not a bare number. */
  rating?: { average?: number; count?: number };
  sentiment?: { score?: number; positiveRatio?: number; scoredCount?: number };
  servicesOffered?: WorkshopService[];
  brandsSupported?: string[];
  bikeTypes?: string[];
  status?: string;
  location?: { lat?: number; lng?: number };
  distanceKm?: number;
}

export interface Booking {
  _id: string;
  user?: UserRecord | string;
  vehicle?: Vehicle | string;
  workshop?: Workshop | string;
  status: string;
  statusChangedAt?: string;
  serviceType: string;
  description?: string;
  /** Paisa. Null until the workshop quotes. */
  quotedPrice?: number | null;
  /** Paisa. Null until the job is finished and priced. */
  finalPrice?: number | null;
  isOverpriced?: boolean;
  overpriceRatio?: number | null;
  paymentStatus?: "unpaid" | "paid" | "refunded";
  scheduledAt?: string | null;
  createdAt?: string;
  deliveryRequested?: boolean;
  pickupLocation?: { lat?: number | null; lng?: number | null; address?: string };
  returnDeliveryRequested?: boolean;
  /** Paisa. */
  deliveryFee?: number | null;
  distanceKm?: number | null;
}

export interface WalletInfo {
  _id?: string;
  balance: number;
  currency?: string;
}

export interface Transaction {
  _id: string;
  type: string;
  amount: number;
  status?: string;
  description?: string;
  createdAt?: string;
}

export interface Withdrawal {
  _id: string;
  amount: number;
  status: string;
  esewaId?: string;
  createdAt?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

export interface SosAlert {
  _id: string;
  /** "active" | "pending" | "resolved" */
  status?: string;
  message?: string;
  createdAt?: string;
  /** Flat lat/lng on this model — not GeoJSON coordinates. */
  location?: { lat?: number; lng?: number };
  /** "manual" for a user-raised alert, "theft" for one the CCTV pipeline raised. */
  kind?: "manual" | "theft";
  ownerConfirmation?: "confirmed" | "not-confirmed" | null;
  user?: UserRecord | string;
  vehicle?: Vehicle | string;
  plateImageUrl?: string;
  vehicleImageUrl?: string;
  cameraId?: string;
}

export interface TheftReport {
  _id: string;
  status: string;
  description?: string;
  createdAt?: string;
  vehicle?: Vehicle | string;
  lastSeenLocation?: { coordinates?: [number, number] };
}

export interface NotificationItem {
  _id: string;
  title?: string;
  message?: string;
  type?: string;
  read?: boolean;
  createdAt?: string;
}

export interface Conversation {
  _id: string;
  participants?: { _id: string; firstname?: string; lastname?: string; role?: string }[];
  /**
   * When the thread last had activity. The server tracks only this — there is
   * no denormalised last-message preview on the Conversation document.
   */
  lastMessageAt?: string;
  updatedAt?: string;
  /**
   * Server-computed name. A channel thread has no second participant to name
   * itself after, and the right name differs by viewer — the customer sees
   * "Customer Support", the admin answering sees who wrote in.
   */
  label?: string | null;
  /** "support" | "tracking" | "workshop" | "delivery-region", or null for a direct thread. */
  channel?: string | null;
}

/** A group the user may write to, from GET /chat/channels. */
export interface ChatChannel {
  channel: string;
  workshop?: string;
  label: string;
  description?: string;
}

export interface Message {
  _id: string;
  conversation?: string;
  sender?: { _id: string; firstname?: string; lastname?: string } | string;
  /** The message body. Named `text` on the server (models/Message.js). */
  text?: string;
  createdAt?: string;
  /** Set once the message has been edited. */
  editedAt?: string | null;
  /** Set when unsent. `text` is blanked at the same time. */
  deletedAt?: string | null;
  /** Previous versions, oldest first. Revealed by tapping "edited". */
  editHistory?: { text: string; editedAt: string }[];
}

/** How long after sending a message may still be edited — mirrors the server. */
export const EDIT_WINDOW_MS = 3 * 60 * 1000;

/**
 * Whether the edit control should still be offered.
 *
 * Checked against the device clock only to decide what to *show* — the server
 * re-checks and rejects a late edit regardless, so a wrong clock costs a
 * confusing error at worst, never an unauthorised edit.
 */
export const canStillEdit = (m: Message): boolean =>
  !m.deletedAt && Date.now() - new Date(m.createdAt ?? 0).getTime() <= EDIT_WINDOW_MS;

export interface Delivery {
  _id: string;
  booking?: Booking | string;
  status: string;
  direction?: string;
  staff?: { _id: string; firstname?: string; lastname?: string; phone?: string } | string;
  pickupAddress?: string;
  dropoffAddress?: string;
  createdAt?: string;
}

export interface LocationPoint {
  _id?: string;
  coordinates?: [number, number];
  lat?: number;
  lng?: number;
  recordedAt?: string;
  createdAt?: string;
}

/**
 * One frame the recogniser has read, as models/CameraSighting.js stores it.
 *
 * The field names are the server's, not friendlier aliases: an earlier version
 * of this file guessed at `plate`/`capturedAt`/`camera.name`, none of which the
 * API returns, so every row rendered blank.
 */
export interface CameraSighting {
  _id: string;
  imageUrl: string;
  recognizedPlateText: string;
  /** Character-reading confidence, 0-1. */
  confidence: number;
  /** Whether stage 1 localized a plate, distinct from reading its characters. */
  plateDetected: boolean;
  plateDetectionConfidence: number;
  matchedVehicle: Vehicle | null;
  matchedStolen: boolean;
  /** Free-text camera label, e.g. "manual-upload" or a live tile's name. */
  cameraId: string;
  location?: { lat: number | null; lng: number | null };
  createdAt: string;
}

/** A camera registered in models/Camera.js and auto-polled by the backend. */
export interface Camera {
  _id: string;
  label: string;
  sourceType: "device" | "remote";
  streamUrl: string;
  location: { lat: number | null; lng: number | null };
  active: boolean;
  tiledScan: boolean;
  pollIntervalSec: number;
  lastPolledAt: string | null;
  lastStatus: "never" | "ok" | "error";
  lastError: string;
}

/** One plate located in a single frame by /cctv/detect-preview. */
export interface DetectedPlate {
  box: { x: number; y: number; width: number; height: number; confidence: number } | null;
  text: string;
  textConfidence: number;
  /** JPEG data URI of the plate alone, enlarged server-side for legibility. */
  cropImage: string | null;
}

export interface UserRecord {
  _id: string;
  firstname?: string;
  lastname?: string;
  email: string;
  role: string;
  phone?: string;
  /** Specific locality, e.g. "Bharatpur". Display and filtering only. */
  area?: string;
  /** Broader grouping above area, e.g. "Chitwan". What region scoping matches on. */
  region?: string;
  permissions?: string[];
  createdAt?: string;
}

/**
 * Formats a **paisa** amount for display, as the web app does with
 * `Rs {(s.basePrice / 100).toFixed(2)}`.
 *
 * Every monetary field the API returns — wallet balance, transaction amount,
 * basePrice, withdrawal amount — is stored in paisa (see models/Wallet.js and
 * models/Workshop.js). Passing rupees to this would show an amount 100 times
 * too small, so the unit is named in the parameter to make a mistake visible
 * at the call site.
 *
 * Note the asymmetry, which is the backend's convention and not something to
 * "fix" here: amounts are *returned* in paisa but *accepted* in rupees, as
 * `amountNpr` — see toRupees below.
 */
export const formatMoney = (paisa?: number): string => {
  const rupees = Number(paisa ?? 0) / 100;
  return `Rs ${rupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/** Paisa to rupees, for prefilling an input the API expects in rupees. */
export const toRupees = (paisa?: number): number => Number(paisa ?? 0) / 100;

/** Short absolute date — relative times are not worth the dependency here. */
export const formatDate = (iso?: string): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

export const formatDateTime = (iso?: string): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDate(iso)}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
};

/** A vehicle's display name, tolerating records missing make or model. */
export const vehicleLabel = (v?: Vehicle | string | null): string => {
  if (!v) return "Vehicle";
  if (typeof v === "string") return "Vehicle";
  const name = [v.make, v.model].filter(Boolean).join(" ");
  return name || v.numberPlate || "Vehicle";
};

/**
 * Case-insensitive match across the fields a person would actually search a
 * user by. A direct port of matchesSearch in the web dashboard.tsx, kept
 * field-for-field so a name that finds someone on the desk finds the same
 * person on a phone.
 *
 * The joined "firstname lastname" entry is what lets a full name match: the
 * individual fields alone would fail on "ram bahadur" because neither field
 * contains the space.
 */
export const matchesUserSearch = (
  u: {
    firstname?: string;
    lastname?: string;
    email?: string;
    role?: string;
    area?: string;
    region?: string;
    phone?: string;
  },
  query: string
): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    u.firstname,
    u.lastname,
    `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim(),
    u.email,
    u.role,
    u.area,
    u.region,
    // Not in the web version: on a phone, a staff member's number is often
    // the fastest thing to hand when you are trying to find them.
    u.phone,
  ]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(q));
};
