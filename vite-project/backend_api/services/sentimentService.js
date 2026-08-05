import axios from "axios";

// Where your trained Nepali/Romanized/English sentiment classifier is served.
// Defaults to the same host as the ANPR sidecar — run it there or point this
// somewhere else; nothing in the backend cares which.
const SENTIMENT_SERVICE_URL = process.env.SENTIMENT_SERVICE_URL || "http://127.0.0.1:8000";

// ---------------------------------------------------------------------------
// CONTRACT — implement this endpoint when your classifier is ready.
//
//   POST {SENTIMENT_SERVICE_URL}/sentiment
//   body: { "text": "गाडी राम्रो बनायो" }
//
//   200 response:
//   {
//     "label": "positive" | "neutral" | "negative",
//     "score": 0.87,          // -1 (most negative) .. +1 (most positive)
//     "confidence": 0.93,     // 0..1, the model's own certainty
//     "language": "devanagari" | "romanized" | "english",
//     "modelVersion": "nep-sentiment-v1"
//   }
//
// Until that exists, every call here fails and reviews are stored with
// sentiment.label = "pending". Once it's live, run
//   node backend_api/scripts/backfillSentiment.js
// to score everything written in the meantime. No other code changes.
// ---------------------------------------------------------------------------

export const isSentimentConfigured = async () => {
  try {
    await axios.get(`${SENTIMENT_SERVICE_URL}/sentiment/health`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
};

// Returns a sentiment object shaped for Review.sentiment, or null when the
// classifier can't be reached. Callers treat null as "leave it pending" —
// a review must never fail to save because the ML service is down.
export const analyzeSentiment = async (text) => {
  if (!text?.trim()) return null;

  try {
    const { data } = await axios.post(
      `${SENTIMENT_SERVICE_URL}/sentiment`,
      { text },
      { timeout: 10000 }
    );

    if (!["positive", "neutral", "negative"].includes(data?.label)) {
      throw new Error(`Unexpected label from sentiment service: ${data?.label}`);
    }

    return {
      label: data.label,
      score: typeof data.score === "number" ? data.score : null,
      confidence: typeof data.confidence === "number" ? data.confidence : null,
      language: data.language ?? "",
      modelVersion: data.modelVersion ?? "",
      scoredAt: new Date(),
    };
  } catch (err) {
    console.error("Sentiment scoring unavailable, leaving review pending:", err.message);
    return null;
  }
};
