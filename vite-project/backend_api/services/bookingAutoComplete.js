import ServiceRequest from "../models/ServiceRequest.js";
import { moveBookingTo } from "./bookingStatusService.js";
import { AUTO_COMPLETE_AFTER_MS, BOOKING_STATUS } from "../constants/bookingWorkflow.js";

// The tail of both paths: a booking closes itself a minute after the last
// human step, giving the customer a window to raise a problem first.
//
// A periodic sweep rather than a setTimeout per booking, so a restart can't
// strand a booking in its pre-finished state forever — anything whose window
// elapsed while the process was down is simply picked up on the next tick.
const SWEEP_INTERVAL_MS = 20 * 1000;

// Where each path waits: a delivery booking once the vehicle is back with the
// customer, a self-drop-off booking once the workshop has signed it off.
const AWAITING_COMPLETION = [BOOKING_STATUS.DELIVERED, BOOKING_STATUS.COMPLETED];

export const sweepCompletableBookings = async () => {
  const cutoff = new Date(Date.now() - AUTO_COMPLETE_AFTER_MS);

  const due = await ServiceRequest.find({
    status: { $in: AWAITING_COMPLETION },
    statusChangedAt: { $lte: cutoff },
  });

  let completed = 0;
  for (const booking of due) {
    // A delivery booking sitting in "completed" is waiting for its return leg,
    // not to be closed — canTransition already knows that, so letting the
    // throw skip it keeps this loop honest to the same state machine
    // everything else obeys rather than duplicating the rule here.
    try {
      await moveBookingTo(booking, BOOKING_STATUS.FINISHED);
      completed += 1;
    } catch {
      // Not eligible yet (still mid-delivery); leave it for a later sweep.
    }
  }
  return completed;
};

export const startBookingAutoComplete = () => {
  const tick = async () => {
    try {
      const n = await sweepCompletableBookings();
      if (n > 0) console.log(`Auto-completed ${n} booking(s)`);
    } catch (err) {
      console.error("Booking auto-complete sweep failed:", err.message);
    }
  };

  tick();
  const timer = setInterval(tick, SWEEP_INTERVAL_MS);
  timer.unref?.();
  console.log("Booking auto-complete sweep started");
  return timer;
};
