// Frontend mirror of backend_api/constants/bookingWorkflow.js.
//
// The two must agree; the backend is the authority (it rejects any transition
// this file would wrongly allow), so this exists to decide what to *show*, not
// what is permitted.

export const BOOKING_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  DELIVERY_REQUESTED: "delivery-requested",
  DELIVERY_ASSIGNED: "delivery-assigned",
  OUT_FOR_DELIVERY: "out-for-delivery",
  PICKED_UP: "picked-up",
  DROPPED: "dropped",
  SERVICING_STARTED: "servicing-started",
  ESTIMATION_PENDING: "estimation-pending",
  ESTIMATION_CONFIRMED: "estimation-confirmed",
  PAYMENT_PENDING: "payment-pending",
  PAYMENT_COMPLETED: "payment-completed",
  COMPLETED: "completed",
  RETURN_ASSIGNED: "return-assigned",
  RETURN_REASSIGNED: "delivery-reassigned",
  RETURN_PICKED_FROM_WORKSHOP: "return-picked-from-workshop",
  DELIVERED: "delivered",
  FINISHED: "finished",
  CANCELLED: "cancelled",
} as const;

export type BookingStatus = (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS];

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  [BOOKING_STATUS.PENDING]: "Pending",
  [BOOKING_STATUS.ACCEPTED]: "Accepted",
  [BOOKING_STATUS.DELIVERY_REQUESTED]: "Delivery requested",
  [BOOKING_STATUS.DELIVERY_ASSIGNED]: "Delivery assigned",
  [BOOKING_STATUS.OUT_FOR_DELIVERY]: "Out for delivery",
  [BOOKING_STATUS.PICKED_UP]: "Picked up",
  [BOOKING_STATUS.DROPPED]: "Dropped at workshop",
  [BOOKING_STATUS.SERVICING_STARTED]: "Servicing started",
  [BOOKING_STATUS.ESTIMATION_PENDING]: "Estimation pending",
  [BOOKING_STATUS.ESTIMATION_CONFIRMED]: "Estimation confirmed",
  [BOOKING_STATUS.PAYMENT_PENDING]: "Payment pending",
  [BOOKING_STATUS.PAYMENT_COMPLETED]: "Paid",
  [BOOKING_STATUS.COMPLETED]: "Completed",
  [BOOKING_STATUS.RETURN_ASSIGNED]: "Delivery assigned",
  [BOOKING_STATUS.RETURN_REASSIGNED]: "Delivery reassigned",
  [BOOKING_STATUS.RETURN_PICKED_FROM_WORKSHOP]: "Picked from workshop",
  [BOOKING_STATUS.DELIVERED]: "Delivered",
  [BOOKING_STATUS.FINISHED]: "Finished",
  [BOOKING_STATUS.CANCELLED]: "Cancelled",
};

// The customer shouldn't be told the job is "Paid" and think it's over while
// the workshop still has their vehicle — from their side it's simply still
// running until someone signs it off.
const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  ...BOOKING_STATUS_LABELS,
  [BOOKING_STATUS.PAYMENT_COMPLETED]: "Ongoing",
};

// Staff-facing wording (admin, superadmin, workshop-admin).
export const statusLabel = (status: string): string =>
  BOOKING_STATUS_LABELS[status] ?? status;

// Customer-facing wording.
export const customerStatusLabel = (status: string): string =>
  CUSTOMER_STATUS_LABELS[status] ?? status;

// Ordered steps for the customer's progress strip. Which list applies depends
// on whether delivery was chosen at booking time — the choice that splits the
// whole workflow in two.
export const DELIVERY_PATH_STEPS: string[] = [
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.ACCEPTED,
  BOOKING_STATUS.DELIVERY_REQUESTED,
  BOOKING_STATUS.DELIVERY_ASSIGNED,
  BOOKING_STATUS.OUT_FOR_DELIVERY,
  BOOKING_STATUS.PICKED_UP,
  BOOKING_STATUS.DROPPED,
  BOOKING_STATUS.SERVICING_STARTED,
  BOOKING_STATUS.ESTIMATION_PENDING,
  BOOKING_STATUS.ESTIMATION_CONFIRMED,
  BOOKING_STATUS.PAYMENT_PENDING,
  BOOKING_STATUS.PAYMENT_COMPLETED,
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.RETURN_ASSIGNED,
  BOOKING_STATUS.RETURN_REASSIGNED,
  BOOKING_STATUS.RETURN_PICKED_FROM_WORKSHOP,
  BOOKING_STATUS.DELIVERED,
  BOOKING_STATUS.FINISHED,
];

export const SELF_DROPOFF_STEPS: string[] = [
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.ACCEPTED,
  BOOKING_STATUS.SERVICING_STARTED,
  BOOKING_STATUS.ESTIMATION_PENDING,
  BOOKING_STATUS.ESTIMATION_CONFIRMED,
  BOOKING_STATUS.PAYMENT_PENDING,
  BOOKING_STATUS.PAYMENT_COMPLETED,
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.FINISHED,
];

export const stepsFor = (deliveryRequested: boolean): string[] =>
  deliveryRequested ? DELIVERY_PATH_STEPS : SELF_DROPOFF_STEPS;

// Statuses where the vehicle is physically in transit, so a live map is worth
// showing.
export const IN_TRANSIT_STATUSES: string[] = [
  BOOKING_STATUS.OUT_FOR_DELIVERY,
  BOOKING_STATUS.PICKED_UP,
  BOOKING_STATUS.RETURN_PICKED_FROM_WORKSHOP,
];

// Delivery-leg wording, shared by the customer's tracking panel, the delivery
// admin's board and the driver's dashboard so all three describe a job
// identically. Leg-dependent because the same delivery status means different
// things on each: "at_workshop" ends the pickup leg (dropped off for service),
// "delivered" ends the return leg (back with the customer).
const PICKUP_LEG_LABELS: Record<string, string> = {
  unassigned: "Awaiting assignment",
  assigned: "Assigned",
  en_route_to_pickup: "Out for delivery",
  picked_up: "Picked up",
  en_route_to_workshop: "Carrying to workshop",
  at_workshop: "Dropped at workshop",
  cancelled: "Cancelled",
};
const RETURN_LEG_LABELS: Record<string, string> = {
  unassigned: "Awaiting assignment",
  assigned: "Delivery assigned",
  en_route_to_dropoff: "Picked from workshop",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const legStatusLabel = (leg: "pickup" | "return", status: string): string =>
  (leg === "pickup" ? PICKUP_LEG_LABELS : RETURN_LEG_LABELS)[status] ?? status;

export const isCancelled = (status: string) => status === BOOKING_STATUS.CANCELLED;
export const isFinished = (status: string) =>
  status === BOOKING_STATUS.FINISHED || status === BOOKING_STATUS.CANCELLED;

// Tracking is only meaningful while a delivery leg is actually live: from the
// moment a staff member is assigned until the vehicle changes hands. It
// disappears once the pickup leg drops the vehicle at the workshop (nothing
// left to follow while it's being serviced) and comes back for the return leg
// once that's assigned.
const TRACKABLE_STATUSES: string[] = [
  // Pickup leg — assigned, driving, carrying.
  BOOKING_STATUS.DELIVERY_ASSIGNED,
  BOOKING_STATUS.OUT_FOR_DELIVERY,
  BOOKING_STATUS.PICKED_UP,
  // Return leg — assigned, then carrying the vehicle home.
  BOOKING_STATUS.RETURN_ASSIGNED,
  BOOKING_STATUS.RETURN_REASSIGNED,
  BOOKING_STATUS.RETURN_PICKED_FROM_WORKSHOP,
];

export const canTrackDelivery = (booking: { deliveryRequested?: boolean; status: string }) =>
  booking.deliveryRequested === true && TRACKABLE_STATUSES.includes(booking.status);

// The parts estimate only exists once the workshop has the vehicle open and
// has started work — before that there is nothing to quote on. Stays available
// through the rest of the job so past rounds remain readable, but closes once
// the bill is settled.
const ESTIMATE_VISIBLE_STATUSES: string[] = [
  BOOKING_STATUS.SERVICING_STARTED,
  BOOKING_STATUS.ESTIMATION_PENDING,
  BOOKING_STATUS.ESTIMATION_CONFIRMED,
  BOOKING_STATUS.PAYMENT_PENDING,
  BOOKING_STATUS.PAYMENT_COMPLETED,
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.RETURN_ASSIGNED,
  BOOKING_STATUS.RETURN_REASSIGNED,
  BOOKING_STATUS.RETURN_PICKED_FROM_WORKSHOP,
  BOOKING_STATUS.DELIVERED,
  BOOKING_STATUS.FINISHED,
];

export const canSeePartsEstimate = (booking: { status: string }) =>
  ESTIMATE_VISIBLE_STATUSES.includes(booking.status);
