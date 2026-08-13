import axios from "axios";

// Where your trained Nepali/Romanized/English sentiment classifier is served.
// Defaults to the same host as the ANPR sidecar — run it there or point this
// somewhere else; nothing in the backend cares which.
const SENTIMENT_SERVICE_URL = process.env.SENTIMENT_SERVICE_URL || "http://127.0.0.1:8000";

// ---------------------------------------------------------------------------
// LLM-based sentiment analysis using Gemini Flash 2.5 with Mistral fallback.
// The ANPR service (anpr_service/llm_sentiment.py) handles the actual LLM calls.
//
// This service delegates all sentiment analysis to the ANPR service.
// If the ANPR service is unavailable, reviews will be marked as "unavailable"
// rather than using any fallback analysis.
// ---------------------------------------------------------------------------

export const isSentimentConfigured = async () => {
  try {
    const response = await axios.get(`${SENTIMENT_SERVICE_URL}/sentiment/health`, { timeout: 5000 });
    return response.data.available === true;
  } catch (err) {
    console.error("Sentiment service health check failed:", err.message);
    return false;
  }
};

// Main sentiment analysis function - DELEGATES TO LLM SERVICE
// If LLM service is unavailable, returns result with label "unavailable"
export const analyzeSentiment = async (text) => {
  if (!text?.trim()) {
    return {
      label: "neutral",
      score: 0.0,
      confidence: 0.5,
      language: "english",
      modelVersion: "empty-text",
      scoredAt: new Date()
    };
  }

  try {
    const { data } = await axios.post(
      `${SENTIMENT_SERVICE_URL}/sentiment`,
      { text },
      { timeout: 15000 } // 15 second timeout for LLM calls
    );

    // If LLM service reports unavailable, mark review as unavailable
    if (data.error || data.label === "unavailable") {
      console.warn("LLM sentiment analysis unavailable:", data.error || "service returned unavailable");
      return {
        label: "unavailable",
        score: null,
        confidence: null,
        language: data.language || "",
        modelVersion: data.modelVersion || "llm-unavailable",
        scoredAt: new Date()
      };
    }

    // Validate the result
    if (!["positive", "neutral", "negative"].includes(data?.label)) {
      console.warn(`Unexpected label from LLM service: ${data?.label}`);
      return {
        label: "unavailable",
        score: null,
        confidence: null,
        language: data.language || "",
        modelVersion: data.modelVersion || "invalid-label",
        scoredAt: new Date()
      };
    }

    return {
      label: data.label,
      score: typeof data.score === "number" ? data.score : null,
      confidence: typeof data.confidence === "number" ? data.confidence : null,
      language: data.language ?? "",
      modelVersion: data.modelVersion ?? "",
      scoredAt: new Date(),
      explain: data.explain || {},
    };
  } catch (err) {
    console.error("LLM sentiment service unavailable, leaving review marked as unavailable:", err.message);
    return {
      label: "unavailable",
      score: null,
      confidence: null,
      language: "",
      modelVersion: "llm-service-unavailable",
      scoredAt: new Date()
    };
  }
};

// Simple test function
export const testSentimentAnalysis = async () => {
  const testCases = [
    { text: 'sewa ramro thiyo', expected: 'positive' },
    { text: 'service bakwas thiyo', expected: 'negative' },
    { text: 'good service', expected: 'positive' },
    { text: 'bad service', expected: 'negative' },
  ];
  
  console.log('🧪 Testing LLM Sentiment Analysis');
  console.log('='.repeat(80));
  
  for (const test of testCases) {
    try {
      const result = await analyzeSentiment(test.text);
      const passed = result.label === test.expected && result.label !== 'unavailable';
      
      console.log(`${passed ? '✅' : '⚠️'} "${test.text}" -> ${result.label.toUpperCase()}`);
      console.log(`   Expected: ${test.expected.toUpperCase()}, Got: ${result.label.toUpperCase()}`);
      if (result.label === 'unavailable') {
        console.log(`   ⚠️  LLM service unavailable - check API keys in the root .env`);
      }
      console.log(`   Confidence: ${result.confidence}`);
      console.log(`   Model: ${result.modelVersion}`);
      console.log('');
    } catch (error) {
      console.log(`❌ Error testing "${test.text}": ${error.message}`);
    }
  }
  
  console.log('='.repeat(80));
};