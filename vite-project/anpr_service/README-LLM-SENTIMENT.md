# LLM Sentiment Analysis System

This system provides sentiment analysis for feedback/reviews using Google's Gemini Flash 2.5 model with Mistral AI as a fallback option.

## Overview

The system analyzes text feedback and classifies it as:
- **Positive** 😊
- **Negative** 😠  
- **Neutral** 😐
- **Unavailable** (when LLM services are down)

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Backend API   │────│  Sentiment      │────│   ANPR Service  │
│   (Node.js)     │    │  Service        │    │   (Python)      │
│                 │    │                 │    │                 │
│ • review        │    │ • Calls LLM     │    │ • /sentiment    │
│   controller    │    │   endpoint      │    │   endpoint      │
│ • delivery      │    │ • Returns       │    │ • LLM sentiment │
│   review        │    │   sentiment     │    │   analysis      │
│   controller    │    │   results       │    │ • Gemini/Mistral│
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                        ┌───────┴───────┐
                        │   LLM APIs    │
                        │               │
                        │ • Gemini API  │
                        │ • Mistral API │
                        └───────────────┘
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd anpr_service
pip install -r requirements.txt
```

### 2. Get API Keys

1. **Google Gemini API Key** (Gemini Flash 2.5)
   - Visit: https://makersuite.google.com/app/apikey
   - Create a new API key
   - Add billing to your Google Cloud account (free tier available)

2. **Mistral AI API Key** (Fallback)
   - Visit: https://console.mistral.ai/api-keys/
   - Sign up and create an API key
   - Free tier includes limited requests

### 3. Configure Environment

Copy the example environment file and add your API keys:

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:
```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
MISTRAL_API_KEY=your_actual_mistral_api_key_here
```

### 4. Start the ANPR Service with LLM Support

```bash
python server.py
```

The service will start on `http://127.0.0.1:8000` with:
- `/health` - Service health check
- `/detect` - ANPR plate detection (existing)
- `/sentiment/health` - LLM sentiment health check
- `/sentiment` - LLM sentiment analysis endpoint

### 5. Test the System

Run the test script to verify everything works:

```bash
python test_llm_sentiment.py
```

## Database Schema Updates

### Review Model (Workshop Reviews)
Already includes sentiment fields:
- `sentiment.label`: positive/neutral/negative/pending/unavailable
- `sentiment.score`: -1 to +1 sentiment score
- `sentiment.confidence`: 0-1 confidence level
- `sentiment.language`: detected language
- `sentiment.modelVersion`: model identifier
- `sentiment.scoredAt`: timestamp

### DeliveryStaffReview Model
Updated to include the same sentiment fields.

### User Model
Added `deliverySentiment` field for delivery staff aggregates:
- `deliverySentiment.score`: weighted sentiment score
- `deliverySentiment.positiveRatio`: proportion of positive reviews
- `deliverySentiment.scoredCount`: number of scored reviews

## API Endpoints

### Sentiment Analysis Endpoint

**POST** `http://127.0.0.1:8000/sentiment`

Request:
```json
{
  "text": "service bakwas thiyo"
}
```

Response:
```json
{
  "label": "negative",
  "score": -0.85,
  "confidence": 0.92,
  "language": "romanized",
  "modelVersion": "gemini-flash-2.5+fallback-mistral+gemini-flash-2.5",
  "explain": {
    "source": "gemini-flash-2.5",
    "reasoning": "The text 'bakwas thiyo' translates to 'was rubbish' indicating dissatisfaction",
    "matched": []
  }
}
```

### Health Check

**GET** `http://127.0.0.1:8000/sentiment/health`

Response:
```json
{
  "available": true,
  "service": "gemini-flash-2.5+mistral-fallback",
  "gemini_api_key_configured": true,
  "mistral_api_key_configured": true
}
```

## Backfill Existing Reviews

To reprocess existing reviews with the new LLM system:

```bash
cd backend_api

# Dry run (show what would be updated)
node scripts/backfill_llm_sentiment.js --dry-run

# Process workshop reviews only
node scripts/backfill_llm_sentiment.js --type=workshop

# Process all reviews (workshop and delivery)
node scripts/backfill_llm_sentiment.js

# Process with limit
node scripts/backfill_llm_sentiment.js --limit=100
```

## Monitoring and Troubleshooting

### Common Issues

1. **API Keys Not Working**
   - Verify keys are correctly set in `.env`
   - Check billing status for Gemini
   - Verify Mistral account is active

2. **Service Not Starting**
   - Check if port 8000 is already in use
   - Verify Python dependencies are installed
   - Check ANPR weights directory exists

3. **Slow Responses**
   - LLM calls can take 2-5 seconds
   - Consider implementing caching for frequent phrases
   - Monitor API rate limits

### Logs

Check the ANPR service logs for:
- API call successes/failures
- Sentiment analysis results
- Error messages

## Performance Characteristics

- **Response Time**: 2-5 seconds per analysis
- **Languages Supported**: English, Devanagari (Nepali), Romanized Nepali
- **Fallback Strategy**: Gemini → Mistral → Unavailable
- **Confidence Scoring**: 0-1 scale with reasoning

## Integration with Frontend

The sentiment analysis is automatically applied to:
1. Workshop reviews (via `reviewController.js`)
2. Delivery staff reviews (via `deliveryReviewController.js`)

Frontend can display:
- Sentiment labels with icons
- Confidence indicators
- Language detection
- Aggregate sentiment scores for workshops/staff

## Cost Considerations

- **Gemini API**: Pay-per-use, free tier available
- **Mistral API**: Free tier with limits, then pay-per-use
- **Recommendation**: Start with free tiers, monitor usage

## Future Enhancements

1. **Caching**: Cache frequent phrases to reduce API calls
2. **Batch Processing**: Process multiple reviews in batch
3. **Custom Models**: Fine-tune models on your specific feedback data
4. **Multi-language Support**: Expand beyond English and Nepali
5. **Aspect-based Sentiment**: Analyze specific aspects (service, price, quality)