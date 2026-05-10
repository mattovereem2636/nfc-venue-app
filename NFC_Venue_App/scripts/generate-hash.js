#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// scripts/generate-hash.js
// Run this once to generate your admin passcode hash for the .env file
//
// Usage:
//   node scripts/generate-hash.js
//   node scripts/generate-hash.js "myPasscodeHere"
// ─────────────────────────────────────────────────────────────────────────────

const bcrypt   = require('bcryptjs');
const readline = require('readline');

const SALT_ROUNDS = 12;

async function generateHash(passcode) {
  const hash = await bcrypt.hash(passcode, SALT_ROUNDS);
  console.log('\n✅ Passcode hash generated.\n');
  console.log('Copy this line into your .env file:\n');
  console.log(`ADMIN_PASSCODE_HASH=${hash}`);
  console.log('\nKeep your passcode safe — it cannot be recovered from the hash.\n');
}

const arg = process.argv[2];

if (arg) {
  generateHash(arg);
} else {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Enter your desired admin passcode: ', (passcode) => {
    rl.close();
    if (!passcode || passcode.length < 8) {
      console.error('❌ Passcode must be at least 8 characters.');
      process.exit(1);
    }
    generateHash(passcode);
  });
}
