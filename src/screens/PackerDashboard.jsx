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

function buildLayout(w, H, nPackers) {
  const pad = 14;
  const shelfTop = 24;
  const mainAisleY = H - 28;
  const shelfH = mainAisleY - 16 - shelfTop;

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

  const home = [];
  for (let i = 0; i < nPackers; i++) {
    home.push({ x: pad + 40 + i * ((avail - 80) / Math.max(1, nPackers - 1)), y: mainAisleY });
  }
  return { shelfRects, standPos, aisleX, mainAisleY, shelfTop, shelfH, home, door: w / 2 };
}

function drawShelf(ctx, z, r, active) {
  const levels = ZONE_LEVELS[z] || 7;
  ctx.fillStyle = active ? '#d8b988' : '#cdc2ac';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = active ? '#b3905c' : '#ada085';
  ctx.fillRect(r.x, r.y, r.w, 5);
  ctx.fillStyle = '#7c6038';
  ctx.fillRect(r.x, r.y + r.h - 4, r.w, 4);
  // เส้นแบ่งชั้น
  ctx.strokeStyle = 'rgba(90,70,40,0.35)'; ctx.lineWidth = 1;
  for (let i = 1; i < levels; i++) {
    const yy = r.y + (r.h / levels) * i;
    ctx.beginPath(); ctx.moveTo(r.x, yy); ctx.lineTo(r.x + r.w, yy); ctx.stroke();
  }
  // ป้ายโซน (วงกลมน้ำเงิน) บนหัวชั้น
  const cx = r.x + r.w / 2, cy = r.y + 14, rad = 11;
  ctx.fillStyle = '#1f4e8c';
  ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(z, cx, cy + 0.5);
  ctx.textBaseline = 'alphabetic';
}

function drawChar(ctx, ch) {
  const s = 3, x = Math.round(ch.x), y = Math.round(ch.y);
  const moving = ch.frame % 2 === 1;
  const bob = moving ? -1 : 0;
  const skin = '#f4cfa6', dark = '#33312e';
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(x, y + 2, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
  const top = y - 13 * s + bob;
  // ขา (สลับยาว/สั้นตอนเดิน)
  ctx.fillStyle = dark;
  const lo = moving ? 2 : 0;
  ctx.fillRect(x - 2.2 * s, top + 9 * s, 2 * s, 4 * s - lo);
  ctx.fillRect(x + 0.2 * s, top + 9 * s, 2 * s, 4 * s + lo - (moving ? 0 : 0));
  // ลำตัว
  ctx.fillStyle = ch.color;
  ctx.fillRect(x - 3 * s, top + 4.5 * s, 6 * s, 5 * s);
  // แขน
  ctx.fillStyle = skin;
  ctx.fillRect(x - 4 * s, top + 5 * s, 1 * s, 4 * s);
  ctx.fillRect(x + 3 * s, top + 5 * s, 1 * s, 4 * s);
  // หัว
  ctx.fillStyle = skin;
  ctx.fillRect(x - 2.5 * s, top, 5 * s, 4.5 * s);
  // หมวก
  ctx.fillStyle = ch.color;
  ctx.fillRect(x - 2.8 * s, top - 0.6 * s, 5.6 * s, 1.8 * s);
  // ตา
  ctx.fillStyle = dark;
  const eo = ch.facing > 0 ? 0.6 * s : -1.6 * s;
  ctx.fillRect(x - 0.3 * s + eo, top + 2 * s, s, s);
  ctx.fillRect(x + 1 * s + eo, top + 2 * s, s, s);
  // ป๊อปตอนหยิบ
  if (ch.pop > 0) {
    const py = top - 10 - (1 - ch.pop) * 14;
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
  ctx.fillText(ch.name, x, top - 6);
}

function renderScene(ctx, L, chars, zonesInData, w, H) {
  // พื้น
  ctx.fillStyle = '#efe9dd'; ctx.fillRect(0, 0, w, H);
  // ทางเดินหลัก (ล่าง)
  ctx.fillStyle = '#e3dccb'; ctx.fillRect(0, L.mainAisleY - 16, w, H - (L.mainAisleY - 16));
  ctx.fillStyle = 'rgba(120,100,70,0.45)';
  ctx.font = '11px "Patrick Hand", sans-serif'; ctx.textAlign = 'right';
  ctx.fillText('ทางเดินหลัก', w - 10, H - 8);
  // ประตู (กลาง)
  ctx.fillStyle = '#cdbf9e'; ctx.fillRect(L.door - 26, H - 6, 52, 6);
  ctx.strokeStyle = '#a89472'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(L.door - 26, H - 6, 30, -Math.PI / 2, 0); ctx.stroke();
  // ชั้นวาง
  Object.entries(L.shelfRects).forEach(([z, r]) => drawShelf(ctx, z, r, zonesInData.has(z)));
  // ตัวละคร (เรียงตาม y)
  [...chars].sort((a, b) => a.y - b.y).forEach(ch => drawChar(ctx, ch));
}

// ── Prototype: ตัวการ์ตูน 8-bit เดินตามผังคลังจริงไปโซนที่กำลังหยิบ ──
function WarehouseScene({ packers, catalogByPacker, boxes, scanProgress }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [w, setW] = useState(900);
  const H = 340;

  const skuZone = {};
  Object.values(catalogByPacker).forEach(items => items.forEach(it => {
    if (it.sku && !skuZone[it.sku]) skuZone[it.sku] = extractZone(it.location);
  }));
  const zonesInData = new Set(Object.values(skuZone).filter(z => z !== '?'));

  const charsRef = useRef(null);
  const layoutRef = useRef(null);
  const prevProgRef = useRef({});
  const dataRef = useRef({});
  dataRef.current = { boxes, skuZone };

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
    layoutRef.current = buildLayout(w, H, packers.length);

    if (!charsRef.current) {
      charsRef.current = packers.map((p, i) => ({
        code: p.code, name: p.name, color: p.color,
        x: layoutRef.current.home[i].x, y: layoutRef.current.mainAisleY, facing: 1,
        frame: 0, frameT: 0, pop: 0, targetZone: null, lastActive: 0, cur: 'home', wp: [],
      }));
    }

    let raf, t0 = performance.now();
    const loop = (t) => {
      const dt = Math.min(50, t - t0); t0 = t;
      const chars = charsRef.current;
      const { standPos, mainAisleY, home } = layoutRef.current;

      chars.forEach((ch, i) => {
        const idle = performance.now() - ch.lastActive > 5000;
        const want = (!idle && ch.targetZone && standPos[ch.targetZone]) ? ch.targetZone : 'home';
        if (want !== ch.cur) {
          ch.cur = want;
          const dest = want === 'home' ? { x: (home[i] || { x: w / 2 }).x, y: mainAisleY } : standPos[want];
          // เดินตามทางเดิน: ลงทางเดินหลัก → แนวนอน → ขึ้นทางเดินย่อย
          ch.wp = [{ x: ch.x, y: mainAisleY }, { x: dest.x, y: mainAisleY }, { x: dest.x, y: dest.y }];
        }
        if (ch.wp.length) {
          const tp = ch.wp[0];
          const dx = tp.x - ch.x, dy = tp.y - ch.y, dist = Math.hypot(dx, dy);
          const sp = (dt / 1000) * 100;
          if (dist <= sp || dist < 1.5) { ch.x = tp.x; ch.y = tp.y; ch.wp.shift(); if (!ch.wp.length) ch.frame = 0; }
          else {
            ch.x += dx / dist * sp; ch.y += dy / dist * sp;
            if (Math.abs(dx) > Math.abs(dy)) ch.facing = dx > 0 ? 1 : -1;
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
        🎮 มุมมองคลังจำลอง <span style={{ fontFamily: 'Patrick Hand', fontSize: 14, color: 'var(--mute)' }}>(ผังจริง · ตัวละครเดินไปโซนที่กำลังหยิบแบบเรียลไทม์)</span>
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
