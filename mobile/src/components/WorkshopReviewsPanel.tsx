import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import api from "../lib/api";
import { Muted } from "./ui";
import { colors, radius, spacing } from "../theme";

export interface Review {
  _id: string;
  rating: number;
  text: string;
  createdAt: string;
  user: { firstname: string; lastname: string } | null;
  sentiment?: { label?: string; language?: string; confidence?: number | null };
}

interface WorkshopSummary {
  name?: string;
  rating?: { average?: number; count?: number };
  sentiment?: { score?: number; positiveRatio?: number; scoredCount?: number };
}

const SENTIMENT_COLOR: Record<string, string> = {
  positive: colors.green500,
  negative: colors.red500,
  neutral: colors.slate400,
};

/** The web panel prints "Good / Bad / Neutral" rather than the raw label. */
const SENTIMENT_WORD: Record<string, string> = {
  positive: "Good",
  negative: "Bad",
  neutral: "Neutral",
};

/** One review, rendered the same wherever the panel is embedded. */
export function ReviewItem({ review }: { review: Review }) {
  const label = review.sentiment?.label;
  const analysed = !!label && label !== "pending" && label !== "unavailable";

  return (
    <View style={styles.review}>
      <View style={styles.reviewHead}>
        <Text style={styles.stars}>
          {"★".repeat(review.rating)}
          <Text style={styles.starsOff}>{"☆".repeat(5 - review.rating)}</Text>
        </Text>
        {/* "pending" is shown rather than hidden so it's obvious when the
            classifier is offline, instead of implying a neutral verdict. */}
        <Text
          style={[
            styles.sentiment,
            { color: analysed ? SENTIMENT_COLOR[label!] ?? colors.slate400 : colors.slate400 },
          ]}
        >
          {analysed ? SENTIMENT_WORD[label!] ?? label : "pending"}
          {review.sentiment?.language ? ` · ${review.sentiment.language}` : ""}
        </Text>
      </View>
      <Text style={styles.author}>
        {review.user ? `${review.user.firstname} ${review.user.lastname}` : "Customer"}
        {"  ·  "}
        <Text style={styles.date}>{new Date(review.createdAt).toLocaleDateString()}</Text>
      </Text>
      {review.text ? (
        <Text style={styles.text}>{review.text}</Text>
      ) : (
        <Text style={styles.noText}>(no written feedback)</Text>
      )}
    </View>
  );
}

/**
 * The star average, the Good/Neutral/Bad tally and every individual review for
 * one workshop — ported from the web app's admin_pages/WorkshopReviewsPanel.tsx.
 *
 * As on the web this is one component used from every side: a workshop-admin
 * reading their own garage, an admin reading any garage, and the customer
 * detail screen. That is deliberate — the alternative is three views of the
 * same reviews that quietly drift apart, which is exactly what the web avoided
 * by sharing this panel.
 *
 * `reviews` can be passed in by a screen that already fetched them (the
 * customer screen posts reviews and needs to refresh the list itself); left
 * out, the panel fetches its own.
 */
export function WorkshopReviewsPanel({
  workshopId,
  reviews: reviewsProp,
  summary: summaryProp,
}: {
  workshopId: string;
  reviews?: Review[];
  summary?: WorkshopSummary | null;
}) {
  const owned = reviewsProp === undefined;
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<WorkshopSummary | null>(null);
  const [loading, setLoading] = useState(owned);

  useEffect(() => {
    if (!owned || !workshopId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get(`/workshops/${workshopId}/reviews`),
      api.get(`/workshops/${workshopId}`),
    ])
      .then(([reviewsRes, workshopRes]) => {
        if (cancelled) return;
        setReviews(reviewsRes.data.reviews ?? []);
        setSummary(workshopRes.data.workshop ?? null);
      })
      .catch(() => {
        if (!cancelled) setReviews([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workshopId, owned]);

  if (loading) return <Muted>Loading reviews…</Muted>;

  const list = reviewsProp ?? reviews;
  const info = summaryProp ?? summary;

  // Counted here rather than on the server: it's a handful of rows already in
  // memory, and the breakdown is only ever shown alongside them.
  const tally = list.reduce<Record<string, number>>((acc, r) => {
    const label = r.sentiment?.label ?? "pending";
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});
  const analysed = (tally.positive ?? 0) + (tally.neutral ?? 0) + (tally.negative ?? 0);
  const count = info?.rating?.count ?? 0;

  return (
    <View style={styles.panel}>
      <View style={styles.stats}>
        <Stat
          value={count ? `${(info?.rating?.average ?? 0).toFixed(1)} ★` : "—"}
          label={`${count} review${count === 1 ? "" : "s"}`}
        />
        <Stat value={String(tally.positive ?? 0)} label="Good" color={colors.green500} />
        <Stat value={String(tally.neutral ?? 0)} label="Neutral" color={colors.slate400} />
        <Stat value={String(tally.negative ?? 0)} label="Bad" color={colors.red500} />
      </View>

      {/* Says plainly when nothing has been classified, rather than implying
          every review is neutral. */}
      {list.length > 0 && analysed === 0 ? (
        <Text style={styles.note}>
          None of these have been analysed yet — the sentiment classifier isn't running, so every
          review shows as pending. Star ratings are unaffected.
        </Text>
      ) : null}

      {list.length === 0 ? (
        <Muted>No reviews yet.</Muted>
      ) : (
        list.map((r) => <ReviewItem key={r._id} review={r} />)
      )}
    </View>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: spacing.sm },
  stats: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.bgAlt,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 17, fontWeight: "800", color: colors.navy900 },
  statLabel: { fontSize: 11, color: colors.slate600, marginTop: 2, textAlign: "center" },
  note: {
    color: colors.slate600,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: spacing.md,
    fontStyle: "italic",
  },
  review: {
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
  },
  reviewHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  stars: { color: colors.orange500, fontWeight: "700", fontSize: 15 },
  starsOff: { color: colors.slate200 },
  sentiment: { fontSize: 12, fontWeight: "700" },
  author: { color: colors.navy900, fontWeight: "600", fontSize: 13, marginTop: spacing.xs },
  date: { color: colors.slate400, fontWeight: "400", fontSize: 12 },
  text: { color: colors.slate600, marginTop: spacing.xs, lineHeight: 20 },
  noText: { color: colors.slate400, marginTop: spacing.xs, fontStyle: "italic", fontSize: 13 },
});
