#!/bin/bash

echo "🚀 Starting optimized build for Render..."

# Set environment variables
export NODE_ENV=production
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

echo "📦 Installing dependencies with npm ci..."
npm ci --only=production --no-audit --no-fund --prefer-offline

echo "✅ Build completed successfully!"
