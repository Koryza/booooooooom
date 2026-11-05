let context: AudioContext | null = null;
export async function unlockAudio() {
  try { context ||= new AudioContext(); await context.resume(); alarm(false); } catch { /* Audio is optional; gameplay is unaffected. */ }
}
export function alarm(danger = true) {
  if (!context || context.state !== 'running') return;
  for (let i = 0; i < (danger ? 3 : 1); i++) {
    const osc = context.createOscillator(), gain = context.createGain();
    const start = context.currentTime + i * .24;
    osc.type = 'sine'; osc.frequency.setValueAtTime(danger ? 230 : 440, start);
    gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(.08, start + .02); gain.gain.exponentialRampToValueAtTime(.0001, start + .16);
    osc.connect(gain); gain.connect(context.destination); osc.start(start); osc.stop(start + .18);
  }
}
