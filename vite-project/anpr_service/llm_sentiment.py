"""LLM-based sentiment analysis using Gemini Flash 2.5 with Mistral fallback.

This module provides sentiment analysis using Google's Gemini Flash 2.5 model
with Mistral AI as a fallback option. It classifies text as positive, negative,
or neutral with confidence scores.
"""

import os
import json
import time
import logging
from typing import Dict, Optional, Tuple, Literal
from enum import Enum

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SentimentLabel(str, Enum):
    """Sentiment classification labels."""
    POSITIVE = "positive"
    NEGATIVE = "negative" 
    NEUTRAL = "neutral"
    PENDING = "pending"
    UNAVAILABLE = "unavailable"


class LLMSentimentAnalyzer:
    """LLM-based sentiment analyzer with fallback support."""
    
    def __init__(self):
        self.gemini_api_key = os.environ.get("GEMINI_API_KEY")
        self.mistral_api_key = os.environ.get("MISTRAL_API_KEY")
        self.model_version = "gemini-flash-2.5+fallback-mistral"
        
        # Check if at least one API key is available
        if not self.gemini_api_key and not self.mistral_api_key:
            logger.warning("No LLM API keys found. Sentiment analysis will return 'unavailable'.")
    
    def _call_gemini_api(self, text: str) -> Optional[Dict]:
        """Call Gemini API for sentiment analysis."""
        if not self.gemini_api_key:
            return None
            
        try:
            import google.generativeai as genai
            
            # Configure Gemini
            genai.configure(api_key=self.gemini_api_key)
            
            # "flash-latest" always points at Google's current recommended Flash
            # model, so this doesn't go stale the way a pinned version does —
            # gemini-2.0-flash-exp and gemini-2.5-flash were both retired for
            # this key within the same session.
            model = genai.GenerativeModel('gemini-flash-latest')
            
            # Create sentiment analysis prompt
            prompt = f"""
            Analyze the sentiment of the following text and classify it as POSITIVE, NEGATIVE, or NEUTRAL.
            Also provide a confidence score between 0 and 1.
            
            Text: "{text}"
            
            Respond in JSON format with the following structure:
            {{
                "label": "positive|negative|neutral",
                "confidence": 0.95,
                "reasoning": "brief explanation of why this sentiment was chosen"
            }}
            
            Only return the JSON, no additional text.
            """
            
            # Generate response
            response = model.generate_content(prompt)
            
            # Parse JSON response
            try:
                # Extract JSON from response text
                response_text = response.text.strip()
                if response_text.startswith("```json"):
                    response_text = response_text[7:-3] if response_text.endswith("```") else response_text[7:]
                elif response_text.startswith("```"):
                    response_text = response_text[3:-3] if response_text.endswith("```") else response_text[3:]
                
                result = json.loads(response_text)
                
                # Validate and normalize response
                label = result.get("label", "").lower()
                if label not in ["positive", "negative", "neutral"]:
                    logger.warning(f"Gemini returned invalid label: {label}")
                    return None
                
                confidence = float(result.get("confidence", 0.5))
                confidence = max(0.0, min(1.0, confidence))  # Clamp to 0-1
                
                return {
                    "label": label,
                    "confidence": confidence,
                    "reasoning": result.get("reasoning", ""),
                    "source": "gemini-flash-2.5"
                }
                
            except (json.JSONDecodeError, ValueError) as e:
                logger.error(f"Failed to parse Gemini response: {e}")
                logger.debug(f"Raw response: {response.text}")
                return None
                
        except ImportError:
            logger.error("Google Generative AI library not installed. Install with: pip install google-generativeai")
            return None
        except Exception as e:
            logger.error(f"Gemini API call failed: {e}")
            return None
    
    def _call_mistral_api(self, text: str) -> Optional[Dict]:
        """Call Mistral API for sentiment analysis (fallback)."""
        if not self.mistral_api_key:
            return None
            
        try:
            from mistralai import Mistral
            
            # Initialize Mistral client
            client = Mistral(api_key=self.mistral_api_key)
            
            # Create sentiment analysis prompt
            messages = [
                {
                    "role": "system",
                    "content": """You are a sentiment analysis assistant. Analyze the sentiment of user text and classify it as POSITIVE, NEGATIVE, or NEUTRAL.
                    Also provide a confidence score between 0 and 1. Return ONLY valid JSON with this structure:
                    {"label": "positive|negative|neutral", "confidence": 0.95, "reasoning": "brief explanation"}"""
                },
                {
                    "role": "user", 
                    "content": f"Text: {text}"
                }
            ]
            
            # Call Mistral API
            response = client.chat.complete(
                model="mistral-small-latest",
                messages=messages,
                temperature=0.1,  # Low temperature for consistent results
                max_tokens=100
            )
            
            # Parse response
            response_text = response.choices[0].message.content.strip()
            
            try:
                # Extract JSON from response
                if response_text.startswith("```json"):
                    response_text = response_text[7:-3] if response_text.endswith("```") else response_text[7:]
                elif response_text.startswith("```"):
                    response_text = response_text[3:-3] if response_text.endswith("```") else response_text[3:]
                
                result = json.loads(response_text)
                
                # Validate and normalize response
                label = result.get("label", "").lower()
                if label not in ["positive", "negative", "neutral"]:
                    logger.warning(f"Mistral returned invalid label: {label}")
                    return None
                
                confidence = float(result.get("confidence", 0.5))
                confidence = max(0.0, min(1.0, confidence))
                
                return {
                    "label": label,
                    "confidence": confidence,
                    "reasoning": result.get("reasoning", ""),
                    "source": "mistral-small-latest"
                }
                
            except (json.JSONDecodeError, ValueError) as e:
                logger.error(f"Failed to parse Mistral response: {e}")
                logger.debug(f"Raw response: {response_text}")
                return None
                
        except ImportError:
            logger.error("Mistral AI library not installed. Install with: pip install mistralai")
            return None
        except Exception as e:
            logger.error(f"Mistral API call failed: {e}")
            return None
    
    def analyze_sentiment(self, text: str) -> Dict:
        """
        Analyze sentiment using LLMs with fallback strategy.
        
        Args:
            text: The text to analyze
            
        Returns:
            Dict with sentiment analysis results
        """
        if not text or not text.strip():
            return {
                "label": SentimentLabel.NEUTRAL.value,
                "score": 0.0,
                "confidence": 0.0,
                "language": "english",
                "modelVersion": self.model_version,
                "explain": {"source": "empty_text", "matched": []}
            }
        
        # Try Gemini first
        result = self._call_gemini_api(text)
        
        # If Gemini fails, try Mistral
        if not result:
            result = self._call_mistral_api(text)
        
        # If both fail, return unavailable
        if not result:
            return {
                "label": SentimentLabel.UNAVAILABLE.value,
                "score": 0.0,
                "confidence": 0.0,
                "language": "unknown",
                "modelVersion": self.model_version,
                "explain": {"source": "llm_unavailable", "matched": []}
            }
        
        # Convert label to score (-1 to 1)
        label_to_score = {
            "positive": 1.0,
            "neutral": 0.0,
            "negative": -1.0
        }
        
        score = label_to_score.get(result["label"], 0.0) * result["confidence"]
        
        # Detect language (simplified - could be enhanced)
        language = self._detect_language(text)
        
        return {
            "label": result["label"],
            "score": round(score, 3),
            "confidence": round(result["confidence"], 3),
            "language": language,
            "modelVersion": f"{self.model_version}+{result['source']}",
            "explain": {
                "source": result["source"],
                "reasoning": result.get("reasoning", ""),
                "matched": []
            }
        }
    
    def _detect_language(self, text: str) -> str:
        """Simple language detection for Nepali scripts."""
        # Check for Devanagari characters
        devanagari_range = range(0x0900, 0x097F)
        for char in text:
            if ord(char) in devanagari_range:
                return "devanagari"
        
        # Check for common Nepali Romanized words
        nepali_romanized_words = ["thiyo", "cha", "ho", "raheko", "ramro", "naramro", 
                                  "bakwas", "sundar", "dherai", "ali", "thorai"]
        text_lower = text.lower()
        if any(word in text_lower for word in nepali_romanized_words):
            return "romanized"
        
        # Default to English
        return "english"


# Global analyzer instance
_analyzer_instance = None

def get_analyzer() -> LLMSentimentAnalyzer:
    """Get or create the LLM analyzer instance."""
    global _analyzer_instance
    if _analyzer_instance is None:
        _analyzer_instance = LLMSentimentAnalyzer()
    return _analyzer_instance

def analyze_sentiment(text: str) -> Dict:
    """
    Main function to analyze sentiment using LLMs.
    
    Args:
        text: Text to analyze
        
    Returns:
        Dict with sentiment analysis results
    """
    analyzer = get_analyzer()
    return analyzer.analyze_sentiment(text)


if __name__ == "__main__":
    # Test the analyzer
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    
    # Set test API keys if not set
    if not os.environ.get("GEMINI_API_KEY"):
        print("Warning: GEMINI_API_KEY not set. Gemini calls will fail.")
    if not os.environ.get("MISTRAL_API_KEY"):
        print("Warning: MISTRAL_API_KEY not set. Mistral calls will fail.")
    
    test_samples = [
        "service bakwas thiyo",
        "sewa ramro thiyo",
        "excellent service, very happy",
        "terrible work, very disappointed",
        "सेवा एकदम राम्रो थियो",
        "धेरै नराम्रो सेवा, पैसा खेर गयो",
        "The service was okay, nothing special",
        "Absolutely amazing experience!",
    ]
    
    print("Testing LLM Sentiment Analysis:")
    print("=" * 80)
    
    for sample in test_samples:
        print(f"\nText: {sample}")
        result = analyze_sentiment(sample)
        
        print(f"  Label: {result['label']}")
        print(f"  Score: {result['score']:+.3f}")
        print(f"  Confidence: {result['confidence']:.3f}")
        print(f"  Language: {result['language']}")
        print(f"  Model: {result['modelVersion']}")
        
        if result['explain'].get('reasoning'):
            print(f"  Reasoning: {result['explain']['reasoning'][:100]}...")
        
        if result['label'] == 'unavailable':
            print("  ⚠️  LLM services unavailable. Check API keys and internet connection.")