// เสียงสแกนสำเร็จ — สังเคราะห์สดด้วย Web Audio API (ไม่ใช้ไฟล์เสียง) แบบ "Success Chime"
// เลือกจาก scan-sounds.html (gallery ตัวอย่าง 8 แบบ) — สองโน้ตไล่ขึ้น C6 → E6
let audioCtx = null;

function getCtx() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) audioCtx = new AudioCtx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tone(ctx, freq, startOffset, dur, peakVol) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + startOffset;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peakVol, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function playScanSuccess() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    tone(ctx, 1046, 0, 0.08, 0.28);    // C6
    tone(ctx, 1318, 0.07, 0.15, 0.28); // E6
  } catch {
    // เบราว์เซอร์ไม่รองรับ Web Audio API — ข้ามเงียบๆ ไม่กระทบการสแกน
  }
}
