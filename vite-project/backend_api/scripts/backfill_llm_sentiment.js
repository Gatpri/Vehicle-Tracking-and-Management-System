#!/usr/bin/env node

/**
 * Backfill script to reprocess existing reviews with LLM sentiment analysis.
 * 
 * Usage:
 *   node backfill_llm_sentiment.js [--dry-run] [--limit N] [--type workshop|delivery|all]
 * 
 * Options:
 *   --dry-run  Show what would be updated without making changes
 *   --limit N  Process only N reviews (default: all)
 *   --type     Process only workshop reviews, delivery reviews, or all (default: all)
 */

// Loads the consolidated root .env, same as the other backend scripts.
// Must come before any import that reads process.env at module scope.
import '../env.js';
import mongoose from 'mongoose';
import { analyzeSentiment } from '../services/sentimentService.js';
import Review from '../models/Review.js';
import DeliveryStaffReview from '../models/DeliveryStaffReview.js';
import { recalculateWorkshopAggregates } from '../controllers/reviewController.js';
import { recalculateStaffAggregates } from '../controllers/deliveryReviewController.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const typeArg = args.find(arg => arg.startsWith('--type='));

const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
const type = typeArg ? typeArg.split('=')[1] : 'all';

console.log(`🚀 Starting LLM sentiment backfill`);
console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (updating database)'}`);
console.log(`Type: ${type}`);
console.log(`Limit: ${limit || 'all reviews'}`);
console.log('='.repeat(80));

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vehicle_service');
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
}

async function processWorkshopReviews() {
  console.log('\n📝 Processing Workshop Reviews...');
  
  // Find reviews that need sentiment analysis
  const query = {
    $or: [
      { 'sentiment.label': { $in: ['pending', 'unavailable'] } },
      { 'sentiment.label': { $exists: false } },
      { text: { $ne: '', $exists: true } }
    ]
  };
  
  const reviews = await Review.find(query)
    .limit(limit || 1000000)
    .sort({ createdAt: -1 })
    .populate('workshop', '_id');
  
  console.log(`Found ${reviews.length} workshop reviews to process`);
  
  let processed = 0;
  let updated = 0;
  let errors = 0;
  
  for (const review of reviews) {
    processed++;
    
    if (!review.text || review.text.trim() === '') {
      console.log(`  ⏭️  Skipping review ${review._id} (no text)`);
      continue;
    }
    
    try {
      console.log(`  Processing review ${review._id}: "${review.text.substring(0, 50)}${review.text.length > 50 ? '...' : ''}"`);
      
      const sentiment = await analyzeSentiment(review.text);
      
      if (!sentiment) {
        console.log(`  ⚠️  No sentiment result for review ${review._id}`);
        errors++;
        continue;
      }
      
      const update = {
        'sentiment.label': sentiment.label,
        'sentiment.score': sentiment.score,
        'sentiment.confidence': sentiment.confidence,
        'sentiment.language': sentiment.language,
        'sentiment.modelVersion': sentiment.modelVersion,
        'sentiment.scoredAt': sentiment.scoredAt || new Date(),
      };
      
      if (dryRun) {
        console.log(`  📋 Would update: ${JSON.stringify(update, null, 2)}`);
      } else {
        await Review.findByIdAndUpdate(review._id, { $set: update });
        console.log(`  ✅ Updated review ${review._id} with ${sentiment.label} sentiment`);
        
        // Recalculate workshop aggregates
        if (review.workshop) {
          await recalculateWorkshopAggregates(review.workshop._id);
          console.log(`  🔄 Updated aggregates for workshop ${review.workshop._id}`);
        }
      }
      
      updated++;
      
    } catch (err) {
      console.error(`  ❌ Error processing review ${review._id}:`, err.message);
      errors++;
    }
    
    // Progress indicator
    if (processed % 10 === 0) {
      console.log(`  Progress: ${processed}/${reviews.length}`);
    }
  }
  
  return { processed, updated, errors };
}

async function processDeliveryReviews() {
  console.log('\n🚚 Processing Delivery Staff Reviews...');
  
  // Find delivery reviews that need sentiment analysis
  const query = {
    $or: [
      { 'sentiment.label': { $in: ['pending', 'unavailable'] } },
      { 'sentiment.label': { $exists: false } },
      { text: { $ne: '', $exists: true } }
    ]
  };
  
  const reviews = await DeliveryStaffReview.find(query)
    .limit(limit || 1000000)
    .sort({ createdAt: -1 })
    .populate('staff', '_id');
  
  console.log(`Found ${reviews.length} delivery reviews to process`);
  
  let processed = 0;
  let updated = 0;
  let errors = 0;
  
  for (const review of reviews) {
    processed++;
    
    if (!review.text || review.text.trim() === '') {
      console.log(`  ⏭️  Skipping delivery review ${review._id} (no text)`);
      continue;
    }
    
    try {
      console.log(`  Processing delivery review ${review._id}: "${review.text.substring(0, 50)}${review.text.length > 50 ? '...' : ''}"`);
      
      const sentiment = await analyzeSentiment(review.text);
      
      if (!sentiment) {
        console.log(`  ⚠️  No sentiment result for delivery review ${review._id}`);
        errors++;
        continue;
      }
      
      const update = {
        'sentiment.label': sentiment.label,
        'sentiment.score': sentiment.score,
        'sentiment.confidence': sentiment.confidence,
        'sentiment.language': sentiment.language,
        'sentiment.modelVersion': sentiment.modelVersion,
        'sentiment.scoredAt': sentiment.scoredAt || new Date(),
      };
      
      if (dryRun) {
        console.log(`  📋 Would update: ${JSON.stringify(update, null, 2)}`);
      } else {
        await DeliveryStaffReview.findByIdAndUpdate(review._id, { $set: update });
        console.log(`  ✅ Updated delivery review ${review._id} with ${sentiment.label} sentiment`);
        
        // Recalculate staff aggregates
        if (review.staff) {
          await recalculateStaffAggregates(review.staff._id);
          console.log(`  🔄 Updated aggregates for staff ${review.staff._id}`);
        }
      }
      
      updated++;
      
    } catch (err) {
      console.error(`  ❌ Error processing delivery review ${review._id}:`, err.message);
      errors++;
    }
    
    // Progress indicator
    if (processed % 10 === 0) {
      console.log(`  Progress: ${processed}/${reviews.length}`);
    }
  }
  
  return { processed, updated, errors };
}

async function main() {
  await connectDB();
  
  let workshopStats = { processed: 0, updated: 0, errors: 0 };
  let deliveryStats = { processed: 0, updated: 0, errors: 0 };
  
  // Check if sentiment service is available
  console.log('🔍 Checking sentiment service availability...');
  // Note: You might want to add a health check function to sentimentService.js
  console.log('⚠️  Make sure ANPR service with LLM sentiment is running on http://127.0.0.1:8000');
  console.log('   Start it with: cd anpr_service && python server.py');
  
  if (type === 'all' || type === 'workshop') {
    workshopStats = await processWorkshopReviews();
  }
  
  if (type === 'all' || type === 'delivery') {
    deliveryStats = await processDeliveryReviews();
  }
  
  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 BACKFILL SUMMARY');
  console.log('='.repeat(80));
  
  if (type === 'all' || type === 'workshop') {
    console.log(`Workshop Reviews:`);
    console.log(`  Processed: ${workshopStats.processed}`);
    console.log(`  Updated: ${workshopStats.updated}`);
    console.log(`  Errors: ${workshopStats.errors}`);
  }
  
  if (type === 'all' || type === 'delivery') {
    console.log(`\nDelivery Reviews:`);
    console.log(`  Processed: ${deliveryStats.processed}`);
    console.log(`  Updated: ${deliveryStats.updated}`);
    console.log(`  Errors: ${deliveryStats.errors}`);
  }
  
  const totalProcessed = workshopStats.processed + deliveryStats.processed;
  const totalUpdated = workshopStats.updated + deliveryStats.updated;
  const totalErrors = workshopStats.errors + deliveryStats.errors;
  
  console.log('\n' + '='.repeat(80));
  console.log(`TOTALS:`);
  console.log(`  Processed: ${totalProcessed}`);
  console.log(`  Updated: ${totalUpdated}`);
  console.log(`  Errors: ${totalErrors}`);
  
  if (dryRun) {
    console.log('\n⚠️  DRY RUN COMPLETE - No changes were made to the database');
    console.log('   Run without --dry-run to apply changes');
  } else {
    console.log('\n✅ BACKFILL COMPLETE');
  }
  
  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB');
}

// Handle errors
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled rejection:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Process interrupted by user');
  await mongoose.disconnect();
  process.exit(0);
});

// Run main function
main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});