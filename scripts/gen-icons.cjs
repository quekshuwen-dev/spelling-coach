// Generates orange Spelling Coach PWA icons
const { createCanvas } = require('canvas');
const { writeFileSync } = require('fs');

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawIcon(size, maskable) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const s = size;

  // ── Background ──────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, s, s);
  bg.addColorStop(0, '#FF9A3C');
  bg.addColorStop(1, '#FF4500');
  ctx.fillStyle = bg;
  if (maskable) {
    ctx.fillRect(0, 0, s, s);
  } else {
    roundRect(ctx, 0, 0, s, s, s * 0.20);
    ctx.fill();
  }

  // Safe zone for maskable (80% of canvas)
  const safe = maskable ? s * 0.10 : 0;
  const sw = s - safe * 2;
  const cx = safe + sw / 2;
  const cy = safe + sw / 2;
  const u = sw / 10; // base unit

  // ── Book / Notebook body ─────────────────────────────────
  const bx = cx - u * 3.0;
  const by = cy - u * 3.8;
  const bw = u * 6.0;
  const bh = u * 7.2;
  const br = u * 0.5;

  // drop shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = u * 0.8;
  ctx.shadowOffsetX = u * 0.2;
  ctx.shadowOffsetY = u * 0.4;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, bx, by, bw, bh, br);
  ctx.fill();
  ctx.restore();

  // white page
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, bx, by, bw, bh, br);
  ctx.fill();

  // ── Spine (left strip) ───────────────────────────────────
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, bx, by, u * 1.4, bh, br);
  ctx.clip();
  ctx.fillStyle = '#FFF3CD';
  ctx.fillRect(bx, by, u * 1.4, bh);
  ctx.restore();

  // spine right border
  ctx.strokeStyle = '#FFCC70';
  ctx.lineWidth = s * 0.004;
  ctx.beginPath();
  ctx.moveTo(bx + u * 1.4, by + br);
  ctx.lineTo(bx + u * 1.4, by + bh - br);
  ctx.stroke();

  // ── Spiral rings ─────────────────────────────────────────
  const nRings = 8;
  for (let i = 0; i < nRings; i++) {
    const ry = by + (bh / (nRings + 1)) * (i + 1);
    const rx = bx + u * 0.70;

    // ring arc (grey)
    ctx.strokeStyle = '#90A4AE';
    ctx.lineWidth = s * 0.013;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(rx, ry, u * 0.32, u * 0.40, 0, Math.PI * 0.05, Math.PI * 1.95);
    ctx.stroke();

    // hole (orange bg color)
    ctx.fillStyle = '#FF7A20';
    ctx.beginPath();
    ctx.ellipse(rx, ry, u * 0.16, u * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── "SPELL" heading ──────────────────────────────────────
  const tx = bx + u * 1.7;
  const ty = by + u * 1.3;
  ctx.font = `900 ${u * 1.25}px "Arial Black", Arial, sans-serif`;
  ctx.fillStyle = '#FF5722';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('SPELL', tx, ty);

  // ── Ruled lines ──────────────────────────────────────────
  ctx.strokeStyle = '#E8F4FD';
  ctx.lineWidth = s * 0.004;
  const lx1 = bx + u * 1.65;
  const lx2 = bx + bw - u * 0.4;
  const lineStart = ty + u * 1.55;
  for (let i = 0; i < 5; i++) {
    const ly = lineStart + i * u * 0.90;
    if (ly < by + bh - u * 0.5) {
      ctx.beginPath();
      ctx.moveTo(lx1, ly);
      ctx.lineTo(lx2, ly);
      ctx.stroke();
    }
  }

  // ── Checkboxes + word lines ──────────────────────────────
  const cbSz = u * 0.70;
  const cbX = bx + u * 1.65;
  const cbLineX2 = lx2;

  for (let i = 0; i < 3; i++) {
    const cbMidY = lineStart + u * 0.35 + i * u * 0.90;
    const cbTop = cbMidY - cbSz / 2;

    // checkbox fill
    ctx.fillStyle = i === 0 ? '#FF5722' : '#FFFFFF';
    roundRect(ctx, cbX, cbTop, cbSz, cbSz, s * 0.018);
    ctx.fill();

    // checkbox border
    ctx.strokeStyle = '#FF5722';
    ctx.lineWidth = s * 0.009;
    roundRect(ctx, cbX, cbTop, cbSz, cbSz, s * 0.018);
    ctx.stroke();

    // checkmark on first box
    if (i === 0) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = s * 0.022;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cbX + cbSz * 0.18, cbMidY);
      ctx.lineTo(cbX + cbSz * 0.44, cbMidY + cbSz * 0.28);
      ctx.lineTo(cbX + cbSz * 0.82, cbMidY - cbSz * 0.28);
      ctx.stroke();
    }

    // word line beside checkbox
    ctx.strokeStyle = '#D0E8F8';
    ctx.lineWidth = s * 0.005;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(cbX + cbSz + u * 0.22, cbMidY);
    ctx.lineTo(cbLineX2, cbMidY);
    ctx.stroke();
  }

  // ── Pencil (overlapping top-right corner) ────────────────
  ctx.save();
  // pivot at top-right of book, tilt 35°
  const pivX = bx + bw + u * 0.1;
  const pivY = by - u * 0.3;
  ctx.translate(pivX, pivY);
  ctx.rotate(Math.PI * 0.20);

  const pw = u * 0.52;
  const ph = u * 4.0;
  const halfW = pw / 2;

  // eraser (pink cap)
  ctx.fillStyle = '#F48FB1';
  roundRect(ctx, -halfW, -ph / 2, pw, ph * 0.10, halfW * 0.8);
  ctx.fill();

  // ferrule (silver band)
  ctx.fillStyle = '#B0BEC5';
  ctx.fillRect(-halfW, -ph / 2 + ph * 0.10, pw, ph * 0.04);

  // body gradient (yellow pencil)
  const pg = ctx.createLinearGradient(-halfW, 0, halfW, 0);
  pg.addColorStop(0,   '#FFE082');
  pg.addColorStop(0.5, '#FFD54F');
  pg.addColorStop(1,   '#FFC107');
  ctx.fillStyle = pg;
  ctx.fillRect(-halfW, -ph / 2 + ph * 0.14, pw, ph * 0.60);

  // wood sharpening cone
  ctx.fillStyle = '#D4956A';
  ctx.beginPath();
  ctx.moveTo(-halfW, ph * 0.14);
  ctx.lineTo( halfW, ph * 0.14);
  ctx.lineTo(0, ph * 0.40);
  ctx.closePath();
  ctx.fill();

  // graphite tip
  ctx.fillStyle = '#37474F';
  ctx.beginPath();
  ctx.moveTo(-halfW * 0.28, ph * 0.34);
  ctx.lineTo( halfW * 0.28, ph * 0.34);
  ctx.lineTo(0, ph * 0.40);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  return canvas;
}

function save(canvas, path) {
  const buf = canvas.toBuffer('image/png');
  writeFileSync(path, buf);
  console.log(`✓ ${path}  (${(buf.length / 1024).toFixed(1)} KB)`);
}

save(drawIcon(192, false), 'public/icons/icon-192.png');
save(drawIcon(512, false), 'public/icons/icon-512.png');
save(drawIcon(512, true),  'public/icons/icon-512-maskable.png');
save(drawIcon(180, false), 'public/icons/apple-touch-icon.png');
console.log('Done!');
