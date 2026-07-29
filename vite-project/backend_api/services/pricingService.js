import ServiceRequest from "../models/ServiceRequest.js";
import { haversineDistanceKm } from "../utils/geo.js";

// A quote is flagged once it exceeds the running average for that service
// type by more than this ratio. Real statistical rule, not machine learning.
const OVERPRICE_THRESHOLD = 1.25;

// Compares a proposed quote against the average of previously-accepted
// quotes for the same serviceType. Returns null average when there's no
// history yet (nothing to compare against, so nothing can be flagged).
export const checkOverpricing = async (serviceType, quotedPrice) => {
  const [result] = await ServiceRequest.aggregate([
    { $match: { serviceType, quotedPrice: { $ne: null } } },
    { $group: { _id: "$serviceType", avg: { $avg: "$quotedPrice" } } },
  ]);

  const average = result?.avg ?? null;
  if (average === null) {
    return { isOverpriced: false, overpriceRatio: null, average: null };
  }

  const overpriceRatio = quotedPrice / average;
  return {
    isOverpriced: overpriceRatio > OVERPRICE_THRESHOLD,
    overpriceRatio,
    average,
  };
};

// Weighted ranking for workshop recommendations: lower score = better match.
// Distance, (inverse) rating, and price are each normalized to 0-1 across
// the candidate set before weighting, so no single factor dominates just
// because of its raw units (km vs. NPR vs. a 0-5 star scale).
const WEIGHTS = { distance: 0.5, rating: 0.3, price: 0.2 };

export const rankWorkshops = (workshops, requesterLocation, serviceType) => {
  const candidates = workshops
    .map((w) => {
      const offering = w.servicesOffered.find((s) => s.serviceType === serviceType);
      if (!offering) return null;
      const distanceKm = haversineDistanceKm(requesterLocation, w.location);
      return { workshop: w, distanceKm, price: offering.basePrice, rating: w.rating?.average ?? 0 };
    })
    .filter(Boolean);

  if (candidates.length === 0) return [];

  const maxDistance = Math.max(...candidates.map((c) => c.distanceKm)) || 1;
  const maxPrice = Math.max(...candidates.map((c) => c.price)) || 1;

  return candidates
    .map((c) => {
      const normDistance = c.distanceKm / maxDistance;
      const normPrice = c.price / maxPrice;
      const normRatingGap = 1 - c.rating / 5; // lower gap = higher rating = better
      const score =
        WEIGHTS.distance * normDistance +
        WEIGHTS.rating * normRatingGap +
        WEIGHTS.price * normPrice;
      return { ...c, score };
    })
    .sort((a, b) => a.score - b.score);
};
