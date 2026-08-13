// The booking lifecycle, as one state machine.
//
// A booking takes one of two paths, decided once at creation by
// `deliveryRequested` and never re-decided:
//
//   WITH delivery:
//     pending -> accepted -> delivery-requested -> delivery-assigned
//       -> out-for-delivery -> picked-up -> dropped -> servicing-started
//       -> estimation-pending -> estimation-confirmed -> payment-pending
//       -> payment-completed -> completed -> return-assigned
//       -> return-picked-from-workshop -> delivered -> finished
//
//   WITHOUT delivery:
//     pending -> accepted -> servicing-started -> estimation-pending
//       -> estimation-confirmed -> payment-pending -> payment-completed
//       -> completed -> finished
//
// "completed" is the workshop signing the work off by hand; "finished" is the
// booking closing itself a minute later. Splitting them is what lets a
// delivery booking's return leg exist between the two.
//
// Everything is expressed as explicit adjacency below rather than scattered
// `if (status === ...)` checks, because the old code let a workshop mark a
// booking in_progress/completed while the vehicle was still in a van — the
// booking status and the delivery legs were never joined at all.

const BOOKING_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",

  // Pickup leg (only reachable when deliveryRequested)
  DELIVERY_REQUESTED: "delivery-requested",
  DELIVERY_ASSIGNED: "delivery-assigned",
  OUT_FOR_DELIVERY: "out-for-delivery",
  PICKED_UP: "picked-up",
  DROPPED: "dropped",

  // Workshop work
  SERVICING_STARTED: "servicing-started",
  ESTIMATION_PENDING: "estimation-pending",
  ESTIMATION_CONFIRMED: "estimation-confirmed",
  PAYMENT_PENDING: "payment-pending",
  PAYMENT_COMPLETED: "payment-completed",

  // Service work is signed off by the workshop. For a delivery booking this is
  // also what releases the vehicle for its return leg.
  COMPLETED: "completed",

  // Return leg (only reachable when deliveryRequested)
  RETURN_ASSIGNED: "return-assigned",
  // Set when an admin swaps the return leg onto a different driver. A distinct
  // status rather than a silent edit so the customer and workshop can see the
  // handover happened.
  RETURN_REASSIGNED: "delivery-reassigned",
  RETURN_PICKED_FROM_WORKSHOP: "return-picked-from-workshop",
  DELIVERED: "delivered",

  // Terminal. Set automatically a minute after the last human step.
  FINISHED: "finished",
  CANCELLED: "cancelled",
};

const BOOKING_STATUSES = Object.values(BOOKING_STATUS);

// Allowed next states per current state. Split by path where the two diverge:
// after `accepted` a delivery booking must go through the pickup leg, while a
// self-drop-off booking goes straight to servicing — so neither can borrow the
// other's shortcut.
const DELIVERY_PATH_TRANSITIONS = {
  [BOOKING_STATUS.PENDING]: [BOOKING_STATUS.ACCEPTED],
  [BOOKING_STATUS.ACCEPTED]: [BOOKING_STATUS.DELIVERY_REQUESTED],
  [BOOKING_STATUS.DELIVERY_REQUESTED]: [BOOKING_STATUS.DELIVERY_ASSIGNED],
  [BOOKING_STATUS.DELIVERY_ASSIGNED]: [BOOKING_STATUS.OUT_FOR_DELIVERY],
  [BOOKING_STATUS.OUT_FOR_DELIVERY]: [BOOKING_STATUS.PICKED_UP],
  [BOOKING_STATUS.PICKED_UP]: [BOOKING_STATUS.DROPPED],
  [BOOKING_STATUS.DROPPED]: [BOOKING_STATUS.SERVICING_STARTED],
  [BOOKING_STATUS.SERVICING_STARTED]: [BOOKING_STATUS.ESTIMATION_PENDING],
  // Step 9: a workshop may loop back for another estimate round when extra
  // parts turn up mid-job, so estimation-confirmed can return to
  // estimation-pending instead of only moving forward.
  [BOOKING_STATUS.ESTIMATION_PENDING]: [BOOKING_STATUS.ESTIMATION_CONFIRMED],
  [BOOKING_STATUS.ESTIMATION_CONFIRMED]: [
    BOOKING_STATUS.PAYMENT_PENDING,
    BOOKING_STATUS.ESTIMATION_PENDING,
  ],
  [BOOKING_STATUS.PAYMENT_PENDING]: [BOOKING_STATUS.PAYMENT_COMPLETED],
  // The workshop signs the job off by hand — that's what frees the vehicle to
  // go back, so the return leg can't be assigned before it.
  [BOOKING_STATUS.PAYMENT_COMPLETED]: [BOOKING_STATUS.COMPLETED],
  [BOOKING_STATUS.COMPLETED]: [BOOKING_STATUS.RETURN_ASSIGNED],
  // Reassignment is a single optional detour: the leg can be handed back to
  // its driver once, then only moves forward. reassignDelivery enforces the
  // "once" part; there is deliberately no self-loop here.
  [BOOKING_STATUS.RETURN_ASSIGNED]: [
    BOOKING_STATUS.RETURN_REASSIGNED,
    BOOKING_STATUS.RETURN_PICKED_FROM_WORKSHOP,
  ],
  [BOOKING_STATUS.RETURN_REASSIGNED]: [BOOKING_STATUS.RETURN_PICKED_FROM_WORKSHOP],
  [BOOKING_STATUS.RETURN_PICKED_FROM_WORKSHOP]: [BOOKING_STATUS.DELIVERED],
  [BOOKING_STATUS.DELIVERED]: [BOOKING_STATUS.FINISHED],
  [BOOKING_STATUS.FINISHED]: [],
  [BOOKING_STATUS.CANCELLED]: [],
};

const SELF_DROPOFF_TRANSITIONS = {
  [BOOKING_STATUS.PENDING]: [BOOKING_STATUS.ACCEPTED],
  [BOOKING_STATUS.ACCEPTED]: [BOOKING_STATUS.SERVICING_STARTED],
  [BOOKING_STATUS.SERVICING_STARTED]: [BOOKING_STATUS.ESTIMATION_PENDING],
  [BOOKING_STATUS.ESTIMATION_PENDING]: [BOOKING_STATUS.ESTIMATION_CONFIRMED],
  [BOOKING_STATUS.ESTIMATION_CONFIRMED]: [
    BOOKING_STATUS.PAYMENT_PENDING,
    BOOKING_STATUS.ESTIMATION_PENDING,
  ],
  [BOOKING_STATUS.PAYMENT_PENDING]: [BOOKING_STATUS.PAYMENT_COMPLETED],
  // No delivery legs at all — the workshop signs off and the sweep closes it.
  [BOOKING_STATUS.PAYMENT_COMPLETED]: [BOOKING_STATUS.COMPLETED],
  [BOOKING_STATUS.COMPLETED]: [BOOKING_STATUS.FINISHED],
  [BOOKING_STATUS.FINISHED]: [],
  [BOOKING_STATUS.CANCELLED]: [],
};

// Statuses a booking can still be cancelled from. Once money has changed hands
// the booking is settled, so cancelling would need a refund flow that doesn't
// exist yet — better to refuse than to silently strand a payment.
const CANCELLABLE_STATUSES = [
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.ACCEPTED,
  BOOKING_STATUS.DELIVERY_REQUESTED,
  BOOKING_STATUS.DELIVERY_ASSIGNED,
];

// The customer may only cancel before a workshop has committed to the job.
const CUSTOMER_CANCELLABLE_STATUSES = [BOOKING_STATUS.PENDING];

const transitionsFor = (deliveryRequested) =>
  deliveryRequested ? DELIVERY_PATH_TRANSITIONS : SELF_DROPOFF_TRANSITIONS;

const canTransition = (booking, next) =>
  (transitionsFor(booking.deliveryRequested)[booking.status] ?? []).includes(next);

// Throws a tagged error the controllers turn into a 409, so every route gets
// identical enforcement instead of re-implementing the check.
class InvalidTransitionError extends Error {
  constructor(from, to) {
    super(`Cannot move a booking from '${from}' to '${to}'`);
    this.name = "InvalidTransitionError";
    this.status = 409;
  }
}

const assertTransition = (booking, next) => {
  if (!canTransition(booking, next)) {
    throw new InvalidTransitionError(booking.status, next);
  }
};

// Human-readable labels, shared with the frontend copy of this module.
const BOOKING_STATUS_LABELS = {
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
const CUSTOMER_STATUS_LABELS = {
  ...BOOKING_STATUS_LABELS,
  [BOOKING_STATUS.PAYMENT_COMPLETED]: "Ongoing",
};

// How long a booking sits in its terminal pre-finished state before the sweep
// in services/bookingAutoComplete.js closes it.
const AUTO_COMPLETE_AFTER_MS = 60 * 1000;

export {
  BOOKING_STATUS,
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  CUSTOMER_STATUS_LABELS,
  DELIVERY_PATH_TRANSITIONS,
  SELF_DROPOFF_TRANSITIONS,
  CANCELLABLE_STATUSES,
  CUSTOMER_CANCELLABLE_STATUSES,
  AUTO_COMPLETE_AFTER_MS,
  transitionsFor,
  canTransition,
  assertTransition,
  InvalidTransitionError,
};
