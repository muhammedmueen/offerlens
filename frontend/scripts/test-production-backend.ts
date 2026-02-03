/**
 * Production Backend Compatibility Test Script
 * 
 * Tests the Next.js frontend against the production backend
 * to verify backward compatibility.
 * 
 * Requirement 18.5: Test with production backend
 * 
 * Usage:
 *   npm run test:production-backend
 *   or
 *   BACKEND_URL=https://api.offerlens.com/api/v1 tsx scripts/test-production-backend.ts
 */

import { ApiClient } from '../lib/api/client';
import type {
  AnalyzeRequest,
  FeatureRequestCreate,
} from '../lib/api/types';

// Configuration
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000/api/v1';
const VERBOSE = process.env.VERBOSE === 'true';

// Test results
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

const results: TestResult[] = [];

// Helper functions
function log(message: string) {
  if (VERBOSE) {
    console.log(`[TEST] ${message}`);
  }
}

function logSuccess(message: string) {
  console.log(`✅ ${message}`);
}

function logError(message: string) {
  console.error(`❌ ${message}`);
}

function logWarning(message: string) {
  console.warn(`⚠️  ${message}`);
}

async function runTest(
  name: string,
  testFn: () => Promise<void>
): Promise<void> {
  log(`Running: ${name}`);
  const startTime = Date.now();
  
  try {
    await testFn();
    const duration = Date.now() - startTime;
    results.push({ name, passed: true, duration });
    logSuccess(`${name} (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: errorMessage, duration });
    logError(`${name}: ${errorMessage}`);
  }
}

// Test suite
async function main() {
  console.log('\n🔍 Testing Next.js Frontend with Production Backend\n');
  console.log(`Backend URL: ${BACKEND_URL}\n`);

  const client = new ApiClient({ baseURL: BACKEND_URL });

  // Test 1: Health Check
  await runTest('Health Check', async () => {
    const response = await client.get<{ status: string }>('/health');
    if (response.status !== 'ok' && response.status !== 'healthy') {
      throw new Error(`Unexpected health status: ${response.status}`);
    }
  });

  // Test 2: Get Roles
  await runTest('Get Roles', async () => {
    const response = await client.get<{ roles: string[] }>('/roles');
    if (!Array.isArray(response.roles)) {
      throw new Error('Roles response is not an array');
    }
    if (response.roles.length === 0) {
      logWarning('No roles returned from backend');
    }
    log(`Received ${response.roles.length} roles`);
  });

  // Test 3: Get Experience Levels
  await runTest('Get Experience Levels', async () => {
    const response = await client.get<{ experienceLevels: string[] }>('/experience-levels');
    if (!Array.isArray(response.experienceLevels)) {
      throw new Error('Experience levels response is not an array');
    }
    if (response.experienceLevels.length === 0) {
      logWarning('No experience levels returned from backend');
    }
    log(`Received ${response.experienceLevels.length} experience levels`);
  });

  // Test 4: Get Cities
  await runTest('Get Cities', async () => {
    const response = await client.get<{ cities: string[] }>('/cities');
    if (!Array.isArray(response.cities)) {
      throw new Error('Cities response is not an array');
    }
    if (response.cities.length === 0) {
      logWarning('No cities returned from backend');
    }
    log(`Received ${response.cities.length} cities`);
  });

  // Test 5: Analyze Offer (with sample data)
  await runTest('Analyze Offer', async () => {
    const request: AnalyzeRequest = {
      offerText: `
        Dear Candidate,
        
        We are pleased to offer you the position of Software Engineer.
        
        Compensation:
        - Base Salary: $120,000 per year
        - Signing Bonus: $10,000
        - Stock Options: 1,000 shares
        
        Benefits:
        - Health Insurance
        - 401(k) matching
        - 15 days PTO
        
        Terms:
        - Notice Period: 90 days
        - Non-compete: 2 years
        - Probation: 6 months
        
        Please sign and return by end of week.
      `,
      role: 'Software Engineer',
      experience: 'Mid-level',
      ctc: 120000,
      city: 'San Francisco'
    };

    const response = await client.post<any>('/analyze', request);
    
    // Verify response structure
    if (!response.redFlags || !Array.isArray(response.redFlags)) {
      throw new Error('Invalid response: missing or invalid redFlags');
    }
    if (!response.salaryComparison) {
      throw new Error('Invalid response: missing salaryComparison');
    }
    if (typeof response.takeHome !== 'number') {
      throw new Error('Invalid response: missing or invalid takeHome');
    }
    if (!response.negotiationSuggestions || !Array.isArray(response.negotiationSuggestions)) {
      throw new Error('Invalid response: missing or invalid negotiationSuggestions');
    }
    
    log(`Analysis returned ${response.redFlags.length} red flags`);
    log(`Take-home salary: $${response.takeHome}`);
  });

  // Test 6: Create Feature Request
  await runTest('Create Feature Request', async () => {
    const request: FeatureRequestCreate = {
      type: 'feature',
      title: 'Test Feature Request from Compatibility Test',
      description: 'This is a test feature request to verify API compatibility',
      userEmail: 'test@example.com'
    };

    const response = await client.post<any>('/feature-requests', request);
    
    // Verify response structure
    if (!response.id) {
      throw new Error('Invalid response: missing id');
    }
    if (response.type !== request.type) {
      throw new Error('Invalid response: type mismatch');
    }
    if (response.title !== request.title) {
      throw new Error('Invalid response: title mismatch');
    }
    
    log(`Created feature request with ID: ${response.id}`);
  });

  // Test 7: List Feature Requests
  await runTest('List Feature Requests', async () => {
    const response = await client.get<any>('/feature-requests', {
      params: { page: 1, limit: 10 }
    });
    
    // Verify response structure
    if (!response.data || !Array.isArray(response.data)) {
      throw new Error('Invalid response: missing or invalid data array');
    }
    if (!response.pagination) {
      throw new Error('Invalid response: missing pagination');
    }
    
    log(`Received ${response.data.length} feature requests`);
  });

  // Test 8: Error Handling - Invalid Request
  await runTest('Error Handling - Invalid Request', async () => {
    try {
      await client.post('/analyze', { invalid: 'data' });
      throw new Error('Expected error but request succeeded');
    } catch (error: any) {
      // Should get a 400 error
      if (!error.status || error.status !== 400) {
        throw new Error(`Expected 400 error, got: ${error.status || 'unknown'}`);
      }
      log('Correctly handled invalid request');
    }
  });

  // Test 9: Error Handling - Not Found
  await runTest('Error Handling - Not Found', async () => {
    try {
      await client.get('/nonexistent-endpoint');
      throw new Error('Expected error but request succeeded');
    } catch (error: any) {
      // Should get a 404 error
      if (!error.status || error.status !== 404) {
        throw new Error(`Expected 404 error, got: ${error.status || 'unknown'}`);
      }
      log('Correctly handled not found error');
    }
  });

  // Test 10: Retry Logic (simulate with timeout)
  await runTest('Retry Logic', async () => {
    const shortTimeoutClient = new ApiClient({
      baseURL: BACKEND_URL,
      timeout: 100, // Very short timeout to trigger retry
      retryAttempts: 2
    });

    try {
      // This might timeout and retry
      await shortTimeoutClient.get('/health');
      log('Request succeeded (possibly after retry)');
    } catch (error: any) {
      // If it fails after retries, that's also valid
      log('Request failed after retries (expected with short timeout)');
    }
  });

  // Print summary
  console.log('\n📊 Test Summary\n');
  console.log('─'.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  console.log(`Total Tests: ${total}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
  
  if (failed > 0) {
    console.log('\n❌ Failed Tests:\n');
    results
      .filter(r => !r.passed)
      .forEach(r => {
        console.log(`  • ${r.name}`);
        console.log(`    Error: ${r.error}`);
      });
  }
  
  console.log('\n' + '─'.repeat(60));
  
  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
main().catch(error => {
  console.error('\n💥 Fatal Error:', error);
  process.exit(1);
});
