// Generates orange Spelling Coach icons
const { createCanvas } = require('canvas');
const { writeFileSync } = require('fs');

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawIcon(size, maskable) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const s = size;
  const pad = maskable ? s * 0.12 : 0;

  // Background
  const grad = ctx.createLinearGradient(0, 0, s, s);
  grad.addColorStop(0, '#FF8C42');
  grad.addColorStop(1, '#FF4E11');
  ctx.fillStyle = grad;
  if (maskable) {
    ctx.fillRect(0, 0, s, s);
  } else {
    roundRect(ctx, 0, 0, s, s, s * 0.22);
    ctx.fill();
  }

  const wx = pad, wy = pad, ww = s - pad * 2, wh = s - pad * 2;
  const cx = wx + ww / 2, cy = wy + wh / 2;
  const u = ww / 8;

  // Notebook body
  const nbx = cx - u * 2.5;
  const nby = cy - u * 2.8;
  const nbw = u * 5.0;
  const nbh = u * 5.4;
  const nbr = u * 0.4;

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  roundRect(ctx, nbx + u * 0.12, nby + u * 0.12, nbw, nbh, nbr);
  ctx.fill();

  // white body
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, nbx, nby, nbw, nbh, nbr);
  ctx.fill();

  // left spine (cream)
  ctx.fillStyle = '#FFF8E1';
  roundRect(ctx, nbx, nby, u * 1.0, nbh, nbr);
  ctx.fill();

  // spine divider
  ctx.strokeStyle = '#FFE082';
  ctx.lineWidth = s * 0.005;
  ctx.beginPath();
  ctx.moveTo(nbx + u * 1.0, nby + nbr);
  ctx.lineTo(nbx + u * 1.0, nby + nbh - nbr);
  ctx.stroke();

  // Spiral rings
  const rings = 7;
  ctx.lineWidth = s * 0.016;
  for (let i = 0; i < rings; i++) {
    const ry = nby + (nbh / (rings + 1)) * (i + 1);
    const rx = nbx + u * 0.5;
    ctx.strokeStyle = '#78909C';
    ctx.beginPath();
    ctx.ellipse(rx, ry, u * 0.2, u * 0.28, 0, Math.PI * 0.15, Math.PI * 1.85);
    ctx.stroke();
    // hole
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(rx, ry, u * 0.12, u * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ruled lines
  ctx.strokeStyle = '#E3F2FD';
  ctx.lineWidth = s * 0.004;
  const lx1 = nbx + u * 1.2, lx2 = nbx + nbw - u * 0.3;
  for (let i = 0; i < 6; i++) {
    const ly = nby + u * 1.3 + u * 0.72 * i;
    if (ly < nby + nbh - u * 0.4) {
      ctx.beginPath(); ctx.moveTo(lx1, ly); ctx.lineTo(lx2, ly); ctx.stroke();
    }
  }

  // "SPELL" text
  const fs = u * 0.95;
  ctx.font = `900 ${fs}px Arial Black, Arial, sans-serif`;
  ctx.fillStyle = '#FF5722';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('SPELL', nbx + u * 1.3, nby + u * 1.1);

  // Checkboxes
  const cbSz = u * 0.52;
  const cbX = nbx + u * 1.3;
  for (let i = 0; i < 3; i++) {
    const cbCY = nby + u * 2.15 + i * u * 0.95;
    const cbY = cbCY - cbSz / 2;

    ctx.fillStyle = i === 0 ? '#FF5722' : '#FFFFFF';
    roundRect(ctx, cbX, cbY, cbSz, cbSz, s * 0.012);
    ctx.fill();
    ctx.strokeStyle = '#FF5722';
    ctx.lineWidth = s * 0.007;
    roundRect(ctx, cbX, cbY, cbSz, cbSz, s * 0.012);
    ctx.stroke();

    if (i === 0) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = s * 0.017;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cbX + cbSz * 0.18, cbCY);
      ctx.lineTo(cbX + cbSz * 0.42, cbCY + cbSz * 0.26);
      ctx.lineTo(cbX + cbSz * 0.82, cbCY - cbSz * 0.26);
      ctx.stroke();
    }

    // line next to checkbox
    ctx.strokeStyle = '#ECEFF1';
    ctx.lineWidth = s * 0.006;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(cbX + cbSz + u * 0.18, cbCY);
    ctx.lineTo(lx2, cbCY);
    ctx.stroke();
  }

  // Pencil
  ctx.save();
  const px = nbx + nbw - u * 0.3;
  const py = nby + u * 0.2;
  ctx.translate(px, py);
  ctx.rotate(Math.PI / 6); // tilt

  const pw = u * 0.42;
  const ph = u * 3.2;

  // eraser
  ctx.fillStyle = '#F48FB1';
  roundRect(ctx, -pw / 2, -ph / 2, pw, ph * 0.11, pw * 0.2);
  ctx.fill();

  // eraser band
  ctx.fillStyle = '#BDBDBD';
  ctx.fillRect(-pw / 2, -ph / 2 + ph * 0.11, pw, ph * 0.035);

  // body
  const pGrad = ctx.createLinearGradient(-pw / 2, 0, pw / 2, 0);
  pGrad.addColorStop(0, '#FFD54F');
  pGrad.addColorStop(0.6, '#FFCA28');
  pGrad.addColorStop(1, '#FFB300');
  ctx.fillStyle = pGrad;
  ctx.fillRect(-pw / 2, -ph / 2 + ph * 0.145, pw, ph * 0.62);

  // wood tip
  ctx.fillStyle = '#D4A86A';
  ctx.beginPath();
  ctx.moveTo(-pw / 2, ph * 0.14);
  ctx.lineTo(pw / 2, ph * 0.14);
  ctx.lineTo(0, ph * 0.38);
  ctx.closePath(); ctx.fill();

  // graphite
  ctx.fillStyle = '#37474F';
  ctx.beginPath();
  ctx.moveTo(-pw * 0.14, ph * 0.32);
  ctx.lineTo(pw * 0.14, ph * 0.32);
  ctx.lineTo(0, ph * 0.38);
  ctx.closePath(); ctx.fill();

  ctx.restore();

  return canvas;
}

function save(canvas, path) {
  const buf = canvas.toBuffer('image/png');
  writeFileSync(path, buf);
  console.log(`Wrote ${path} (${(buf.length / 1024).toFixed(1)} KB)`);
}

save(drawIcon(192, false), 'public/icons/icon-192.png');
save(drawIcon(512, false), 'public/icons/icon-512.png');
save(drawIcon(512, true),  'public/icons/icon-512-maskable.png');
save(drawIcon(180, false), 'public/icons/apple-touch-icon.png');
console.log('Done!');
