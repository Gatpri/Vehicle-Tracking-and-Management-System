import { useEffect, useState } from "react";
import api from "../lib/api";

interface Review {
  _id: string;
  rating: number;
  text: string;
  createdAt: string;
  user: { firstname: string; lastname: string } | null;
  sentiment: { label: string; language: string; confidence: number | null };
}
interface WorkshopSummary {
  name: string;
  rating: { average: number; count: number };
  sentiment: { score: number; positiveRatio: number; scoredCount: number };
}

const SENTIMENT_CLASS: Record<string, string> = {
  positive: "wr-sent-positive",
  negative: "wr-sent-negative",
  neutral: "wr-sent-neutral",
  pending: "wr-sent-pending",
  unavailable: "wr-sent-pending",
};

// Reviews for one workshop, from the admin side. Used by a workshop-admin for
// their own garage and by admins for any garage they select — same data, same
// component, so the two can't show different things.
function WorkshopReviewsPanel({ workshopId }: { workshopId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [workshop, setWorkshop] = useState<WorkshopSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get(`/workshops/${workshopId}/reviews`),
      api.get(`/workshops/${workshopId}`),
    ])
      .then(([reviewsRes, workshopRes]) => {
        if (cancelled) return;
        setReviews(reviewsRes.data.reviews);
        setWorkshop(workshopRes.data.workshop);
      })
      .catch(() => {
        if (!cancelled) setReviews([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [workshopId]);

  if (loading) return <p className="adm-empty">Loading reviews...</p>;

  // Counted here rather than on the server: it's a handful of rows already in
  // memory, and the breakdown is only ever shown alongside them.
  const tally = reviews.reduce<Record<string, number>>((acc, r) => {
    const label = r.sentiment?.label ?? "pending";
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});
  const analysed = (tally.positive ?? 0) + (tally.neutral ?? 0) + (tally.negative ?? 0);

  return (
    <div className="wr-panel">
      <div className="adm-float">
        <div className="adm-float-stat">
          <span className="adm-float-value">
            {workshop?.rating.count ? workshop.rating.average.toFixed(1) : "—"} ★
          </span>
          <span className="adm-float-label">
            {workshop?.rating.count ?? 0} review{workshop?.rating.count === 1 ? "" : "s"}
          </span>
        </div>
        <div className="adm-float-stat">
          <span className="adm-float-value">{tally.positive ?? 0}</span>
          <span className="adm-float-label">Good</span>
        </div>
        <div className="adm-float-stat">
          <span className="adm-float-value">{tally.neutral ?? 0}</span>
          <span className="adm-float-label">Neutral</span>
        </div>
        <div className="adm-float-stat">
          <span className="adm-float-value">{tally.negative ?? 0}</span>
          <span className="adm-float-label">Bad</span>
        </div>
      </div>

      {/* Says plainly when nothing has been classified, rather than implying
          every review is neutral. */}
      {reviews.length > 0 && analysed === 0 && (
        <p className="wr-note">
          None of these have been analysed yet — the sentiment classifier isn't running, so every review
          shows as <strong>pending</strong>. Star ratings are unaffected.
        </p>
      )}

      {reviews.length === 0 ? (
        <p className="adm-empty">No reviews yet.</p>
      ) : (
        <table className="dash-table">
          <thead><tr><th>Customer</th><th>Rating</th><th>What they wrote</th><th>Analysis</th><th>When</th></tr></thead>
          <tbody>
            {reviews.map((r) => (
              <tr key={r._id}>
                <td>{r.user ? `${r.user.firstname} ${r.user.lastname}` : "Customer"}</td>
                <td className="wr-stars">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</td>
                <td>{r.text || <span className="adm-sub">(no written feedback)</span>}</td>
                <td>
                  <span className={`wr-sent ${SENTIMENT_CLASS[r.sentiment?.label] ?? "wr-sent-pending"}`}>
                    {r.sentiment?.label === "positive" ? "Good"
                      : r.sentiment?.label === "negative" ? "Bad"
                        : r.sentiment?.label === "neutral" ? "Neutral"
                          : "pending"}
                  </span>
                  {r.sentiment?.language && <div className="adm-sub">{r.sentiment.language}</div>}
                </td>
                <td>{new Date(r.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default WorkshopReviewsPanel;
