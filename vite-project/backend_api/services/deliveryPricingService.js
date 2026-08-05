import { haversineDistanceKm } from "../utils/geo.js";

const RATE_PAISA = 10000; // Rs 100 per block
const BLOCK_KM = 4;

// Rs 100 for any distance up to and including 4km, then +Rs 100 per
// additional started 4km block — 5km costs the same as 8km, this rounds up
// rather than prorating by the metre. One combined round-trip fee (not
// doubled for "there and back") — see ServiceRequest.deliveryFee.
export const deliveryFeeFor = (distanceKm) => {
  const blocks = Math.max(1, Math.ceil(distanceKm / BLOCK_KM));
  return blocks * RATE_PAISA;
};

export const distanceForDelivery = (workshopLocation, customerLocation) =>
  haversineDistanceKm(workshopLocation, customerLocation);
