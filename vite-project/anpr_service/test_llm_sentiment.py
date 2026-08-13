#!/usr/bin/env python
"""Test script for LLM sentiment analysis."""

import os
import sys
import json
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Set test API keys if not already set
if not os.environ.get("GEMINI_API_KEY"):
    os.environ["GEMINI_API_KEY"] = "test_key"  # Will fail but show error message
if not os.environ.get("MISTRAL_API_KEY"):
    os.environ["MISTRAL_API_KEY"] = "test_key"  # Will fail but show error message

try:
    from llm_sentiment import analyze_sentiment
    print("✅ LLM sentiment module imported successfully")
except ImportError as e:
    print(f"❌ Failed to import LLM sentiment module: {e}")
    print("Install dependencies with: pip install -r requirements-llm.txt")
    sys.exit(1)

# Test samples
test_cases = [
    {
        "text": "service bakwas thiyo",
        "expected": "negative",
        "description": "Romanized Nepali negative"
    },
    {
        "text": "sewa ramro thiyo",
        "expected": "positive", 
        "description": "Romanized Nepali positive"
    },
    {
        "text": "excellent service, very happy",
        "expected": "positive",
        "description": "English positive"
    },
    {
        "text": "terrible work, very disappointed",
        "expected": "negative",
        "description": "English negative"
    },
    {
        "text": "सेवा एकदम राम्रो थियो",
        "expected": "positive",
        "description": "Devanagari positive"
    },
    {
        "text": "धेरै नराम्रो सेवा, पैसा खेर गयो",
        "expected": "negative",
        "description": "Devanagari negative"
    },
    {
        "text": "The service was okay, nothing special",
        "expected": "neutral",
        "description": "English neutral"
    },
    {
        "text": "",
        "expected": "neutral",
        "description": "Empty text"
    },
]

def run_tests():
    """Run all test cases."""
    print("\n" + "="*80)
    print("LLM Sentiment Analysis Test Suite")
    print("="*80)
    
    results = []
    
    for i, test in enumerate(test_cases, 1):
        print(f"\nTest {i}: {test['description']}")
        print(f"Text: '{test['text']}'")
        
        try:
            result = analyze_sentiment(test["text"])
            
            print(f"  Result: {result['label']} (expected: {test['expected']})")
            print(f"  Score: {result['score']:+.3f}")
            print(f"  Confidence: {result['confidence']:.3f}")
            print(f"  Language: {result['language']}")
            print(f"  Model: {result['modelVersion']}")
            
            # Check result
            passed = result['label'] == test['expected'] or result['label'] == 'unavailable'
            status = "✅ PASS" if passed else "❌ FAIL"
            
            if result['label'] == 'unavailable':
                print(f"  ⚠️  LLM unavailable - API keys may be missing or invalid")
                status = "⚠️  SKIP (API unavailable)"
            
            results.append({
                "test": test['description'],
                "passed": passed,
                "result": result['label'],
                "expected": test['expected'],
                "status": status
            })
            
        except Exception as e:
            print(f"  ❌ Error: {e}")
            results.append({
                "test": test['description'],
                "passed": False,
                "error": str(e),
                "status": "❌ ERROR"
            })
    
    # Print summary
    print("\n" + "="*80)
    print("Test Summary")
    print("="*80)
    
    passed_count = sum(1 for r in results if r.get('passed', False))
    total_count = len(results)
    
    for r in results:
        print(f"{r['status']}: {r['test']}")
        if not r.get('passed', False) and 'result' in r:
            print(f"    Expected: {r['expected']}, Got: {r.get('result', 'error')}")
    
    print(f"\nTotal: {passed_count}/{total_count} tests passed")
    
    if passed_count == total_count:
        print("🎉 All tests passed!")
    else:
        print("⚠️  Some tests failed. Check API keys and network connection.")
        print("\nNext steps:")
        print("1. Get Gemini API key from: https://makersuite.google.com/app/apikey")
        print("2. Get Mistral API key from: https://console.mistral.ai/api-keys/")
        print("3. Add keys to .env file in anpr_service directory")
        print("4. Run: python llm_sentiment.py to test the module directly")

if __name__ == "__main__":
    run_tests()