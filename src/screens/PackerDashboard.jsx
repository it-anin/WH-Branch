import { useRef, useEffect, useState } from 'react';

const PACKER_COLORS = ['#e8692b', '#2b6ce8', '#5c8a3a', '#d94a8a'];

const extractZone = (loc) => {
  const m = String(loc || '').match(/^([A-Za-z]+)/);
  return m ? m[1].toUpperCase() : '?';
};

// ── ผังคลังจริง (ตามที่ออกแบบไว้) ──
// A ชิดผนังซ้าย (เข้าจากขวา) · คู่ B-C/D-E/F-G/H-I/J-K หลังชนกัน · ทางเดินหลักด้านล่าง · ประตูกลาง
const ZONES_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
const ZONE_AISLE = { A: 0, B: 0, C: 1, D: 1, E: 2, F: 2, G: 3, H: 3, I: 4, J: 4, K: 5 };
const ZONE_LEVELS = { A: 5 }; // ที่เหลือ 7 ชั้น
// โซนนอกอาคาร (พื้นที่กว้าง) — เดินออกประตูไปถึง
const OUTSIDE_ZONES = ['L', 'M', 'N', 'S', 'COOL'];
const OUTSIDE_SET = new Set(OUTSIDE_ZONES);

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function buildLayout(w, H, nPackers) {
  const pad = 14;
  const shelfTop = 24;
  const roomBottom = Math.round(H * 0.6);   // ผนังล่างของห้องคลัง
  const mainAisleY = roomBottom - 20;       // ทางเดินหลัก (ในห้อง)
  const shelfH = mainAisleY - 14 - shelfTop;
  const doorX = w / 2;

  const segs = [
    { t: 's', z: 'A' }, { t: 'a', id: 0 },
    { t: 's', z: 'B' }, { t: 's', z: 'C' }, { t: 'a', id: 1 },
    { t: 's', z: 'D' }, { t: 's', z: 'E' }, { t: 'a', id: 2 },
    { t: 's', z: 'F' }, { t: 's', z: 'G' }, { t: 'a', id: 3 },
    { t: 's', z: 'H' }, { t: 's', z: 'I' }, { t: 'a', id: 4 },
    { t: 's', z: 'J' }, { t: 's', z: 'K' }, { t: 'a', id: 5 },
  ];
  const nShelf = segs.filter(s => s.t === 's').length; // 11
  const nAisle = segs.filter(s => s.t === 'a').length; // 6
  const avail = w - pad * 2;
  const SW = avail / (nShelf + nAisle * 0.8);
  const AW = SW * 0.8;

  let x = pad;
  const shelfRects = {}, aisleX = {};
  segs.forEach(s => {
    if (s.t === 's') { shelfRects[s.z] = { x, y: shelfTop, w: SW - 3, h: shelfH }; x += SW; }
    else { aisleX[s.id] = x + AW / 2; x += AW; }
  });

  const standPos = {};
  ZONES_ORDER.forEach(z => {
    const r = shelfRects[z]; if (!r) return;
    const ax = aisleX[ZONE_AISLE[z]];
    standPos[z] = { x: ax + (r.x < ax ? -6 : 6), y: shelfTop + shelfH * 0.52 };
  });

  // ── นอกอาคาร: โซน L, M, N, S, COOL (พื้นที่กว้าง) ──
  const areaRects = {};
  const oy = roomBottom + 18;
  const oh = H - oy - 12;
  const ogap = 12;
  const ow = (avail - ogap * (OUTSIDE_ZONES.length - 1)) / OUTSIDE_ZONES.length;
  OUTSIDE_ZONES.forEach((z, i) => {
    const ox = pad + i * (ow + ogap);
    areaRects[z] = { x: ox, y: oy, w: ow, h: oh };
    standPos[z] = { x: ox + ow / 2, y: oy + oh * 0.58 };
  });

  const home = [];
  for (let i = 0; i < nPackers; i++) {
    home.push({ x: pad + 40 + i * ((avail - 80) / Math.max(1, nPackers - 1)), y: mainAisleY });
  }
  return { shelfRects, areaRects, standPos, aisleX, mainAisleY, shelfTop, shelfH, roomBottom, doorX, home };
}

function drawArea(ctx, z, r, active) {
  const cold = z === 'COOL';
  ctx.fillStyle = active ? (cold ? '#bcd6e2' : '#d2dcc0') : '#d2cdbd';
  roundRect(ctx, r.x, r.y, r.w, r.h, 8); ctx.fill();
  ctx.strokeStyle = active ? (cold ? '#6f9fb2' : '#93a974') : '#b3ab95';
  ctx.lineWidth = 2; roundRect(ctx, r.x, r.y, r.w, r.h, 8); ctx.stroke();
  // พาเลท/กล่องวางพื้น
  const bw = 13, gap = 5;
  const cols = Math.max(1, Math.floor((r.w - 16) / (bw + gap)));
  for (let i = 0; i < cols * 2; i++) {
    const cx = r.x + 10 + (i % cols) * (bw + gap);
    const cy = r.y + r.h - 24 - Math.floor(i / cols) * (bw + gap);
    ctx.fillStyle = cold ? '#9fc2d0' : '#c6b083';
    ctx.fillRect(cx, cy, bw, bw);
  }
  // ป้ายโซน
  ctx.fillStyle = '#2a3530';
  ctx.font = 'bold 14px "JetBrains Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(z, r.x + r.w / 2, r.y + 15);
  ctx.textBaseline = 'alphabetic';
}

function drawShelf(ctx, z, r, active) {
  const levels = ZONE_LEVELS[z] || 7;
  const tilesReady = typeof tilemapImg !== 'undefined' && tilemapImg.complete && tilemapImg.naturalWidth > 0;

  if (tilesReady) {
    // วาดด้วย tile ลังไม้ (crate) เป็น grid
    fillTiles(ctx, TILES.crate, r.x, r.y, r.w, r.h);
    if (!active) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(r.x, r.y, r.w, r.h); }
  } else {
    // Fallback (flat colors)
    ctx.fillStyle = active ? '#d8b988' : '#cdc2ac';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = active ? '#b3905c' : '#ada085';
    ctx.fillRect(r.x, r.y, r.w, 5);
    ctx.fillStyle = '#7c6038';
    ctx.fillRect(r.x, r.y + r.h - 4, r.w, 4);
    ctx.strokeStyle = 'rgba(90,70,40,0.35)'; ctx.lineWidth = 1;
    for (let i = 1; i < levels; i++) {
      const yy = r.y + (r.h / levels) * i;
      ctx.beginPath(); ctx.moveTo(r.x, yy); ctx.lineTo(r.x + r.w, yy); ctx.stroke();
    }
  }
  // ป้ายโซน (วงกลมน้ำเงิน) บนหัวชั้น — แสดงทั้ง 2 mode
  const cx = r.x + r.w / 2, cy = r.y + 14, rad = 11;
  ctx.fillStyle = '#1f4e8c';
  ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(z, cx, cy + 0.5);
  ctx.textBaseline = 'alphabetic';
}

// ─── Sprite-based avatars (PixelLab generated, 8-direction, 68×68, 4-frame walk) ───
// โครงสร้าง:
//   public/characters/{empCode}/{DIR}.png            — idle pose (8 ทิศ)
//   public/characters/{empCode}/walking/{DIR}/frame_000..003.png — walk cycle 4 frames × 8 ทิศ
const SPRITE_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const SPRITE_SIZE = 68;
const SPRITE_FOOT_PAD = 14; // padding ว่างใต้ฝ่าเท้าใน canvas 68×68 ของ PixelLab → ใช้ดันลงให้ติดเงา
const WALK_FRAMES = 4;
const PACKER_SPRITE_DIRS = {
  'EMP-01': '/characters/emp-01',
  // 'EMP-02': '/characters/emp-02',
  // 'EMP-03': '/characters/emp-03',
  // 'EMP-04': '/characters/emp-04',
};
const spriteCache = {};      // { [empCode]: { idle: { [dir]: Image }, walk: { [dir]: [Image x 4] } } }
Object.entries(PACKER_SPRITE_DIRS).forEach(([code, path]) => {
  const idle = {}, walk = {};
  SPRITE_DIRS.forEach(d => {
    const img = new Image(); img.src = `${path}/${d}.png`; idle[d] = img;
    walk[d] = Array.from({ length: WALK_FRAMES }, (_, i) => {
      const w = new Image(); w.src = `${path}/walking/${d}/frame_${String(i).padStart(3, '0')}.png`; return w;
    });
  });
  spriteCache[code] = { idle, walk };
});

// คำนวณทิศ 8 ช่องจากเวกเตอร์การเคลื่อนที่ (dx, dy ในระบบ canvas: dy+ = ลง)
function dirFromVec(dx, dy) {
  const deg = Math.atan2(dy, dx) * 180 / Math.PI; // -180..180  (0=E, 90=S, -90=N)
  if (deg >= -22.5 && deg < 22.5) return 'E';
  if (deg >= 22.5 && deg < 67.5) return 'SE';
  if (deg >= 67.5 && deg < 112.5) return 'S';
  if (deg >= 112.5 && deg < 157.5) return 'SW';
  if (deg >= 157.5 || deg < -157.5) return 'W';
  if (deg >= -157.5 && deg < -112.5) return 'NW';
  if (deg >= -112.5 && deg < -67.5) return 'N';
  return 'NE'; // -67.5..-22.5
}

function getSprite(ch) {
  const set = spriteCache[ch.code];
  if (!set) return null;
  const dir = ch.dir || 'S';
  // กำลังเดิน (มี waypoint) → ใช้ walk frame, ไม่งั้นใช้ idle
  const walking = ch.wp && ch.wp.length > 0;
  const img = walking
    ? set.walk[dir][ch.frame % WALK_FRAMES]
    : set.idle[dir];
  return (img && img.complete && img.naturalWidth > 0) ? img : null;
}

function drawSpriteChar(ctx, ch, img) {
  const x = Math.round(ch.x), y = Math.round(ch.y);
  const headTop = y - SPRITE_SIZE + SPRITE_FOOT_PAD + 4;

  // เงา
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(x, y + 2, 13, 4, 0, 0, Math.PI * 2); ctx.fill();
  // ตัวการ์ตูน — ดันลง SPRITE_FOOT_PAD เพื่อให้ฝ่าเท้าจริงติดเงา (PixelLab canvas มี padding ว่างด้านล่าง)
  ctx.drawImage(img, x - SPRITE_SIZE / 2, y - SPRITE_SIZE + SPRITE_FOOT_PAD);
  // ป๊อปอัพ +1
  if (ch.pop > 0) {
    const py = headTop - 12 - (1 - ch.pop) * 14;
    ctx.globalAlpha = Math.min(1, ch.pop * 1.5);
    ctx.fillStyle = '#caa472'; ctx.fillRect(x - 6, py - 6, 12, 12);
    ctx.fillStyle = '#8a6a3f'; ctx.fillRect(x - 6, py - 6, 12, 3);
    ctx.fillStyle = '#2e7d32'; ctx.font = 'bold 13px "JetBrains Mono"';
    ctx.textAlign = 'left'; ctx.fillText('+1', x + 8, py + 4);
    ctx.globalAlpha = 1;
  }
  // ชื่อ
  ctx.fillStyle = '#3a2f1e';
  ctx.font = 'bold 12px "Patrick Hand", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(ch.name, x, headTop - 4);
}

// ตัวการ์ตูนสไตล์ Gather.town (fallback) — pixel avatar หัวโต hoodie + ผมสไปคี้
const GT_OUTLINE = '#2e2b3d', GT_SKIN = '#f4cfa6', GT_PANTS = '#2a3548', GT_SHOE = '#3a3025';

// ลุคต่อพนักงาน — hair (ผม), hood (เสื้อฮู้ดดี้), hat (หมวกแก๊ป), glasses (แว่น)
const PACKER_STYLES = {
  'EMP-01': { hair: '#caa056', hood: '#1c2a4a', glasses: true },   // มุก — ผมบลอนด์ + แว่น + ฮู้ดน้ำเงิน
  'EMP-02': { hair: '#1a1a1a', hood: '#1f1f1f', hat: '#a92020' },  // แล็ค — ผมดำ + แก๊ปแดง + ฮู้ดดำ
  'EMP-03': { hair: '#3a2a1f', hood: '#2c4a2a' },                  // N/A — ผมน้ำตาลเข้ม + ฮู้ดเขียว
  'EMP-04': { hair: '#5b3a22', hood: '#1e5aa0' },                  // ตั๋ง — ผมน้ำตาล + ฮู้ดฟ้า
};

function drawChar(ctx, ch) {
  // ถ้ามี sprite ของพนักงานคนนี้ — ใช้ sprite (overrides pixel-art ด้านล่าง)
  const sprite = getSprite(ch);
  if (sprite) { drawSpriteChar(ctx, ch, sprite); return; }

  const S = 2.4, x = Math.round(ch.x), y = Math.round(ch.y);
  const step = ch.frame % 2 === 1;
  const bob = step ? 0.4 : 0;
  const liftL = ch.frame === 1 ? 0.9 : 0;
  const liftR = ch.frame === 3 ? 0.9 : 0;
  const headTop = -18 * S;

  const st = ch.style || {};
  const HAIR = st.hair || '#5b3a22';
  const HOOD = st.hood || ch.color || '#1e5aa0';

  ctx.save();
  ctx.translate(x, y - bob * S);

  const blk = (bx, by, bw, bh, fill) => {
    bx = Math.round(bx); by = Math.round(by); bw = Math.round(bw); bh = Math.round(bh);
    ctx.fillStyle = GT_OUTLINE; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = fill; ctx.fillRect(bx, by, bw, bh);
  };
  const ub = (xl, base, w, h, fill) => blk(xl * S, -(base + h) * S, w * S, h * S, fill);
  // ไม่มีขอบ (สำหรับ accent เล็กๆ)
  const ubNoBorder = (xl, base, w, h, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(Math.round(xl * S), Math.round(-(base + h) * S), Math.round(w * S), Math.round(h * S));
  };

  // เงา
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(0, bob * S + 2, 5.5 * S, 1.6 * S, 0, 0, Math.PI * 2); ctx.fill();

  // ขา + รองเท้า
  ub(-3, 0 + liftL, 2, 1, GT_SHOE); ub(-3, 1 + liftL, 2, 3 - liftL, GT_PANTS);
  ub(1, 0 + liftR, 2, 1, GT_SHOE); ub(1, 1 + liftR, 2, 3 - liftR, GT_PANTS);

  // ลำตัว (Hoodie) — กว้างขึ้นเล็กน้อย ดูเป็นเสื้อหนา
  ub(-4.5, 4, 9, 6.5, HOOD);
  // ลายซิป/เชือกฮู้ด (เส้นกลางแนวตั้ง)
  ubNoBorder(-0.25, 5, 0.5, 4, '#2a2230');
  // แขน (สีเดียวกับ hoodie)
  ub(-5.8, 5, 1.6, 4.5, HOOD); ub(4.2, 5, 1.6, 4.5, HOOD);
  // มือ (skin)
  ub(-5.8, 4.4, 1.6, 0.8, GT_SKIN); ub(4.2, 4.4, 1.6, 0.8, GT_SKIN);

  // ฮู้ด (ผ้าคลุมไหล่ด้านหลังคอ) — แถบสีเข้มกว่า hoodie นิดหน่อย
  ub(-4.8, 9.6, 9.6, 1.4, HOOD);

  // หัว (ใหญ่ขึ้น — chibi style)
  ub(-4.7, 11, 9.4, 7, GT_SKIN);

  // ผม — base + ข้างสองข้าง + ทรงสไปคี้บน
  ub(-5, 16.5, 10, 1.8, HAIR);     // ด้านบนของหัว
  ub(-4.9, 13, 1.4, 4, HAIR);      // ข้างซ้าย (จอน)
  ub(3.5, 13, 1.4, 4, HAIR);       // ข้างขวา (จอน)
  // Spikes (ฟันปลาเล็กๆ ด้านบน)
  ub(-3.8, 17.8, 1.4, 1.2, HAIR);
  ub(-2.0, 18.2, 1.4, 1.4, HAIR);
  ub(-0.2, 17.9, 1.4, 1.3, HAIR);
  ub(1.6, 18.2, 1.4, 1.4, HAIR);
  ub(3.0, 17.8, 1.2, 1.1, HAIR);

  // หมวกแก๊ป (option) — วาดทับผมด้านบน
  if (st.hat) {
    ub(-5, 17.5, 10, 2, st.hat);
    ub(-5, 19.2, 5.5, 0.9, st.hat);
    // โลโก้กลางหมวก
    ubNoBorder(-1, 18.2, 2, 1, '#fff');
  }

  // ตา
  const eo = ch.facing > 0 ? 0.3 : -0.3;
  ub(-2.9 + eo, 13.8, 1.5, 1.7, GT_OUTLINE); ub(1.4 + eo, 13.8, 1.5, 1.7, GT_OUTLINE);
  ctx.fillStyle = '#fff';
  ctx.fillRect(Math.round((-2.6 + eo) * S), Math.round(-15.2 * S), Math.round(0.6 * S), Math.round(0.6 * S));
  ctx.fillRect(Math.round((1.7 + eo) * S), Math.round(-15.2 * S), Math.round(0.6 * S), Math.round(0.6 * S));

  // แว่นตา (option)
  if (st.glasses) {
    ctx.strokeStyle = GT_OUTLINE;
    ctx.lineWidth = Math.max(1.2, S * 0.4);
    const gy = -15.5 * S, gh = 2.4 * S;
    ctx.strokeRect((-3.2 + eo) * S, gy, 2.6 * S, gh);
    ctx.strokeRect((1.1 + eo) * S, gy, 2.6 * S, gh);
    ctx.beginPath();
    ctx.moveTo((-0.6 + eo) * S, gy + gh / 2); ctx.lineTo((1.1 + eo) * S, gy + gh / 2);
    ctx.stroke();
  }

  // แก้มแดง
  ctx.fillStyle = 'rgba(230,120,110,0.45)';
  ctx.fillRect(Math.round(-3.8 * S), Math.round(-13 * S), Math.round(1.4 * S), Math.round(1 * S));
  ctx.fillRect(Math.round(2.4 * S), Math.round(-13 * S), Math.round(1.4 * S), Math.round(1 * S));

  // ปาก
  ctx.fillStyle = GT_OUTLINE;
  ctx.fillRect(Math.round(-0.8 * S), Math.round(-12.5 * S), Math.round(1.6 * S), Math.round(0.5 * S));

  // ป๊อปตอนหยิบ
  if (ch.pop > 0) {
    const py = headTop - 12 - (1 - ch.pop) * 14;
    ctx.globalAlpha = Math.min(1, ch.pop * 1.5);
    ctx.fillStyle = '#caa472'; ctx.fillRect(-6, py - 6, 12, 12);
    ctx.fillStyle = '#8a6a3f'; ctx.fillRect(-6, py - 6, 12, 3);
    ctx.fillStyle = '#2e7d32'; ctx.font = 'bold 13px "JetBrains Mono"';
    ctx.textAlign = 'left'; ctx.fillText('+1', 8, py + 4);
    ctx.globalAlpha = 1;
  }
  // ชื่อ
  ctx.fillStyle = '#3a2f1e';
  ctx.font = 'bold 12px "Patrick Hand", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(ch.name, 0, headTop - 8);

  ctx.restore();
}

// ─── Tile system: Kenney Tiny Town (16×16 tiles, 12×11 grid) ───
const TILE_SRC = 16;        // ขนาด tile ในไฟล์ต้นฉบับ
const TILE_DRAW = 32;       // ขนาดที่วาดบน canvas (scale 2x)
// Tile coords (col, row) — ปรับได้ถ้าเลือก tile ผิด
const TILES = {
  grass:   { col: 5, row: 0 },   // หญ้านอกอาคาร
  floor:   { col: 1, row: 2 },   // พื้นห้องคลัง (ดิน/ทราย)
  aisle:   { col: 2, row: 2 },   // ทางเดินหลัก
  wall:    { col: 0, row: 8 },   // ผนัง (อิฐสีเทา)
  crate:   { col: 8, row: 7 },   // ลังไม้ (ชั้นวาง)
};
const tilemapImg = new Image();
tilemapImg.src = '/tiles/tilemap_packed.png';
function drawTile(ctx, t, dx, dy, dw = TILE_DRAW, dh = TILE_DRAW) {
  if (!tilemapImg.complete || !tilemapImg.naturalWidth) return false;
  ctx.drawImage(tilemapImg, t.col * TILE_SRC, t.row * TILE_SRC, TILE_SRC, TILE_SRC, dx, dy, dw, dh);
  return true;
}
function fillTiles(ctx, t, x, y, w, h) {
  if (!tilemapImg.complete || !tilemapImg.naturalWidth) return false;
  for (let py = y; py < y + h; py += TILE_DRAW)
    for (let px = x; px < x + w; px += TILE_DRAW)
      drawTile(ctx, t, px, py);
  return true;
}

function renderScene(ctx, L, chars, zonesInData, w, H) {
  const rb = L.roomBottom, dx = L.doorX;
  const tilesReady = tilemapImg.complete && tilemapImg.naturalWidth > 0;

  if (tilesReady) {
    // พื้นนอกอาคาร (หญ้า)
    fillTiles(ctx, TILES.grass, 0, 0, w, H);
    // ห้องคลัง (พื้นดิน/ทราย)
    fillTiles(ctx, TILES.floor, 8, 8, w - 16, rb - 8);
    // ทางเดินหลัก
    fillTiles(ctx, TILES.aisle, 10, L.mainAisleY - 14, w - 20, (rb - 10) - (L.mainAisleY - 14));
  } else {
    // Fallback: flat colors เดิม (ระหว่างรอ image load)
    ctx.fillStyle = '#d7d2c4'; ctx.fillRect(0, 0, w, H);
    ctx.fillStyle = '#efe9dd'; ctx.fillRect(8, 8, w - 16, rb - 8);
    ctx.fillStyle = '#e3dccb'; ctx.fillRect(10, L.mainAisleY - 14, w - 20, (rb - 10) - (L.mainAisleY - 14));
  }

  // ป้ายทางเดิน
  ctx.fillStyle = 'rgba(60,40,20,0.7)';
  ctx.font = '11px "Patrick Hand", sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('ทางเดินหลัก', 16, L.mainAisleY - 17);

  // ผนังห้อง (ขอบ)
  ctx.strokeStyle = '#5a4530'; ctx.lineWidth = 4; ctx.strokeRect(8, 8, w - 16, rb - 8);

  // ประตู (ช่องเปิดในผนังล่าง)
  if (tilesReady) {
    fillTiles(ctx, TILES.grass, dx - 26, rb - 10, 52, 18);
  } else {
    ctx.fillStyle = '#d7d2c4'; ctx.fillRect(dx - 26, rb - 10, 52, 16);
  }
  ctx.strokeStyle = '#a89472'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(dx - 26, rb + 2, 30, -Math.PI / 2, 0); ctx.stroke();
  // ชั้นวางในห้อง A–K
  Object.entries(L.shelfRects).forEach(([z, r]) => drawShelf(ctx, z, r, zonesInData.has(z)));
  // โซนนอกอาคาร L, M, N, S, COOL
  Object.entries(L.areaRects).forEach(([z, r]) => drawArea(ctx, z, r, zonesInData.has(z)));
  ctx.fillStyle = 'rgba(70,70,60,0.5)'; ctx.font = '11px "Patrick Hand", sans-serif';
  ctx.textAlign = 'right'; ctx.fillText('พื้นที่นอกอาคาร', w - 12, rb + 14);
  // ตัวละคร (เรียงตาม y)
  [...chars].sort((a, b) => a.y - b.y).forEach(ch => drawChar(ctx, ch));
}

// ── Prototype: ตัวการ์ตูน 8-bit เดินตามผังคลังจริงไปโซนที่กำลังหยิบ ──
function WarehouseScene({ packers, catalogByPacker, boxes, scanProgress }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [w, setW] = useState(900);
  const H = 430;

  const skuZone = {};
  Object.values(catalogByPacker).forEach(items => items.forEach(it => {
    if (it.sku && !skuZone[it.sku]) skuZone[it.sku] = extractZone(it.location);
  }));
  const zonesInData = new Set(Object.values(skuZone).filter(z => z !== '?'));

  // โซนที่แต่ละพนักงานรับผิดชอบ → ใช้เดินวน (idle) อิสระจากกัน
  const packerZones = {};
  packers.forEach(p => {
    const zs = [];
    (catalogByPacker[p.code] || []).forEach(it => {
      const z = extractZone(it.location);
      if (z !== '?' && !zs.includes(z)) zs.push(z);
    });
    packerZones[p.code] = zs;
  });

  const charsRef = useRef(null);
  const layoutRef = useRef(null);
  const prevProgRef = useRef({});
  const dataRef = useRef({});
  dataRef.current = { boxes, skuZone, packerZones };

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 900));
    setW(el.clientWidth || 900);
    ro.observe(el); return () => ro.disconnect();
  }, []);

  // ตรวจจับการสแกน → ตั้งเป้าหมายโซน
  useEffect(() => {
    const chars = charsRef.current; if (!chars || !layoutRef.current) return;
    const { boxes, skuZone } = dataRef.current;
    const standPos = layoutRef.current.standPos;
    const prev = prevProgRef.current;
    const cur = {};
    Object.entries(scanProgress).forEach(([boxId, items]) => {
      cur[boxId] = {}; (items || []).forEach(it => { cur[boxId][it.sku] = it.got; });
    });
    Object.entries(cur).forEach(([boxId, m]) => {
      if (!(boxId in prev)) return; // ลังที่เพิ่งโผล่/ข้อมูลค้าง → ตั้ง baseline เฉย ๆ ไม่อนิเมท
      const code = boxes.find(b => b.id === boxId)?.packer?.code; if (!code) return;
      const pm = prev[boxId];
      Object.entries(m).forEach(([sku, got]) => {
        if (got > (pm[sku] || 0)) {
          const zone = skuZone[sku];
          const ch = chars.find(c => c.code === code);
          if (ch && zone && standPos[zone]) { ch.targetZone = zone; ch.lastActive = performance.now(); ch.pop = 1; }
        }
      });
    });
    prevProgRef.current = cur;
  }, [scanProgress]);

  // เกมลูป
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.width = w; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false; // ไม่ blur tile pixel art ตอน scale
    layoutRef.current = buildLayout(w, H, packers.length);

    if (!charsRef.current) {
      charsRef.current = packers.map((p, i) => ({
        code: p.code, name: p.name, color: p.color,
        style: PACKER_STYLES[p.code] || {},
        x: layoutRef.current.home[i].x, y: layoutRef.current.mainAisleY, facing: 1, dir: 'S',
        frame: 0, frameT: 0, pop: 0, targetZone: null, lastActive: 0, cur: 'home', wp: [],
        wanderZone: null, nextWander: 0,
      }));
    }

    let raf, t0 = performance.now();
    const loop = (t) => {
      const dt = Math.min(50, t - t0); t0 = t;
      const chars = charsRef.current;
        const { standPos, mainAisleY, home, roomBottom, doorX } = layoutRef.current;

      const pz = dataRef.current.packerZones || {};
      chars.forEach((ch, i) => {
        const baseZone = (pz[ch.code] || [])[0];
        // ยืนที่โซนของสินค้าที่หยิบล่าสุด ไม่กลับบ้าน — เปลี่ยนเมื่อหยิบสินค้าคนละ location เท่านั้น
        const want = (ch.targetZone && standPos[ch.targetZone]) ? ch.targetZone
          : (baseZone && standPos[baseZone] ? baseZone : 'home'); // ยังไม่เคยหยิบ → ยืนโซนหลัก
        if (want !== ch.cur) {
          ch.cur = want;
          const dest = want === 'home' ? { x: (home[i] || { x: w / 2 }).x, y: mainAisleY } : standPos[want];
          const curOutside = ch.y > roomBottom;
          const destOutside = want !== 'home' && OUTSIDE_SET.has(want);
          const wp = [];
          // ออกจากนอกอาคาร → กลับเข้าประตูก่อน
          if (curOutside) { wp.push({ x: doorX, y: ch.y }, { x: doorX, y: mainAisleY }); }
          else { wp.push({ x: ch.x, y: mainAisleY }); }
          if (destOutside) {
            // เดินไปประตู → ออกนอก → ถึงโซน
            wp.push({ x: doorX, y: mainAisleY }, { x: doorX, y: roomBottom + 18 }, { x: dest.x, y: dest.y });
          } else {
            // ในห้อง: แนวนอนตามทางเดินหลัก → ขึ้นทางเดินย่อย
            wp.push({ x: dest.x, y: mainAisleY }, { x: dest.x, y: dest.y });
          }
          ch.wp = wp;
        }
        if (ch.wp.length) {
          const tp = ch.wp[0];
          const dx = tp.x - ch.x, dy = tp.y - ch.y, dist = Math.hypot(dx, dy);
          const sp = (dt / 1000) * 100;
          if (dist <= sp || dist < 1.5) { ch.x = tp.x; ch.y = tp.y; ch.wp.shift(); if (!ch.wp.length) ch.frame = 0; }
          else {
            ch.x += dx / dist * sp; ch.y += dy / dist * sp;
            if (Math.abs(dx) > Math.abs(dy)) ch.facing = dx > 0 ? 1 : -1;
            ch.dir = dirFromVec(dx, dy); // 8 ทิศสำหรับ sprite
            ch.frameT += dt; if (ch.frameT > 120) { ch.frame = (ch.frame + 1) % 4; ch.frameT = 0; }
          }
        } else ch.frame = 0;
        if (ch.pop > 0) ch.pop = Math.max(0, ch.pop - dt / 800);
      });

      renderScene(ctx, layoutRef.current, chars, zonesInData, w, H);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [w, packers.length]);

  return (
    <div ref={wrapRef} style={{ marginBottom: 24 }}>
      <div style={{ fontFamily: 'Caveat', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        👤 มุมมองพนักงาน<span style={{ fontFamily: 'Patrick Hand', fontSize: 14, color: 'var(--mute)' }}></span>
      </div>
      <div style={{ border: '2px solid var(--line)', borderRadius: 14, overflow: 'hidden', boxShadow: '3px 3px 0 var(--line)', lineHeight: 0 }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: H, display: 'block', imageRendering: 'pixelated' }} />
      </div>
    </div>
  );
}

function Doughnut({ pct, size = 130, stroke = 14, color }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = circ * Math.min(pct, 1);
  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e8e8e0" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={`${filled} ${circ}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
    </svg>
  );
}

export default function PackerDashboard({ catalogByPacker, boxes, itemsByBox, PACKERS, scanProgress = {} }) {
  const hasCatalog = Object.keys(catalogByPacker).length > 0;

  const packerStats = PACKERS.map((p, i) => {
    const assigned = catalogByPacker[p.code] || [];
    const need = assigned.reduce((s, it) => s + (it.qty || 0), 0);

    const myBoxes = boxes.filter(b =>
      b.packer?.code === p.code &&
      (b.status === 'closed' || b.status === 'exported' || b.status === 'received')
    );
    const gotClosed = myBoxes.reduce((s, b) => {
      const items = itemsByBox[b.id] || [];
      return s + items.reduce((ss, it) => ss + (it.qty || it.got || 0), 0);
    }, 0);
    const gotInProgress = Object.entries(scanProgress)
      .filter(([boxId]) => boxes.find(b => b.id === boxId)?.packer?.code === p.code)
      .flatMap(([, items]) => items)
      .reduce((s, it) => s + it.got, 0);
    const got = gotClosed + gotInProgress;

    const pct = need > 0 ? got / need : 0;
    const color = PACKER_COLORS[i % PACKER_COLORS.length];

    return { ...p, need, got, pct, color, closedBoxes: myBoxes.length, skuCount: assigned.length };
  });

  const totalNeed = packerStats.reduce((s, p) => s + p.need, 0);
  const totalGot  = packerStats.reduce((s, p) => s + p.got, 0);
  const totalPct  = totalNeed > 0 ? totalGot / totalNeed : 0;

  return (
    <div className="frame" style={{ padding: 24 }}>
      {/* big real-time counter */}
      <div style={{ textAlign: 'center', marginBottom: 24, padding: '16px 0', borderBottom: '2px dashed var(--line)' }}>
        <div style={{ fontFamily: 'Caveat', fontSize: 56, fontWeight: 700, lineHeight: 1 }}>
          <span style={{ color: 'var(--accent)' }}>{totalGot}</span>
          <span style={{ color: 'var(--mute)', fontSize: 32 }}> / {totalNeed} ชิ้น</span>
        </div>
        <div style={{ fontFamily: 'Patrick Hand', fontSize: 15, color: 'var(--mute)', marginTop: 4 }}>
          แพ็คกิ้งวันนี้ · {Math.round(totalPct * 100)}% เสร็จแล้ว · {boxes.filter(b => b.status === 'closed' || b.status === 'exported').length} ลังปิดแล้ว
        </div>
      </div>

      {/* prototype: มุมมองคลังจำลอง 8-bit (ผังจริง) */}
      {hasCatalog && (
        <WarehouseScene packers={packerStats} catalogByPacker={catalogByPacker} boxes={boxes} scanProgress={scanProgress} />
      )}

      {/* summary row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'Caveat', fontSize: 26, fontWeight: 700 }}>📦 ภาพรวมรายคน</div>
      </div>

      {!hasCatalog ? (
        <div style={{ textAlign: 'center', padding: '40px 0', fontFamily: 'Patrick Hand', fontSize: 16, color: 'var(--mute)' }}>
          ยังไม่มีข้อมูล · กรุณานำเข้ารายการเบิกสินค้าและกด 🔀 สุ่มใหม่ก่อน
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
          {packerStats.map(p => (
            <div key={p.code} style={{
              border: '2px solid var(--line)',
              borderRadius: 14,
              padding: '20px 16px',
              background: 'white',
              boxShadow: '3px 3px 0 var(--line)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            }}>
              <div style={{ fontFamily: 'Caveat', fontSize: 22, fontWeight: 700, color: p.color }}>{p.name}</div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--mute)' }}>{p.code}</div>

              {/* doughnut + center text */}
              <div style={{ position: 'relative', width: 130, height: 130 }}>
                <Doughnut pct={p.pct} color={p.color} />
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ fontFamily: 'Caveat', fontSize: 30, fontWeight: 700, color: p.color, lineHeight: 1 }}>
                    {Math.round(p.pct * 100)}%
                  </div>
                  <div style={{ fontFamily: 'Patrick Hand', fontSize: 12, color: 'var(--mute)' }}>เสร็จแล้ว</div>
                </div>
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Caveat', fontSize: 20, fontWeight: 700 }}>
                  <span style={{ color: p.color }}>{p.got}</span>
                  <span style={{ color: 'var(--mute)', fontSize: 16 }}> / {p.need} ชิ้น</span>
                </div>
                <div style={{ fontFamily: 'Patrick Hand', fontSize: 13, color: 'var(--mute)', marginTop: 4 }}>
                  {p.skuCount} SKU · {p.closedBoxes} ลังปิดแล้ว
                </div>
              </div>

              {/* mini progress bar */}
              <div style={{ width: '100%', height: 6, background: '#e8e8e0', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  background: p.color,
                  width: `${Math.round(p.pct * 100)}%`,
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
