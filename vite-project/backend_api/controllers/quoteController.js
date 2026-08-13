import PartsQuote from "../models/PartsQuote.js";
import ServiceRequest from "../models/ServiceRequest.js";
import Workshop from "../models/Workshop.js";
import { uploadMedia } from "../services/cloudinaryService.js";
import { notify } from "../services/notificationService.js";
import { checkOverpricing } from "../services/pricingService.js";
import { getIO } from "../config/socket.js";
import { moveBookingTo } from "../services/bookingStatusService.js";
import { BOOKING_STATUS, canTransition } from "../constants/bookingWorkflow.js";

const rupees = (paisa) => `Rs ${(paisa / 100).toFixed(2)}`;

// A quote may only move while the job can still change price.
//
// Once a booking is paid, confirming a further round would rewrite its
// finalPrice above what the customer already settled, and nothing in the
// system would ever collect the difference — the bill would silently disagree
// with the money received. A cancelled job has nothing to quote for at all.
const quotingClosedReason = (booking) => {
  if (booking.paymentStatus === "paid") {
    return "This booking is already paid — reopening the estimate would change a settled bill";
  }
  if (booking.paymentStatus === "refunded") {
    return "This booking was refunded — its estimate is closed";
  }
  if (booking.status === "cancelled") {
    return "This booking was cancelled";
  }
  return null;
};

const selectedTotal = (items) =>
  items.filter((i) => i.selected).reduce((sum, i) => sum + Number(i.price ?? 0), 0);

// Only the garage holding the job may quote on it.
const managesWorkshop = async (user, workshopId) => {
  if (user.role === "superadmin") return true;
  const workshop = await Workshop.findById(workshopId).select("managedBy");
  return Boolean(workshop?.managedBy?.equals(user._id));
};

// These endpoints are multipart (they carry an optional voice file), so array
// fields arrive as JSON strings rather than as arrays. Accept either.
const parseArrayField = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// Sanitises the incoming lines: prices are stored in paisa as integers like
// every other price in the system, and a line with no name or a negative price
// is dropped rather than persisted.
const cleanItems = (raw) =>
  parseArrayField(raw)
    .map((i) => ({
      part: String(i.part ?? "").trim(),
      price: Math.max(0, Math.round(Number(i.price) || 0)),
      selected: i.selected !== false,
    }))
    .filter((i) => i.part);

export const getQuote = async (req, res) => {
  try {
    // Authorise before revealing anything — returning "no quote here" to a
    // stranger still confirms the booking exists.
    const request = await ServiceRequest.findById(req.params.bookingId)
      .select("user workshop status paymentStatus");
    if (!request) return res.status(404).json({ success: false, message: "Booking not found" });

    const isCustomer = request.user.equals(req.user._id);
    if (!isCustomer && !(await managesWorkshop(req.user, request.workshop))) {
      return res.status(403).json({ success: false, message: "Not your booking" });
    }

    // Sent even when there is no quote, so the panel can explain why it isn't
    // offering an editor rather than rendering an empty shell.
    const closedReason = quotingClosedReason(request);

    const quote = await PartsQuote.findOne({ serviceRequest: req.params.bookingId })
      .populate("workshop", "name logoUrl")
      .populate("customer", "firstname lastname");
    if (!quote) return res.json({ success: true, quote: null, closedReason });

    res.json({
      success: true,
      quote,
      closedReason,
      // Both figures the customer chooses between: what they've ticked, and
      // the workshop's full list.
      total: quote.currentTotal(),
      fullTotal: quote.fullTotal(),
      agreedTotal: quote.agreedTotal,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Workshop proposes a list of parts. Creates the quote on first send and
// appends a revision on every send after that, so "we found another problem
// once it was open" is a normal revision rather than a fresh negotiation.
export const sendWorkshopRevision = async (req, res) => {
  try {
    const request = await ServiceRequest.findById(req.params.bookingId).populate("workshop", "name managedBy");
    if (!request) return res.status(404).json({ success: false, message: "Booking not found" });
    if (!(await managesWorkshop(req.user, request.workshop._id))) {
      return res.status(403).json({ success: false, message: "You don't manage this workshop" });
    }

    const closed = quotingClosedReason(request);
    if (closed) return res.status(409).json({ success: false, message: closed });

    const items = cleanItems(req.body.items);
    if (items.length === 0) {
      return res.status(400).json({ success: false, message: "Add at least one part" });
    }

    const voiceUrl = req.file ? await uploadMedia(req.file.buffer, "quote-voice-notes") : "";

    let quote = await PartsQuote.findOne({ serviceRequest: request._id });
    if (!quote) {
      quote = new PartsQuote({
        serviceRequest: request._id,
        workshop: request.workshop._id,
        customer: request.user,
      });
    }
    // A settled round isn't reopened — extra work found once the bike is open
    // starts a fresh round that stacks on top of what's already agreed.
    const startsNewRound = quote.status === "accepted";
    if (startsNewRound) {
      quote.currentRound += 1;
      quote.status = "awaiting-customer";
      quote.acceptedAt = null;
    }

    quote.revisions.push({
      items,
      authorRole: "workshop",
      action: "estimate",
      round: quote.currentRound,
      author: req.user._id,
      note: req.body.note ?? "",
      voiceUrl,
    });
    quote.pendingAcceptance = { total: null, mode: null, at: null };
    quote.status = "awaiting-customer";
    await quote.save();

    // Step 8: sending an estimate puts the booking in estimation-pending —
    // either the first time (from servicing-started) or on a later round when
    // extra work turns up mid-job (from estimation-confirmed, step 9).
    if (canTransition(request, BOOKING_STATUS.ESTIMATION_PENDING)) {
      await moveBookingTo(request, BOOKING_STATUS.ESTIMATION_PENDING);
    }

    await notify({
      user: request.user,
      type: "quote:received",
      title: `${request.workshop.name} sent a parts estimate`,
      body: `${items.length} part${items.length === 1 ? "" : "s"} · ${rupees(selectedTotal(items))}`,
      link: `/bookings?quote=${request._id}`,
      meta: { serviceRequestId: String(request._id) },
    });

    res.status(201).json({ success: true, quote, total: quote.currentTotal() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// The customer's move. Three distinct things they might mean, kept separate
// because conflating them is how a question gets mistaken for agreement:
//
//   accept-selection    - "do these ones, at this price"
//   accept-as-estimated - "do the whole list as you quoted it"
//   enquiry             - "before I decide, explain something"
//
// Only the first two commit to a figure, and even then the workshop confirms
// before it becomes the price. Prices always come from the workshop's own
// revision — the customer controls which lines are kept, never their cost.
export const sendCustomerResponse = async (req, res) => {
  try {
    const action = req.body.action ?? "enquiry";
    if (!["accept-selection", "accept-as-estimated", "enquiry"].includes(action)) {
      return res.status(400).json({ success: false, message: "Unknown action" });
    }

    const quote = await PartsQuote.findOne({ serviceRequest: req.params.bookingId }).populate("workshop", "name managedBy");
    if (!quote) return res.status(404).json({ success: false, message: "No quote for this booking" });
    if (!quote.customer.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: "Not your booking" });
    }

    const request = await ServiceRequest.findById(req.params.bookingId).select("status paymentStatus");
    const closed = quotingClosedReason(request);
    if (closed) return res.status(409).json({ success: false, message: closed });

    if (quote.status === "accepted") {
      return res.status(409).json({ success: false, message: "This round is settled — the workshop must add a new estimate first" });
    }

    const previous = quote.latestRevision();
    if (!previous) {
      return res.status(400).json({ success: false, message: "The workshop hasn't sent an estimate yet" });
    }

    // "as estimated" means every line the workshop listed; otherwise honour the
    // customer's ticks. An enquiry leaves the selection exactly as it was.
    const wanted = new Set(parseArrayField(req.body.selectedParts).map(String));
    const items = previous.items.map((i) => ({
      part: i.part,
      price: i.price,
      selected:
        action === "accept-as-estimated" ? true
          : action === "enquiry" ? i.selected
            : wanted.has(i.part),
    }));

    const voiceUrl = req.file ? await uploadMedia(req.file.buffer, "quote-voice-notes") : "";

    quote.revisions.push({
      items,
      authorRole: "customer",
      action,
      round: quote.currentRound,
      author: req.user._id,
      note: req.body.note ?? "",
      voiceUrl,
    });

    if (action === "enquiry") {
      // Asking again withdraws any earlier acceptance — you can't be waiting
      // on an answer and committed to a price at the same time.
      quote.pendingAcceptance = { total: null, mode: null, at: null };
    } else {
      quote.pendingAcceptance = {
        total: selectedTotal(items),
        mode: action === "accept-as-estimated" ? "as-estimated" : "selection",
        at: new Date(),
      };
    }
    quote.status = "awaiting-workshop";
    await quote.save();

    if (quote.workshop.managedBy) {
      await notify({
        user: quote.workshop.managedBy,
        type: "quote:responded",
        title: action === "enquiry"
          ? "Customer asked about the estimate"
          : "Customer accepted — confirm to lock the price",
        body: action === "enquiry"
          ? (req.body.note || "They left a voice note.")
          : `${items.filter((i) => i.selected).length} of ${items.length} parts · ${rupees(selectedTotal(items))}`,
        link: `/admin/bookings?quote=${req.params.bookingId}`,
        meta: { serviceRequestId: String(req.params.bookingId) },
      });
    }

    res.status(201).json({ success: true, quote, total: quote.currentTotal() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// The workshop answering a question without touching the list or the price.
// Keeps the back-and-forth going for as long as either side needs it.
export const sendWorkshopReply = async (req, res) => {
  try {
    const quote = await PartsQuote.findOne({ serviceRequest: req.params.bookingId }).populate("workshop", "name managedBy");
    if (!quote) return res.status(404).json({ success: false, message: "No quote for this booking" });
    if (!(await managesWorkshop(req.user, quote.workshop._id))) {
      return res.status(403).json({ success: false, message: "You don't manage this workshop" });
    }

    const previous = quote.latestRevision();
    const voiceUrl = req.file ? await uploadMedia(req.file.buffer, "quote-voice-notes") : "";

    quote.revisions.push({
      items: previous?.items ?? [],
      authorRole: "workshop",
      action: "reply",
      round: quote.currentRound,
      author: req.user._id,
      note: req.body.note ?? "",
      voiceUrl,
    });
    quote.status = "awaiting-customer";
    await quote.save();

    await notify({
      user: quote.customer,
      type: "quote:received",
      title: `${quote.workshop.name} replied about your estimate`,
      body: req.body.note || "They left a voice note.",
      link: `/bookings?quote=${req.params.bookingId}`,
      meta: { serviceRequestId: String(req.params.bookingId) },
    });

    res.status(201).json({ success: true, quote });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// The workshop confirming what the customer agreed to. This is the only step
// that commits money — the customer's acceptance is an offer, this is the
// handshake. The round's total is added to `agreedTotal` rather than replacing
// it, so a second round of work stacks onto the bill instead of erasing the
// first, and the booking's finalPrice always reflects everything agreed.
export const confirmQuote = async (req, res) => {
  try {
    const quote = await PartsQuote.findOne({ serviceRequest: req.params.bookingId }).populate("workshop", "name managedBy");
    if (!quote) return res.status(404).json({ success: false, message: "No quote for this booking" });
    if (!(await managesWorkshop(req.user, quote.workshop._id))) {
      return res.status(403).json({ success: false, message: "Only the workshop can confirm an estimate" });
    }
    // The step that writes finalPrice, so the strictest guard belongs here.
    // deliveryRequested is needed too: it selects which transition map the
    // booking follows, so omitting it would make every transition look invalid.
    const request = await ServiceRequest.findById(req.params.bookingId)
      .select("status statusChangedAt paymentStatus serviceType deliveryRequested user workshop finalPrice");
    const closed = quotingClosedReason(request);
    if (closed) return res.status(409).json({ success: false, message: closed });

    if (quote.status === "accepted") {
      return res.status(409).json({ success: false, message: "This round is already confirmed" });
    }
    if (quote.pendingAcceptance?.total == null) {
      return res.status(400).json({
        success: false,
        message: "The customer hasn't accepted this round yet",
      });
    }

    const roundTotal = quote.pendingAcceptance.total;
    const previous = quote.latestRevision();

    quote.revisions.push({
      items: previous.items,
      authorRole: "workshop",
      action: "confirm",
      round: quote.currentRound,
      author: req.user._id,
      note: req.body.note ?? "",
    });

    quote.agreedTotal += roundTotal;
    quote.pendingAcceptance = { total: null, mode: null, at: null };
    quote.status = "accepted";
    quote.acceptedAt = new Date();
    await quote.save();

    request.finalPrice = quote.agreedTotal;
    await request.save();

    // Step 8 complete: both sides have agreed this round's figure. From here
    // the workshop either asks for payment (step 9) or opens another round.
    if (canTransition(request, BOOKING_STATUS.ESTIMATION_CONFIRMED)) {
      await moveBookingTo(request, BOOKING_STATUS.ESTIMATION_CONFIRMED);
    }

    // Now that there's an actual agreed figure, check it against history for
    // this serviceType — the fraud-sanity check that used to run against a
    // manually-typed quotedPrice at accept-time now runs here instead, since
    // this is the first point a real price exists.
    const { isOverpriced, overpriceRatio } = await checkOverpricing(request.serviceType, quote.agreedTotal);
    await ServiceRequest.findByIdAndUpdate(quote.serviceRequest, { isOverpriced, overpriceRatio });
    if (isOverpriced) {
      getIO().to("admins").emit("booking:overpriced", { bookingId: quote.serviceRequest, agreedTotal: quote.agreedTotal });
    }

    await notify({
      user: quote.customer,
      type: "quote:accepted",
      title: "Estimate confirmed",
      body: `Round agreed at ${rupees(roundTotal)} · job total ${rupees(quote.agreedTotal)}`,
      link: `/bookings?quote=${quote.serviceRequest}`,
      meta: { serviceRequestId: String(quote.serviceRequest) },
    });

    res.json({ success: true, quote, total: quote.agreedTotal });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
