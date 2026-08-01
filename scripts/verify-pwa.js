#!/usr/bin/env node
/**
 * PWA Verification Script
 * Automated checks for PWA setup and configuration
 */

const fs = require('fs');
const path = require('path');

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function checkFile(filePath, description) {
  const fullPath = path.join(__dirname, '..', filePath);
  const exists = fs.existsSync(fullPath);
  const status = exists ? '✅ PASS' : '❌ FAIL';
  log(`${status}: ${description}`, exists ? 'green' : 'red');
  return exists;
}

function checkJsonContent(filePath, checks, description) {
  try {
    const fullPath = path.join(__dirname, '..', filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    const json = JSON.parse(content);

    let allPassed = true;
    for (const [key, expectedValue] of Object.entries(checks)) {
      const actualValue = key.split('.').reduce((obj, k) => obj?.[k], json);
      const passed = expectedValue === undefined ? !!actualValue : actualValue === expectedValue;
      allPassed = allPassed && passed;

      if (!passed) {
        log(`  ❌ ${key}: expected ${expectedValue}, got ${actualValue}`, 'red');
      }
    }

    if (allPassed) {
      log(`✅ PASS: ${description}`, 'green');
    }
    return allPassed;
  } catch (error) {
    log(`❌ FAIL: ${description} - ${error.message}`, 'red');
    return false;
  }
}

function checkFileContent(filePath, searchStrings, description) {
  try {
    const fullPath = path.join(__dirname, '..', filePath);
    const content = fs.readFileSync(fullPath, 'utf8');

    let allFound = true;
    for (const searchString of searchStrings) {
      const found = content.includes(searchString);
      allFound = allFound && found;

      if (!found) {
        log(`  ❌ Missing: ${searchString}`, 'red');
      }
    }

    if (allFound) {
      log(`✅ PASS: ${description}`, 'green');
    }
    return allFound;
  } catch (error) {
    log(`❌ FAIL: ${description} - ${error.message}`, 'red');
    return false;
  }
}

function countFiles(dirPath, pattern) {
  try {
    const fullPath = path.join(__dirname, '..', dirPath);
    const files = fs.readdirSync(fullPath);
    return files.filter(f => f.match(pattern)).length;
  } catch (error) {
    return 0;
  }
}

// Run verification checks
log('\n=== PWA Verification Script ===\n', 'blue');

let totalChecks = 0;
let passedChecks = 0;

// 1. Check manifest.json exists and is valid
log('📋 Checking manifest.json...', 'yellow');
totalChecks++;
// start_url·아이콘 경로는 **manifest 자기 URL 기준 상대**로 둔다(2026-08-01) —
// 배포 basePath가 바뀌어도 manifest를 고칠 필요가 없다. 따라서 여기서도 './'를 기대한다.
// theme_color는 크림+버밀리언 리뉴얼 이후 #c04a2b — 옛 골드(#d4a853) 기대값은 오탐이었다.
if (checkJsonContent('out/manifest.json', {
  'name': 'Age of Steam Showcase',
  'display': 'standalone',
  'start_url': './',
  'theme_color': '#c04a2b',
}, 'Manifest configuration')) {
  passedChecks++;
}

// 2. Check service worker exists
log('\n⚙️  Checking service worker...', 'yellow');
totalChecks++;
if (checkFile('out/sw.js', 'Service worker file')) {
  passedChecks++;
}

totalChecks++;
// BASE_PATH는 sw.js가 self.location에서 런타임 유도하므로 '/aos-showcase' 리터럴이
// 더는 파일에 없다 — 대신 유도 로직이 살아 있는지를 본다.
if (checkFileContent('out/sw.js', [
  'install',
  'activate',
  'fetch',
  'CACHE_VERSION',
  'BASE_PATH',
], 'Service worker implementation')) {
  passedChecks++;
}

// 3. Check PWA icons
log('\n🎨 Checking PWA icons...', 'yellow');
const iconCount = countFiles('out/icons', /icon-\d+x\d+\.png/);
totalChecks++;
if (iconCount === 8) {
  log(`✅ PASS: All 8 PWA icons present`, 'green');
  passedChecks++;
} else {
  log(`❌ FAIL: Expected 8 icons, found ${iconCount}`, 'red');
}

// 4. Check layout.tsx has PWA components
log('\n🏗️  Checking layout integration...', 'yellow');
totalChecks++;
if (checkFileContent('src/app/layout.tsx', [
  'manifest',
  'OfflineIndicator',
  'ServiceWorkerRegistration',
], 'Layout PWA integration')) {
  passedChecks++;
}

// 5. Check service worker registration
log('\n📝 Checking service worker registration...', 'yellow');
totalChecks++;
if (checkFileContent('src/app/service-worker-registration.tsx', [
  'navigator.serviceWorker',
  'useEffect',
  'register',
], 'Service worker registration component')) {
  passedChecks++;
}

// 6. Check offline indicator
log('\n📶 Checking offline indicator...', 'yellow');
totalChecks++;
if (checkFileContent('src/components/OfflineIndicator.tsx', [
  'navigator.onLine',
  'online',
  'offline',
  'motion',
], 'Offline indicator component')) {
  passedChecks++;
}

// 7. Check state persistence
log('\n💾 Checking state persistence...', 'yellow');
totalChecks++;
if (checkFileContent('src/store/gameStore.ts', [
  'persist',
  'zustand/middleware',
  'age-of-steam-game',
], 'Zustand persist middleware')) {
  passedChecks++;
}

// 8. Check PWA utilities
log('\n🔧 Checking PWA utilities...', 'yellow');
totalChecks++;
if (checkFileContent('src/utils/pwaUtils.ts', [
  'registerServiceWorker',
  'isOnline',
  'addNetworkStatusListener',
  'checkForUpdates',
], 'PWA utility functions')) {
  passedChecks++;
}

// Summary
log('\n=== Verification Summary ===\n', 'blue');
const percentage = Math.round((passedChecks / totalChecks) * 100);
log(`Total Checks: ${totalChecks}`, 'yellow');
log(`Passed: ${passedChecks}`, 'green');
log(`Failed: ${totalChecks - passedChecks}`, 'red');
log(`Success Rate: ${percentage}%`, percentage === 100 ? 'green' : 'yellow');

if (passedChecks === totalChecks) {
  log('\n🎉 All automated PWA checks passed!', 'green');
  log('✅ PWA setup is complete and ready for manual testing', 'green');
  process.exit(0);
} else {
  log('\n⚠️  Some checks failed. Please review and fix issues.', 'red');
  process.exit(1);
}
