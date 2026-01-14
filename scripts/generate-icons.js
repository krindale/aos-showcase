#!/usr/bin/env node

/**
 * Generate PWA icons for Age of Steam Showcase
 * Creates icons with steam train motif in brand colors
 */

const fs = require('fs');
const { execSync } = require('child_process');

// Brand colors from design system
const BACKGROUND = '#0a0a0f';
const ACCENT_GOLD = '#d4a853';
const STEAM_RED = '#e63946';

// Icon sizes needed for PWA
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

// Create SVG icon with steam train motif
function createSVG(size) {
  const center = size / 2;
  const scale = size / 512; // Base design on 512px

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="${size}" height="${size}" fill="${BACKGROUND}" rx="${size * 0.15}"/>

  <!-- Decorative hex pattern (subtle) -->
  <defs>
    <pattern id="hexPattern" x="0" y="0" width="${40 * scale}" height="${35 * scale}" patternUnits="userSpaceOnUse">
      <path d="M ${10 * scale} 0 L ${20 * scale} 0 L ${25 * scale} ${8.66 * scale} L ${20 * scale} ${17.32 * scale} L ${10 * scale} ${17.32 * scale} L ${5 * scale} ${8.66 * scale} Z"
            fill="none" stroke="${ACCENT_GOLD}" stroke-width="${0.5 * scale}" opacity="0.1"/>
    </pattern>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#hexPattern)"/>

  <!-- Steam train silhouette (simplified iconic design) -->
  <g transform="translate(${center}, ${center})">
    <!-- Smoke/steam (circles) -->
    <circle cx="${-80 * scale}" cy="${-120 * scale}" r="${30 * scale}" fill="${ACCENT_GOLD}" opacity="0.3"/>
    <circle cx="${-40 * scale}" cy="${-140 * scale}" r="${25 * scale}" fill="${ACCENT_GOLD}" opacity="0.4"/>
    <circle cx="${0 * scale}" cy="${-150 * scale}" r="${20 * scale}" fill="${ACCENT_GOLD}" opacity="0.5"/>

    <!-- Main locomotive body -->
    <rect x="${-120 * scale}" y="${-60 * scale}" width="${180 * scale}" height="${80 * scale}"
          fill="${ACCENT_GOLD}" rx="${8 * scale}"/>

    <!-- Smokestack -->
    <rect x="${-90 * scale}" y="${-100 * scale}" width="${35 * scale}" height="${45 * scale}"
          fill="${ACCENT_GOLD}"/>
    <rect x="${-95 * scale}" y="${-110 * scale}" width="${45 * scale}" height="${15 * scale}"
          fill="${ACCENT_GOLD}" rx="${3 * scale}"/>

    <!-- Cabin/cab -->
    <rect x="${20 * scale}" y="${-80 * scale}" width="${60 * scale}" height="${60 * scale}"
          fill="${ACCENT_GOLD}"/>
    <rect x="${25 * scale}" y="${-70 * scale}" width="${20 * scale}" height="${20 * scale}"
          fill="${BACKGROUND}" opacity="0.8"/>

    <!-- Wheels (2 visible) -->
    <circle cx="${-80 * scale}" cy="${25 * scale}" r="${35 * scale}" fill="${BACKGROUND}"
            stroke="${ACCENT_GOLD}" stroke-width="${6 * scale}"/>
    <circle cx="${20 * scale}" cy="${25 * scale}" r="${35 * scale}" fill="${BACKGROUND}"
            stroke="${ACCENT_GOLD}" stroke-width="${6 * scale}"/>

    <!-- Wheel details -->
    <circle cx="${-80 * scale}" cy="${25 * scale}" r="${8 * scale}" fill="${ACCENT_GOLD}"/>
    <circle cx="${20 * scale}" cy="${25 * scale}" r="${8 * scale}" fill="${ACCENT_GOLD}"/>

    <!-- Track lines (simplified) -->
    <line x1="${-150 * scale}" y1="${60 * scale}" x2="${150 * scale}" y2="${60 * scale}"
          stroke="${ACCENT_GOLD}" stroke-width="${4 * scale}" opacity="0.6"/>
    <line x1="${-150 * scale}" y1="${70 * scale}" x2="${150 * scale}" y2="${70 * scale}"
          stroke="${ACCENT_GOLD}" stroke-width="${4 * scale}" opacity="0.6"/>

    <!-- Accent detail (red steam/fire) -->
    <circle cx="${-100 * scale}" cy="${-50 * scale}" r="${12 * scale}" fill="${STEAM_RED}" opacity="0.6"/>
  </g>
</svg>`;
}

// Generate all icon sizes
console.log('Generating PWA icons for Age of Steam Showcase...\n');

SIZES.forEach(size => {
  const svgContent = createSVG(size);
  const svgPath = `./public/icons/icon-${size}x${size}.svg`;
  const pngPath = `./public/icons/icon-${size}x${size}.png`;

  // Write SVG
  fs.writeFileSync(svgPath, svgContent);
  console.log(`✓ Created SVG: icon-${size}x${size}.svg`);

  // Convert SVG to PNG using sips (macOS built-in tool)
  try {
    execSync(`/usr/bin/sips -s format png "${svgPath}" --out "${pngPath}" 2>/dev/null`);
    // Clean up SVG
    fs.unlinkSync(svgPath);
    console.log(`✓ Converted to PNG: icon-${size}x${size}.png`);
  } catch (error) {
    console.error(`✗ Failed to convert icon-${size}x${size}.png:`, error.message);
  }
});

console.log('\n✓ All PWA icons generated successfully!');
console.log(`\nGenerated ${SIZES.length} icons in ./public/icons/`);
