import ServiceRequest from "../models/ServiceRequest.js";
import { haversineDistanceKm } from "../utils/geo.js";

// A quote is flagged once it exceeds the running average for that service
// type by more than this ratio. Real statistical rule, not machine learning.
const OVERPRICE_THRESHOLD = 1.25;

// Compares a booking's agreed total against the average of previously-agreed
// totals for the same serviceType. Returns null average when there's no
// history yet (nothing to compare against, so nothing can be flagged). Runs
// against finalPrice (set once a parts-quote round is confirmed) rather than
// a manually-typed quotedPrice, which no longer exists at accept-time.
export const checkOverpricing = async (serviceType, finalPrice) => {
  const [result] = await ServiceRequest.aggregate([
    { $match: { serviceType, finalPrice: { $ne: null } } },
    { $group: { _id: "$serviceType", avg: { $avg: "$finalPrice" } } },
  ]);

  const average = result?.avg ?? null;
  if (average === null) {
    return { isOverpriced: false, overpriceRatio: null, average: null };
  }

  const overpriceRatio = finalPrice / average;
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

// A workshop with one glowing review shouldn't outrank one with fifty good
// ones, so both quality signals are pulled toward the neutral prior until
// enough reviews accumulate. This is a Bayesian (smoothed) average: with zero
// reviews it returns the prior exactly, and the prior's pull fades as the
// count grows past CONFIDENCE_WEIGHT.
const CONFIDENCE_WEIGHT = 5;

const smoothed = (value, count, prior) =>
  (prior * CONFIDENCE_WEIGHT + value * count) / (CONFIDENCE_WEIGHT + count);

// Sort modes behind the workshop list's dropdown. Filtering already happened
// in the query; this only orders what survived.
//   best      - the existing weighted blend, now including sentiment
//   rating    - stars, smoothed by review count
//   sentiment - classifier score, smoothed by how many reviews it scored
//   distance  - nearest first (falls back to `best` with no user location)
export const sortWorkshops = (workshops, sortBy = "best", hasOrigin = false) => {
  const list = [...workshops];

  if (sortBy === "distance" && hasOrigin) {
    return list.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }

  if (sortBy === "rating") {
    // 3 of 5 stars is the neutral prior — an unrated workshop sits mid-pack
    // rather than at either extreme.
    return list.sort(
      (a, b) =>
        smoothed(b.rating?.average ?? 0, b.rating?.count ?? 0, 3) -
        smoothed(a.rating?.average ?? 0, a.rating?.count ?? 0, 3)
    );
  }

  if (sortBy === "sentiment") {
    // Sentiment runs -1..+1, so the neutral prior is 0.
    return list.sort(
      (a, b) =>
        smoothed(b.sentiment?.score ?? 0, b.sentiment?.scoredCount ?? 0, 0) -
        smoothed(a.sentiment?.score ?? 0, a.sentiment?.scoredCount ?? 0, 0)
    );
  }

  // "best": everything that's available, normalized to 0-1 and blended. Each
  // term is skipped when its data is missing, so this degrades to whatever
  // signals exist rather than ranking everything equally at zero.
  const maxDistance = Math.max(...list.map((w) => w.distanceKm ?? 0), 1);
  return list
    .map((w) => {
      const ratingPart = smoothed(w.rating?.average ?? 0, w.rating?.count ?? 0, 3) / 5;
      const sentimentPart = (smoothed(w.sentiment?.score ?? 0, w.sentiment?.scoredCount ?? 0, 0) + 1) / 2;
      const distancePart = hasOrigin ? 1 - (w.distanceKm ?? maxDistance) / maxDistance : null;

      const terms = distancePart === null
        ? [[ratingPart, 0.5], [sentimentPart, 0.5]]
        : [[ratingPart, 0.35], [sentimentPart, 0.35], [distancePart, 0.3]];

      const overall = terms.reduce((sum, [value, weight]) => sum + value * weight, 0);
      return { ...w, overallScore: Number(overall.toFixed(4)) };
    })
    .sort((a, b) => b.overallScore - a.overallScore);
};
