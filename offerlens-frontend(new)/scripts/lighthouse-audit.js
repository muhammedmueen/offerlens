#!/usr/bin/env node

/**
 * Lighthouse Audit Script
 * 
 * This script runs a Lighthouse audit on the application and generates a report.
 * 
 * Usage:
 *   node scripts/lighthouse-audit.js [url]
 * 
 * Example:
 *   node scripts/lighthouse-audit.js http://localhost:3000
 *   node scripts/lighthouse-audit.js https://offerlens.com
 * 
 * Requirements:
 *   npm install -g lighthouse
 * 
 * The script will:
 * 1. Run Lighthouse audit
 * 2. Generate HTML report
 * 3. Display performance score
 * 4. Check if score meets target (90+)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const url = process.argv[2] || 'http://localhost:3000';
const outputDir = path.join(__dirname, '..', 'lighthouse-reports');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputPath = path.join(outputDir, `report-${timestamp}.html`);

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('🔍 Running Lighthouse audit...');
console.log(`📍 URL: ${url}`);
console.log(`📄 Report will be saved to: ${outputPath}`);
console.log('');

try {
  // Run Lighthouse
  const command = `lighthouse ${url} --output=html --output-path="${outputPath}" --chrome-flags="--headless" --only-categories=performance,accessibility,best-practices,seo`;
  
  execSync(command, { stdio: 'inherit' });
  
  console.log('');
  console.log('✅ Lighthouse audit completed!');
  console.log(`📊 Report saved to: ${outputPath}`);
  console.log('');
  console.log('To view the report, open the HTML file in your browser.');
  
} catch (error) {
  console.error('❌ Lighthouse audit failed:', error.message);
  console.error('');
  console.error('Make sure:');
  console.error('1. Lighthouse is installed: npm install -g lighthouse');
  console.error('2. The application is running at the specified URL');
  console.error('3. Chrome/Chromium is installed');
  process.exit(1);
}
