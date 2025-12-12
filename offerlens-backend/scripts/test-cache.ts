#!/usr/bin/env tsx

/**
 * Quick script to test Redis cache connectivity and basic operations
 * Run with: npx tsx scripts/test-cache.ts
 */

import { cacheService } from '../src/services/cache.service';
import logger from '../src/utils/logger';

async function testCache() {
  console.log('\n🔍 Testing Redis Cache Service...\n');

  try {
    // Test 1: Ping
    console.log('1️⃣  Testing connection...');
    const isConnected = await cacheService.ping();
    if (isConnected) {
      console.log('   ✅ Redis is connected and responding\n');
    } else {
      console.log('   ⚠️  Redis is not available (graceful degradation mode)\n');
    }

    // Test 2: Set and Get
    console.log('2️⃣  Testing set and get...');
    const testKey = 'test:demo';
    const testValue = { message: 'Hello from cache!', timestamp: Date.now() };
    
    await cacheService.set(testKey, testValue, 60); // 60 second TTL
    const retrieved = await cacheService.get<typeof testValue>(testKey);
    
    if (retrieved && retrieved.message === testValue.message) {
      console.log('   ✅ Set and get working correctly');
      console.log(`   📦 Retrieved: ${JSON.stringify(retrieved)}\n`);
    } else if (retrieved === null && !isConnected) {
      console.log('   ⚠️  Cache operations skipped (Redis unavailable)\n');
    } else {
      console.log('   ❌ Set/get test failed\n');
    }

    // Test 3: Increment
    console.log('3️⃣  Testing increment (rate limiting)...');
    const counterKey = 'test:counter';
    const count1 = await cacheService.increment(counterKey, 60);
    const count2 = await cacheService.increment(counterKey, 60);
    const count3 = await cacheService.increment(counterKey, 60);
    
    if (isConnected) {
      console.log(`   ✅ Counter incremented: ${count1} → ${count2} → ${count3}\n`);
    } else {
      console.log('   ⚠️  Increment returns 0 (Redis unavailable)\n');
    }

    // Test 4: Delete
    console.log('4️⃣  Testing delete...');
    await cacheService.del(testKey);
    await cacheService.del(counterKey);
    const afterDelete = await cacheService.get(testKey);
    
    if (afterDelete === null) {
      console.log('   ✅ Delete working correctly\n');
    }

    // Summary
    console.log('📊 Summary:');
    console.log(`   Connection Status: ${cacheService.isReady() ? '🟢 Connected' : '🔴 Disconnected'}`);
    console.log(`   Graceful Degradation: ${!isConnected ? '✅ Working' : 'N/A'}`);
    console.log('\n✨ Cache service test complete!\n');

    if (!isConnected) {
      console.log('💡 To start Redis:');
      console.log('   docker-compose up -d redis\n');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await cacheService.close();
    process.exit(0);
  }
}

testCache();
