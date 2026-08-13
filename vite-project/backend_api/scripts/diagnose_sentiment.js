#!/usr/bin/env node

/**
 * Diagnostic script to check sentiment analysis status
 */

// Loads the consolidated root .env. Must be imported before
// sentimentService.js, which reads process.env when it initializes —
// the previous bare dotenv.config() ran too late and depended on the CWD.
import '../env.js';
import { isSentimentConfigured, analyzeSentiment } from '../services/sentimentService.js';

async function diagnose() {
  console.log('🔍 Sentiment Analysis Diagnostic');
  console.log('='.repeat(80));
  
  // Check configuration
  console.log('\n1. Checking sentiment service configuration...');
  const configured = await isSentimentConfigured();
  console.log(`   Service configured: ${configured ? '✅ Yes' : '❌ No'}`);
  
  if (!configured) {
    console.log('\n⚠️  Sentiment service is not configured!');
    console.log('   Possible issues:');
    console.log('   - ANPR service not running on http://127.0.0.1:8000');
    console.log('   - LLM sentiment endpoint not available');
    console.log('   - Check if python server.py is running in anpr_service folder');
    return;
  }
  
  // Test sentiment analysis
  console.log('\n2. Testing sentiment analysis with sample texts...');
  
  const testCases = [
    { text: 'sewa ramro thiyo', expected: 'positive' },
    { text: 'service bakwas thiyo', expected: 'negative' },
    { text: 'okay service', expected: 'neutral' },
  ];
  
  for (const test of testCases) {
    console.log(`\n   Testing: "${test.text}"`);
    try {
      const result = await analyzeSentiment(test.text);
      
      if (result === null) {
        console.log('   ❌ Result: NULL (service error)');
      } else {
        console.log(`   ✅ Result: ${result.label} (score: ${result.score}, confidence: ${result.confidence})`);
        console.log(`      Language: ${result.language}, Model: ${result.modelVersion}`);
        
        if (result.label === 'pending' || result.label === 'unavailable') {
          console.log('   ⚠️  Warning: Service returned pending/unavailable instead of analyzing');
        }
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  // Check environment variables
  console.log('\n3. Checking environment...');
  console.log(`   SENTIMENT_SERVICE_URL: ${process.env.SENTIMENT_SERVICE_URL || 'http://127.0.0.1:8000 (default)'}`);
  console.log(`   MONGODB_URI: ${process.env.MONGODB_URI ? '✅ Set' : '❌ Not set'}`);
  
  console.log('\n' + '='.repeat(80));
  console.log('📋 DIAGNOSIS COMPLETE');
  console.log('='.repeat(80));
  
  console.log('\n💡 Recommended actions:');
  console.log('1. Start ANPR service with LLM: cd anpr_service && python server.py');
  console.log('2. Check if port 8000 is available');
  console.log('3. Verify API keys in the root .env file');
  console.log('4. Run backfill: node scripts/backfill_llm_sentiment.js');
}

diagnose().catch(err => {
  console.error('❌ Diagnostic failed:', err);
  process.exit(1);
});