// Resize the uploaded Spelling Coach icon to all PWA sizes
const { createCanvas, loadImage } = require('canvas');
const { writeFileSync } = require('fs');

const SRC = '/root/.claude/uploads/b5a2a503-49f6-5a77-b0eb-c9c41732348f/01bb5ac8-image.jpg';

async function makeIcon(img, size, maskable) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  if (maskable) {
    // Maskable: fill full square (no rounded corners — OS clips it)
    ctx.drawImage(img, 0, 0, size, size);
  } else {
    // Regular: rounded corners matching iOS/Android style
    const r = size * 0.20;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(size, 0, size, size, r);
    ctx.arcTo(size, size, 0, size, r);
    ctx.arcTo(0, size, 0, 0, r);
    ctx.arcTo(0, 0, size, 0, r);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, 0, 0, size, size);
  }

  return canvas;
}

async function main() {
  const img = await loadImage(SRC);
  console.log(`Source: ${img.width}x${img.height}`);

  const sizes = [
    { path: 'public/icons/icon-192.png',          size: 192, maskable: false },
    { path: 'public/icons/icon-512.png',           size: 512, maskable: false },
    { path: 'public/icons/icon-512-maskable.png',  size: 512, maskable: true  },
    { path: 'public/icons/apple-touch-icon.png',   size: 180, maskable: false },
  ];

  for (const { path, size, maskable } of sizes) {
    const canvas = await makeIcon(img, size, maskable);
    const buf = canvas.toBuffer('image/png');
    writeFileSync(path, buf);
    console.log(`✓ ${path}  (${(buf.length / 1024).toFixed(1)} KB)`);
  }
  console.log('Done!');
}

main().catch(e => { console.error(e); process.exit(1); });
