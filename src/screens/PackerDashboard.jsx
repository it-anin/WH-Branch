import { useRef, useEffect, useState } from 'react';

const PACKER_COLORS = ['#e8692b', '#2b6ce8', '#5c8a3a', '#d94a8a'];

const extractZone = (loc) => {
  const m = String(loc || '').match(/^([A-Za-z]+)/);
  return m ? m[1].toUpperCase() : '?';
};

// ── Prototype เฟส 1: ตัวการ์ตูน 8-bit เดินไปโซนที่กำลังหยิบ (วาดด้วย canvas) ──
function WarehouseScene({ packers, catalogByPacker, boxes, scanProgress }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [w, setW] = useState(760);
  const H = 300;

  // sku -> zone
  const skuZone = {};
  Object.values(catalogByPacker).forEach(items => items.forEach(it => {
    if (it.sku && !skuZone[it.sku]) skuZone[it.sku] = extractZone(it.location);
  }));
  const zones = [...new Set(Object.values(skuZone))]
    .filter(z => z !== '?')
    .sort((a, b) => a.length !== b.length ? a.length - b.length : a.localeCompare(b));
  const zonesKey = zones.join(',');

  const charsRef = useRef(null);
  const layoutRef = useRef({ zoneRects: {}, standPos: {}, home: [] });
  const prevProgRef = useRef({});
  const dataRef = useRef({});
  dataRef.current = { boxes, skuZone };

  // วัดความกว้าง
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 760));
    setW(el.clientWidth || 760);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ตรวจจับการสแกน (got เพิ่ม) → ตั้งเป้าหมายโซน + เด้ง
  useEffect(() => {
    const chars = charsRef.current; if (!chars) return;
    const { boxes, skuZone } = dataRef.current;
    const standPos = layoutRef.current.standPos;
    const prev = prevProgRef.current;
    const cur = {};
    Object.entries(scanProgress).forEach(([boxId, items]) => {
      cur[boxId] = {};
      (items || []).forEach(it => { cur[boxId][it.sku] = it.got; });
    });
    Object.entries(cur).forEach(([boxId, m]) => {
      const code = boxes.find(b => b.id === boxId)?.packer?.code;
      if (!code) return;
      const pm = prev[boxId] || {};
      Object.entries(m).forEach(([sku, got]) => {
        if (got > (pm[sku] || 0)) {
          const zone = skuZone[sku];
          const ch = chars.find(c => c.code === code);
          if (ch && zone && standPos[zone]) {
            ch.targetZone = zone;
            ch.lastActive = performance.now();
            ch.pop = 1;
          }
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

    // layout: ชั้นวาง (โซน) เรียงเป็นกริด ด้านบน + จุดยืนหน้าโซน + บ้าน (ล่าง)
    const pad = 18, shelfW = 78, shelfH = 46, gapX = 18, gapY = 40;
    const cols = Math.max(1, Math.floor((w - pad * 2 + gapX) / (shelfW + gapX)));
    const zoneRects = {}, standPos = {};
    zones.forEach((z, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const x = pad + c * (shelfW + gapX);
      const y = 18 + r * (shelfH + gapY);
      zoneRects[z] = { x, y, w: shelfW, h: shelfH };
      standPos[z] = { x: x + shelfW / 2, y: y + shelfH + 16 };
    });
    const home = packers.map((p, i) => ({
      x: pad + 30 + i * ((w - pad * 2 - 60) / Math.max(1, packers.length - 1)),
      y: H - 24,
    }));
    layoutRef.current = { zoneRects, standPos, home };

    // init ตัวละคร (ครั้งเดียว)
    if (!charsRef.current) {
      charsRef.current = packers.map((p, i) => ({
        code: p.code, name: p.name, color: p.color,
        x: home[i].x, y: home[i].y, facing: 1,
        frame: 0, frameT: 0, pop: 0, targetZone: null, lastActive: 0,
      }));
    }

    let raf, t0 = performance.now();
    const loop = (t) => {
      const dt = Math.min(50, t - t0); t0 = t;
      const chars = charsRef.current;
      const { zoneRects, standPos, home } = layoutRef.current;

      // update
      chars.forEach((ch, i) => {
        const idle = performance.now() - ch.lastActive > 5000;
        const tgt = (!idle && ch.targetZone && standPos[ch.targetZone])
          ? standPos[ch.targetZone] : (home[i] || { x: w / 2, y: H - 24 });
        const dx = tgt.x - ch.x, dy = tgt.y - ch.y;
        const dist = Math.hypot(dx, dy);
        const sp = (dt / 1000) * 90;
        if (dist > 2) {
          ch.x += (dx / dist) * Math.min(sp, dist);
          ch.y += (dy / dist) * Math.min(sp, dist);
          if (Math.abs(dx) > 1) ch.facing = dx > 0 ? 1 : -1;
          ch.frameT += dt;
          if (ch.frameT > 130) { ch.frame = (ch.frame + 1) % 4; ch.frameT = 0; }
        } else { ch.frame = 0; }
        if (ch.pop > 0) ch.pop = Math.max(0, ch.pop - dt / 800);
      });

      // render
      ctx.fillStyle = '#efe9dd'; ctx.fillRect(0, 0, w, H);
      // ทางเดินล่าง
      ctx.fillStyle = '#e3dccb'; ctx.fillRect(0, H - 46, w, 46);
      // ชั้นวาง
      Object.entries(zoneRects).forEach(([z, r]) => {
        ctx.fillStyle = '#caa472'; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = '#a8814f'; ctx.fillRect(r.x, r.y, r.w, 6);
        ctx.fillStyle = '#8a6a3f'; ctx.fillRect(r.x, r.y + r.h - 4, r.w, 4);
        // กล่องบนชั้น
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = ['#e8c07d', '#d9a85a', '#f0d49a'][k % 3];
          ctx.fillRect(r.x + 8 + k * 22, r.y + 14, 16, 16);
        }
        ctx.fillStyle = '#3a2f1e';
        ctx.font = 'bold 13px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(z, r.x + r.w / 2, r.y + r.h + 13);
      });

      // ตัวละคร (เรียงตาม y)
      [...chars].sort((a, b) => a.y - b.y).forEach(ch => drawChar(ctx, ch));

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [w, zonesKey, packers.length]);

  function drawChar(ctx, ch) {
    const s = 3, x = Math.round(ch.x), y = Math.round(ch.y);
    const moving = ch.frame % 2 === 1;
    const bob = moving ? -1 : 0;
    const skin = '#f4cfa6', dark = '#33312e';
    // เงา
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(x, y + 2, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
    const top = y - 13 * s + bob;
    // ขา (สลับเฟรม)
    ctx.fillStyle = dark;
    const lo = moving ? 2 : 0;
    ctx.fillRect(x - 2.2 * s, top + 9 * s, 2 * s, 4 * s - lo);
    ctx.fillRect(x + 0.2 * s, top + 9 * s, 2 * s, 4 * s - (moving ? 0 : 0) - (moving ? -lo : 0));
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
    // หมวก/ผม
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

  if (zones.length === 0) return null;

  return (
    <div ref={wrapRef} style={{ marginBottom: 24 }}>
      <div style={{ fontFamily: 'Caveat', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        🎮 มุมมองคลังจำลอง <span style={{ fontFamily: 'Patrick Hand', fontSize: 14, color: 'var(--mute)' }}>(ทดลอง · ตัวละครเดินไปโซนที่กำลังหยิบแบบเรียลไทม์)</span>
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

      {/* prototype: มุมมองคลังจำลอง 8-bit */}
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
