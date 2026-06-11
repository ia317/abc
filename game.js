const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const waveEl = document.getElementById('wave');
const overlay = document.getElementById('overlay');
const titleEl = document.getElementById('title');
const subtitleEl = document.getElementById('subtitle');

// --- ABC Groups ---
const BASE_GROUPS = [
  ['A','B','C','D','E'],
  ['F','G','H','I','J'],
  ['K','L','M','N'],
  ['O','P','Q','R'],
  ['S','T','U','V'],
  ['W','X','Y','Z'],
];

// Rounds: 1 = uppercase, 2 = lowercase, 3 = both mixed
const ROUND_LABELS = ['', 'CAPITAL LETTERS', 'lowercase letters', 'Capital & lowercase'];

const LETTER_COLORS = {
  A:'#ff4444',B:'#ff8844',C:'#ffcc44',D:'#aaff44',E:'#44ff88',
  F:'#44ffcc',G:'#44ccff',H:'#4488ff',I:'#8844ff',J:'#cc44ff',
  K:'#ff44cc',L:'#ff4488',M:'#ff6655',N:'#55ff66',O:'#66aaff',
  P:'#ffaa55',Q:'#aa55ff',R:'#55ffaa',S:'#ff55aa',T:'#aaffaa',
  U:'#ffaaff',V:'#aaffff',W:'#ffffaa',X:'#ff9999',Y:'#99ff99',Z:'#9999ff'
};
function letterColor(l) { return LETTER_COLORS[l.toUpperCase()]; }

// --- State ---
let state = 'menu';
let currentUser = 'Player 1';
let score = 0, lives = 3;
let round = 1;      // 1, 2, 3
let groupIdx = 0;
let learnedFlags = [];
let targetIdx = 0;
let targetLetter = '';   // the exact letter/case to shoot
let targetHits = 0;
const HITS_REQUIRED = 3;
let levelCompleteTimer = 0;
let roundCompleteTimer = 0;
let reviewQueue = [];
let reviewAllLetters = [];
let reviewCompleted = new Set();
let reviewQueueIdx = 0;
let reviewHitsOnCurrent = 0;
let reviewPhase = 1; // 1 = visual+audio, 2 = audio only
const REVIEW_HITS = 1;
let reviewCompleteTimer = 0;
let unlockedReviews = { 1: [], 2: [], 3: [] }; // groupIdx values where reviews are unlocked
let targetShowTimer = 0;
const TARGET_SHOW_FRAMES = 180;
const TARGET_SHOW_FADE = 22;

let paused = false;

// unlockedUpTo[round] = highest group index accessible; -1 = none
let unlockedUpTo = { 1: 0, 2: -1, 3: -1 };

let player, bullets, fallingLetters, particles, stars;
let keys = {};
let shootCooldown = 0;
let mouseX = -100, mouseY = -100;
let spawnTimer = 0;
let spawnInterval = 60;
let letterSpeed = 0.35;
const MAX_LETTERS = 10;

// --- Intro ---
let introLetterIdx = 0;
let introTimer = 0;
const INTRO_LETTER_FRAMES = 420;
const INTRO_FADE_IN = 40;
const INTRO_FADE_OUT = 40;

const LETTER_NAMES = {
  A:'Ay',  B:'Bee', C:'See', D:'Dee', E:'Ee',
  F:'Eff', G:'Gee', H:'Aych', I:'Eye', J:'Jay',
  K:'Kay', L:'Ell', M:'Em',  N:'En',  O:'Oh',
  P:'Pee', Q:'Cue', R:'Are', S:'Ess', T:'Tee',
  U:'You', V:'Vee', W:'Double You', X:'Ex', Y:'Why', Z:'Zee'
};

// --- Speech ---
let chosenVoice = null;
function loadVoices() {
  const voices = window.speechSynthesis.getVoices();
  const us = voices.filter(v => /en[-_]US/i.test(v.lang));

  // Log so we can see exactly what's available
  console.log('All voices:', voices.map(v => `${v.name} [${v.lang}]`).join('\n'));

  chosenVoice =
    // Edge neural online US voices — best quality
    us.find(v => /aria/i.test(v.name)) ||
    us.find(v => /jenny/i.test(v.name)) ||
    us.find(v => /guy/i.test(v.name)) ||
    us.find(v => /ana/i.test(v.name)) ||
    us.find(v => /emma/i.test(v.name)) ||
    us.find(v => /michelle/i.test(v.name)) ||
    // Google US English (Chrome)
    us.find(v => /google/i.test(v.name)) ||
    // Windows built-in US voices
    us.find(v => /zira|david/i.test(v.name)) ||
    // macOS US voice
    us.find(v => /samantha/i.test(v.name)) ||
    // Any US voice as last resort
    us.find(v => v.default) || us[0] ||
    voices.find(v => /en/i.test(v.lang) && v.default) || voices[0] || null;

  console.log('Chosen voice:', chosenVoice ? `${chosenVoice.name} [${chosenVoice.lang}]` : 'none');
}
if (window.speechSynthesis) {
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
  loadVoices();
}
let muted = false;
const muteBtn = document.getElementById('mute-btn');
muteBtn.addEventListener('click', () => {
  muted = !muted;
  if (muted) {
    window.speechSynthesis.cancel();
    muteBtn.textContent = '🔇';
    muteBtn.classList.add('muted');
  } else {
    muteBtn.textContent = '🔊';
    muteBtn.classList.remove('muted');
  }
});

function speakLetter(baseLetter) {
  if (!window.speechSynthesis || muted) return;
  window.speechSynthesis.cancel();
  const spoken = LETTER_NAMES[baseLetter.toUpperCase()] ?? baseLetter.toUpperCase();
  const utter = new SpeechSynthesisUtterance(spoken);
  utter.lang = 'en-US';
  utter.rate = 0.85;
  utter.pitch = 1.05;
  utter.volume = 1;
  if (chosenVoice) utter.voice = chosenVoice;
  window.speechSynthesis.speak(utter);
}

// --- Group helpers ---
// Always 5 letters per group across all rounds
function currentGroup() {
  const g = BASE_GROUPS[groupIdx];
  if (round === 1) return g;                            // ['A','B','C','D','E']
  if (round === 2) return g.map(l => l.toLowerCase()); // ['a','b','c','d','e']
  return g;                                             // round 3: same 5 uppercase as base, either case accepted
}

// Is a falling letter considered "the target" in the current round?
function isTargetMatch(fl) {
  if (round < 3) return fl.letter === targetLetter;
  // Round 3: either case of the target base letter counts
  return fl.letter.toUpperCase() === targetLetter.toUpperCase();
}

// --- Init ---
function showTargetLetter() {
  // keep existing letters — don't clear
  targetShowTimer = 0;
  state = 'target';
  speakLetter(BASE_GROUPS[groupIdx][targetIdx]);
}

function nextTarget() {
  targetHits = 0;
  const g = currentGroup();
  for (let i = 0; i < learnedFlags.length; i++) {
    if (!learnedFlags[i]) { targetIdx = i; targetLetter = g[i]; saveProgress(); showTargetLetter(); return; }
  }
  levelComplete();
}

function levelComplete() {
  state = 'levelcomplete';
  levelCompleteTimer = 150;
  spawnParticlesAt(canvas.width / 2, canvas.height / 2, '#0f0', 40);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function startReview() {
  reviewAllLetters = [];
  for (let g = 0; g < groupIdx; g++)
    for (const l of BASE_GROUPS[g])
      reviewAllLetters.push(round === 2 ? l.toLowerCase() : l);
  reviewPhase = 1;
  reviewQueue = shuffle([...reviewAllLetters]);
  reviewCompleted = new Set();
  reviewQueueIdx = 0;
  reviewHitsOnCurrent = 0;
  fallingLetters = [];
  bullets = [];
  spawnTimer = 0;
  showReviewTarget();
}

function showReviewTarget() {
  fallingLetters = [];
  targetShowTimer = 0;
  state = 'reviewtarget';
  speakLetter(reviewQueue[reviewQueueIdx].toUpperCase());
}

function spawnReviewLetter() {
  if (fallingLetters.length >= MAX_LETTERS) return;
  const target = reviewQueue[reviewQueueIdx];
  const isTarget = Math.random() < 0.25;
  let letter = target;
  if (!isTarget) {
    const pool = reviewQueue.filter(l => l !== target);
    if (pool.length > 0) letter = pool[Math.floor(Math.random() * pool.length)];
  }
  if (letter === target) {
    const onScreen = fallingLetters.filter(fl => fl.letter === target).length;
    if (onScreen >= 4) {
      const pool = reviewQueue.filter(l => l !== target);
      if (pool.length > 0) letter = pool[Math.floor(Math.random() * pool.length)];
      else return;
    }
  }
  const sx = findSpawnX();
  if (sx === null) return;
  fallingLetters.push({
    letter,
    x: sx,
    y: 70,
    speed: 0.9 + Math.random() * 0.1,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: (Math.random() - 0.5) * 0.03,
  });
}

function roundComplete() {
  state = 'roundcomplete';
  roundCompleteTimer = 200;
  spawnParticlesAt(canvas.width / 2, canvas.height / 2, '#ff0', 60);
  spawnParticlesAt(canvas.width / 3, canvas.height / 3, '#0ff', 40);
  spawnParticlesAt(2 * canvas.width / 3, canvas.height / 3, '#f0f', 40);
}

function spawnParticlesAt(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 5 + 1;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 55, color });
  }
}

function initGroup() {
  const g = currentGroup();
  learnedFlags = new Array(g.length).fill(false);
  targetIdx = 0;
  targetLetter = g[0];
  targetHits = 0;
  fallingLetters = [];
  spawnTimer = 0;
  waveEl.textContent = `${groupIdx + 1}/${BASE_GROUPS.length}`;
  introLetterIdx = 0;
  introTimer = 0;
  state = 'intro';
  saveProgress();
  updatePanelActive();
}

function initGame() {
  score = 0; lives = 3; round = 1; groupIdx = 0;
  scoreEl.textContent = 0;
  livesEl.textContent = 3;
  letterSpeed = 0.35;
  spawnInterval = 60;
  player = { x: canvas.width / 2, y: canvas.height - 50, w: 40, h: 40, speed: 5, invincible: 0 };
  bullets = [];
  particles = [];
  initStars();
  initGroup();
}

function initStars() {
  stars = Array.from({ length: 100 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 1.2 + 0.3,
    speed: Math.random() * 0.4 + 0.1,
  }));
}

function findSpawnX() {
  const minXDist = 48;
  for (let attempt = 0; attempt < 15; attempt++) {
    const x = 50 + Math.random() * (canvas.width - 100);
    const clear = fallingLetters.every(fl => Math.abs(fl.x - x) >= minXDist);
    if (clear) return x;
  }
  return null;
}

function spawnLetter() {
  const g = currentGroup();
  let letter;
  const targetOnScreen = fallingLetters.filter(fl => fl.letter.toUpperCase() === targetLetter.toUpperCase()).length;
  const atCap = targetOnScreen >= 4;
  if (round < 3) {
    letter = (!atCap && Math.random() < 0.25)
      ? targetLetter
      : g[Math.floor(Math.random() * g.length)];
    if (atCap && letter.toUpperCase() === targetLetter.toUpperCase()) {
      const others = g.filter(l => l.toUpperCase() !== targetLetter.toUpperCase());
      if (others.length) letter = others[Math.floor(Math.random() * others.length)];
    }
  } else {
    const base = (!atCap && Math.random() < 0.25)
      ? targetLetter.toUpperCase()
      : BASE_GROUPS[groupIdx][Math.floor(Math.random() * BASE_GROUPS[groupIdx].length)];
    letter = Math.random() < 0.5 ? base : base.toLowerCase();
    if (atCap && letter.toUpperCase() === targetLetter.toUpperCase()) {
      const others = BASE_GROUPS[groupIdx].filter(l => l.toUpperCase() !== targetLetter.toUpperCase());
      if (others.length) {
        const nb = others[Math.floor(Math.random() * others.length)];
        letter = Math.random() < 0.5 ? nb : nb.toLowerCase();
      }
    }
  }
  const sx = findSpawnX();
  if (sx === null) return;
  fallingLetters.push({
    letter,
    x: sx,
    y: 70,
    speed: 0.9 + Math.random() * 0.1,
    wobble: 0,
    wobbleSpeed: 0,
  });
}

// --- Drawing ---
function drawShip(x, y, w, h, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha ?? 1;
  ctx.translate(x, y);
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 250);
  const arrowW = w * 0.5;
  const arrowH = h * 0.9;
  ctx.shadowColor = '#0f0';
  ctx.shadowBlur = 12 + pulse * 6;
  ctx.fillStyle = '#0f0';
  ctx.strokeStyle = '#aff';
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(0, -arrowH / 2);
  ctx.lineTo(-arrowW / 2, arrowH / 4);
  ctx.lineTo(-arrowW / 6, arrowH / 4);
  ctx.lineTo(-arrowW / 6, arrowH / 2);
  ctx.lineTo(arrowW / 6, arrowH / 2);
  ctx.lineTo(arrowW / 6, arrowH / 4);
  ctx.lineTo(arrowW / 2, arrowH / 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = `rgba(0,255,255,${0.4 + 0.4 * pulse})`;
  ctx.beginPath();
  ctx.moveTo(0, -arrowH / 2 + 4);
  ctx.lineTo(-arrowW / 4, arrowH / 8);
  ctx.lineTo(arrowW / 4, arrowH / 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFallingLetter(fl) {
  ctx.save();
  ctx.translate(fl.x, fl.y);

  ctx.fillStyle = '#ffffff11';
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff33';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#ffffffcc';
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.font = 'bold 22px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fl.letter, 0, 1);

  ctx.restore();
}

function drawBullet(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.fillStyle = '#fffb7a';
  ctx.shadowColor = '#fffb7a';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.lineTo(6, 0);
  ctx.moveTo(0, -6);
  ctx.lineTo(0, 6);
  ctx.moveTo(-4.2, -4.2);
  ctx.lineTo(4.2, 4.2);
  ctx.moveTo(-4.2, 4.2);
  ctx.lineTo(4.2, -4.2);
  ctx.stroke();
  ctx.restore();
}

// Group letters — upper left, compact
function drawTopLetters() {
  const base = BASE_GROUPS[groupIdx];
  const boxW = 34, boxH = 28, gap = 4;
  const startX = 8;
  const y = 8;

  // Background strip
  const totalW = base.length * boxW + (base.length - 1) * gap;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.roundRect(startX - 5, y - 4, totalW + 10, boxH + 8, 7);
  ctx.fill();

  // --- TARGET BOX (right side, unchanged) ---
  const color = LETTER_COLORS[targetLetter.toUpperCase()];
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 260);
  const tw = 100, th = 58, tx = canvas.width - tw - 8, ty = 8;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 14 + pulse * 10;
  ctx.fillStyle = color + '22';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, th, 8);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#777';
  ctx.font = 'bold 10px Courier New';
  ctx.fillText('MATCH', tx + tw / 2, ty + 11);

  const display = round === 3
    ? `${targetLetter.toUpperCase()} ${targetLetter.toLowerCase()}`
    : targetLetter;
  ctx.fillStyle = '#fff';
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.font = `bold ${round === 3 ? 22 : 28}px Courier New`;
  ctx.fillText(display, tx + tw / 2, ty + th / 2 + 2);

  ctx.shadowBlur = 0;
  const dotR = 4, dotGap = 12;
  const dotsStartX = tx + tw / 2 - (HITS_REQUIRED - 1) * dotGap / 2;
  const dotsY = ty + th - 9;
  for (let d = 0; d < HITS_REQUIRED; d++) {
    ctx.beginPath();
    ctx.arc(dotsStartX + d * dotGap, dotsY, dotR, 0, Math.PI * 2);
    ctx.fillStyle = d < targetHits ? color : '#333';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();

  // Group letter boxes (upper left)
  for (let i = 0; i < base.length; i++) {
    const baseLetter = base[i];
    const col = LETTER_COLORS[baseLetter];
    const learned = learnedFlags[i] ?? false;
    const isTarget = targetIdx === i && !learned;
    const x = startX + i * (boxW + gap);

    ctx.save();
    ctx.fillStyle = isTarget ? col + '33' : learned ? '#ffffff08' : '#ffffff0c';
    ctx.strokeStyle = isTarget ? col : learned ? '#ffffff22' : '#ffffff25';
    ctx.lineWidth = isTarget ? 1.5 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 5);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = x + boxW / 2;
    const cy = y + boxH / 2 - (learned ? 3 : 0);

    if (round === 3) {
      ctx.font = `bold ${isTarget ? 13 : 11}px Courier New`;
      ctx.fillStyle = isTarget ? '#fff' : learned ? col + '55' : col + '99';
      ctx.fillText(`${baseLetter}${baseLetter.toLowerCase()}`, cx, cy);
    } else {
      const ltr = round === 2 ? baseLetter.toLowerCase() : baseLetter;
      ctx.font = `bold ${isTarget ? 18 : 15}px Courier New`;
      ctx.fillStyle = isTarget ? '#fff' : learned ? col + '55' : col + '99';
      ctx.fillText(ltr, cx, cy);
    }

    if (learned) {
      ctx.fillStyle = col + 'aa';
      ctx.font = 'bold 8px Courier New';
      ctx.fillText('✓', cx, y + boxH - 5);
    }

    ctx.restore();
  }
}

// Progress bar showing 5 base letters with learned status
function drawProgressBar() {
  const base = BASE_GROUPS[groupIdx];
  const g = currentGroup();
  const barW = 54, barH = 46, gap = 10;
  const totalW = base.length * barW + (base.length - 1) * gap;
  const startX = (canvas.width - totalW) / 2;
  const y = canvas.height - 72;

  for (let i = 0; i < base.length; i++) {
    const baseLetter = base[i];
    const color = LETTER_COLORS[baseLetter];

    // All rounds: 5 flags, one per letter
    const learned = learnedFlags[i] ?? false;
    const isCurrent = targetIdx === i && !learned;

    const x = startX + i * (barW + gap);
    ctx.save();

    ctx.fillStyle = learned ? color + '33' : isCurrent ? color + '22' : '#111';
    ctx.strokeStyle = learned ? color : isCurrent ? color : '#333';
    ctx.lineWidth = isCurrent ? 2.5 : 1.5;
    if (isCurrent) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 10 + 6 * Math.abs(Math.sin(Date.now() / 280));
    }
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (round === 3) {
      // Show Aa side by side
      ctx.font = `bold ${isCurrent ? 15 : 13}px Courier New`;
      ctx.fillStyle = learned ? color : isCurrent ? '#fff' : '#555';
      ctx.fillText(`${baseLetter}${baseLetter.toLowerCase()}`, x + barW / 2, y + barH / 2 - (learned ? 4 : 0));
    } else {
      ctx.fillStyle = learned ? color : isCurrent ? '#fff' : '#555';
      ctx.font = `bold ${isCurrent ? 24 : 20}px Courier New`;
      const display = round === 2 ? baseLetter.toLowerCase() : baseLetter;
      ctx.fillText(display, x + barW / 2, y + barH / 2 - (learned ? 4 : 0));
    }

    if (learned) {
      ctx.fillStyle = color;
      ctx.font = 'bold 11px Courier New';
      ctx.fillText('✓', x + barW / 2, y + barH - 8);
    } else if (isCurrent) {
      ctx.fillStyle = color;
      ctx.font = '10px Courier New';
      ctx.fillText('▲', x + barW / 2, y + barH - 8);
    }
    ctx.restore();
  }

  // Round badge (top-right of progress area)
  ctx.save();
  ctx.fillStyle = '#111';
  ctx.strokeStyle = round === 3 ? '#ff0' : round === 2 ? '#4af' : '#0f0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(canvas.width - 160, y, 148, 46, 6);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = round === 3 ? '#ff0' : round === 2 ? '#4af' : '#0f0';
  ctx.font = 'bold 11px Courier New';
  ctx.fillText(`ROUND ${round}`, canvas.width - 86, y + 12);
  ctx.fillStyle = '#aaa';
  ctx.font = '10px Courier New';
  ctx.fillText(ROUND_LABELS[round], canvas.width - 86, y + 30);
  ctx.restore();

  // Target prompt (bottom center)
  const color = letterColor(targetLetter);
  const bx = canvas.width / 2, by = canvas.height - 16;
  ctx.save();
  ctx.fillStyle = '#111';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(bx - 90, by - 14, 180, 28, 5);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#aaa';
  ctx.font = 'bold 13px Courier New';
  ctx.fillText('MATCH:', bx - 28, by);
  ctx.fillStyle = '#fff';
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.font = 'bold 22px Courier New';
  // Round 3: show both Aa
  const display = round === 3
    ? `${targetLetter.toUpperCase()} ${targetLetter.toLowerCase()}`
    : targetLetter;
  ctx.fillText(display, bx + 30, by);
  ctx.restore();
}

// --- Update ---
function update() {
  for (const s of stars || []) {
    s.y += s.speed;
    if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; }
  }
  particles = (particles || []).filter(p => {
    p.x += p.vx; p.y += p.vy; p.life--;
    p.vx *= 0.93; p.vy *= 0.93;
    return p.life > 0;
  });

  if (state === 'levelcomplete') {
    levelCompleteTimer--;
    if (levelCompleteTimer <= 0) {
      groupIdx++;
      if (groupIdx >= BASE_GROUPS.length) {
        if (round < 3) {
          unlockGroup(0, round + 1);
          roundComplete();
        } else {
          // All done!
          state = 'win';
          titleEl.textContent = '🎉 YOU WIN!';
          titleEl.style.color = '#ff0';
          titleEl.style.textShadow = '0 0 20px #ff0';
          subtitleEl.textContent = `You mastered the whole alphabet! Score: ${score}`;
          overlay.style.display = 'block';
        }
      } else {
        unlockGroup(groupIdx, round);
        letterSpeed = Math.min(0.55, 0.35 + (groupIdx + (round - 1) * BASE_GROUPS.length) * 0.008);
        spawnInterval = Math.max(45, 60 - groupIdx * 2);
        if (groupIdx % 2 === 0) {
          if (!(unlockedReviews[round] || []).includes(groupIdx)) {
            unlockedReviews[round].push(groupIdx);
            updatePanelLocks();
            saveProgress();
          }
          startReview();
        } else {
          initGroup();
        }
      }
    }
    return;
  }

  if (state === 'roundcomplete') {
    roundCompleteTimer--;
    if (roundCompleteTimer <= 0) {
      round++;
      groupIdx = 0;
      letterSpeed = 0.35 + (round - 1) * 0.03;
      spawnInterval = 60;
      initGroup(); // sets state = 'intro'
    }
    return;
  }

  if (state === 'intro') {
    introTimer++;
    if (introTimer === 1) {
      speakLetter(BASE_GROUPS[groupIdx][introLetterIdx]);
    }
    if (introTimer >= INTRO_LETTER_FRAMES) {
      introLetterIdx++;
      introTimer = 0;
      if (introLetterIdx >= BASE_GROUPS[groupIdx].length) {
        showTargetLetter();
      }
    }
    return;
  }

  if (state === 'target') {
    targetShowTimer++;
    // Keep existing letters falling in the background
    for (let i = fallingLetters.length - 1; i >= 0; i--) {
      const fl = fallingLetters[i];
      fl.y += fl.speed;
      if (fl.y > canvas.height + 30) fallingLetters.splice(i, 1);
    }
    if (targetShowTimer >= TARGET_SHOW_FRAMES) {
      // Top up to MAX_LETTERS with new letters (some will be the new target)
      const toSpawn = Math.max(3, MAX_LETTERS - fallingLetters.length);
      for (let i = 0; i < toSpawn; i++) spawnLetter();
      state = 'playing';
    }
    return;
  }

  if (state === 'reviewtarget') {
    targetShowTimer++;
    if (targetShowTimer >= TARGET_SHOW_FRAMES) {
      spawnReviewLetter(); spawnReviewLetter();
      state = 'review';
    }
    return;
  }

  if (state === 'review') {
    const reviewTarget = reviewQueue[reviewQueueIdx];
    if (keys['ArrowLeft'] || keys['a']) player.x -= player.speed;
    if (keys['ArrowRight'] || keys['d']) player.x += player.speed;
    player.x = Math.max(player.w / 2, Math.min(canvas.width - player.w / 2, player.x));
    if (shootCooldown > 0) shootCooldown--;
    if ((keys[' '] || keys['z']) && shootCooldown <= 0) {
      bullets.push({ x: player.x, y: player.y - player.h / 2, vy: -12 });
      shootCooldown = 14;
    }
    for (let i = fallingLetters.length - 1; i >= 0; i--) {
      const fl = fallingLetters[i];
      fl.y += fl.speed;
      if (fl.y > canvas.height + 30) { fallingLetters.splice(i, 1); spawnReviewLetter(); }
    }
    bullets = bullets.filter(b => {
      b.y += b.vy;
      if (b.y < -20) return false;
      for (let i = fallingLetters.length - 1; i >= 0; i--) {
        const fl = fallingLetters[i];
        if (Math.abs(b.x - fl.x) < 24 && Math.abs(b.y - fl.y) < 24) {
          const isHit = fl.letter.toUpperCase() === reviewTarget.toUpperCase();
          spawnParticlesAt(fl.x, fl.y, isHit ? (LETTER_COLORS[fl.letter.toUpperCase()] || '#fff') : '#444', isHit ? 18 : 5);
          fallingLetters.splice(i, 1);
          if (isHit) {
            reviewHitsOnCurrent++;
            speakLetter(reviewTarget.toUpperCase());
            score += 5; scoreEl.textContent = score;
            if (reviewHitsOnCurrent >= REVIEW_HITS) {
              reviewCompleted.add(reviewTarget.toUpperCase());
              reviewQueueIdx++;
              reviewHitsOnCurrent = 0;
              if (reviewQueueIdx >= reviewQueue.length) {
                if (reviewPhase === 1) {
                  // Move to phase 2: audio only
                  reviewPhase = 2;
                  reviewQueue = shuffle([...reviewAllLetters]);
                  reviewCompleted = new Set();
                  reviewQueueIdx = 0;
                  reviewHitsOnCurrent = 0;
                  fallingLetters = [];
                  bullets = [];
                  showReviewTarget();
                } else {
                  state = 'reviewcomplete';
                  reviewCompleteTimer = 180;
                  spawnParticlesAt(canvas.width / 2, canvas.height / 2, '#ff0', 60);
                  spawnParticlesAt(canvas.width / 3, canvas.height / 3, '#0ff', 40);
                  spawnParticlesAt(2 * canvas.width / 3, canvas.height / 3, '#f0f', 40);
                }
              } else {
                showReviewTarget();
              }
            } else {
              spawnReviewLetter();
            }
          }
          return false;
        }
      }
      return true;
    });
    spawnTimer++;
    if (spawnTimer >= spawnInterval && fallingLetters.length < MAX_LETTERS) { spawnTimer = 0; spawnReviewLetter(); }
    return;
  }

  if (state === 'reviewcomplete') {
    reviewCompleteTimer--;
    if (reviewCompleteTimer <= 0) initGroup();
    return;
  }

  if (state !== 'playing') return;

  if (keys['ArrowLeft'] || keys['a']) player.x -= player.speed;
  if (keys['ArrowRight'] || keys['d']) player.x += player.speed;
  player.x = Math.max(player.w / 2, Math.min(canvas.width - player.w / 2, player.x));
  if (player.invincible > 0) player.invincible--;

  if (shootCooldown > 0) shootCooldown--;
  if ((keys[' '] || keys['z']) && shootCooldown <= 0) {
    bullets.push({ x: player.x, y: player.y - player.h / 2, vy: -12 });
    shootCooldown = 14;
  }

  spawnTimer++;
  if (spawnTimer >= spawnInterval) { spawnTimer = 0; if (fallingLetters.length < MAX_LETTERS) spawnLetter(); }

  for (let i = fallingLetters.length - 1; i >= 0; i--) {
    const fl = fallingLetters[i];
    fl.wobble += fl.wobbleSpeed;
    fl.x += Math.sin(fl.wobble) * 0.4;
    fl.y += fl.speed;
    if (fl.y > canvas.height + 30) {
      fallingLetters.splice(i, 1);
    }
  }

  bullets = bullets.filter(b => {
    b.y += b.vy;
    if (b.y < -20) return false;
    for (let i = fallingLetters.length - 1; i >= 0; i--) {
      const fl = fallingLetters[i];
      if (Math.abs(b.x - fl.x) < 24 && Math.abs(b.y - fl.y) < 24) {
        if (isTargetMatch(fl)) {
          targetHits++;
          score += 10 * (round * (groupIdx + 1));
          scoreEl.textContent = score;
          spawnParticlesAt(fl.x, fl.y, letterColor(fl.letter), 18);
          speakLetter(BASE_GROUPS[groupIdx][targetIdx]);
          fallingLetters.splice(i, 1);
          if (targetHits >= HITS_REQUIRED) {
            learnedFlags[targetIdx] = true;
            fallingLetters = fallingLetters.filter(x => x.letter.toUpperCase() !== targetLetter.toUpperCase());
            nextTarget();
          }
        } else {
          spawnParticlesAt(fl.x, fl.y, '#555', 5);
        }
        return false;
      }
    }
    return true;
  });
}

function loseLife() {}

// --- Draw ---
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const s of stars || []) {
    ctx.globalAlpha = 0.5 + s.r * 0.2;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (state === 'menu') { drawCursor(); return; }

  if (state === 'intro') { drawIntro(); drawCursor(); return; }

  if (state === 'target') {
    for (const fl of fallingLetters) drawFallingLetter(fl);
    drawTargetShow(); drawCursor(); return;
  }

  if (state === 'reviewtarget') { drawReviewTargetShow(); drawCursor(); return; }
  if (state === 'review' || state === 'reviewcomplete') { drawReviewGame(); drawCursor(); return; }

  for (const p of particles) {
    ctx.globalAlpha = p.life / 55;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  drawTopLetters();

  for (const fl of fallingLetters) drawFallingLetter(fl);

  if (player.invincible <= 0 || Math.floor(player.invincible / 5) % 2 === 0) {
    drawShip(player.x, player.y, player.w, player.h);
  }

  for (const b of bullets) drawBullet(b);


  // Level complete banner
  if (state === 'levelcomplete') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#0f0'; ctx.shadowBlur = 20;
    ctx.fillStyle = '#0f0';
    ctx.font = 'bold 38px Courier New';
    ctx.fillText(`GROUP ${groupIdx + 1} COMPLETE!`, canvas.width / 2, canvas.height / 2 - 28);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.font = '22px Courier New';
    ctx.fillText(BASE_GROUPS[groupIdx].join('   '), canvas.width / 2, canvas.height / 2 + 18);
    ctx.fillStyle = '#666';
    ctx.font = '14px Courier New';
    if (groupIdx + 1 < BASE_GROUPS.length) {
      ctx.fillText(`Next group: ${BASE_GROUPS[groupIdx + 1].join(' ')}`, canvas.width / 2, canvas.height / 2 + 52);
    } else if (round < 3) {
      ctx.fillStyle = '#ff0';
      ctx.fillText(`Get ready for Round ${round + 1}: ${ROUND_LABELS[round + 1]}!`, canvas.width / 2, canvas.height / 2 + 52);
    }
    ctx.restore();
  }

  // Round complete banner
  if (state === 'roundcomplete') {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff0'; ctx.shadowBlur = 28;
    ctx.fillStyle = '#ff0';
    ctx.font = 'bold 42px Courier New';
    ctx.fillText(`ROUND ${round} COMPLETE!`, canvas.width / 2, canvas.height / 2 - 36);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0f0';
    ctx.font = 'bold 20px Courier New';
    ctx.fillText(`You mastered ${ROUND_LABELS[round]}!`, canvas.width / 2, canvas.height / 2 + 4);
    ctx.fillStyle = '#4af';
    ctx.font = '18px Courier New';
    ctx.fillText(`Round ${round + 1}: ${ROUND_LABELS[round + 1]}`, canvas.width / 2, canvas.height / 2 + 42);
    ctx.restore();
  }

  drawCursor();
}

function drawIntro() {
  const base = BASE_GROUPS[groupIdx];
  const g = currentGroup();
  const letter = g[introLetterIdx];
  const baseLetter = base[introLetterIdx];
  const color = LETTER_COLORS[baseLetter];

  let alpha;
  if (introTimer < INTRO_FADE_IN) {
    alpha = introTimer / INTRO_FADE_IN;
  } else if (introTimer > INTRO_LETTER_FRAMES - INTRO_FADE_OUT) {
    alpha = (INTRO_LETTER_FRAMES - introTimer) / INTRO_FADE_OUT;
  } else {
    alpha = 1;
  }

  const cx = canvas.width / 2;
  const cy = canvas.height / 2 - 20;

  // Glow circle background
  ctx.save();
  ctx.globalAlpha = alpha * 0.18;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 180);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 180, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Group label top
  ctx.save();
  ctx.globalAlpha = alpha * 0.6;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#888';
  ctx.font = 'bold 14px Courier New';
  ctx.fillText(`GROUP ${groupIdx + 1}  ·  LETTER ${introLetterIdx + 1} OF ${base.length}`, cx, 38);
  ctx.restore();

  // Main letter — uppercase only in round 1, lowercase + capital in parentheses in round 2+
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 60;
  ctx.fillStyle = color;
  if (round === 1) {
    ctx.font = 'bold 200px Courier New';
    ctx.fillText(baseLetter, cx, cy);
  } else {
    ctx.font = 'bold 200px Courier New';
    ctx.fillText(baseLetter.toLowerCase(), cx, cy - 40);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha * 0.75;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.fillStyle = color;
    ctx.font = 'bold 80px Courier New';
    ctx.fillText(`(${baseLetter})`, cx, cy + 120);
  }
  ctx.restore();

  // Previously shown letters row at bottom
  const revealedCount = introLetterIdx;
  if (revealedCount > 0) {
    const cellW = 52, cellH = 52, gap = 10;
    const totalW = revealedCount * cellW + (revealedCount - 1) * gap;
    const rowX = cx - totalW / 2;
    const rowY = canvas.height - 80;
    for (let i = 0; i < revealedCount; i++) {
      const rl = g[i];
      const rc = LETTER_COLORS[base[i]];
      const px = rowX + i * (cellW + gap);
      ctx.save();
      ctx.globalAlpha = alpha * 0.8;
      ctx.strokeStyle = rc;
      ctx.lineWidth = 1.5;
      ctx.fillStyle = rc + '22';
      ctx.beginPath();
      ctx.roundRect(px, rowY, cellW, cellH, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = rc;
      ctx.font = 'bold 26px Courier New';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = rc;
      ctx.shadowBlur = 6;
      ctx.fillText(rl, px + cellW / 2, rowY + cellH / 2);
      ctx.restore();
    }
  }

  // Dot progress indicators
  const dotY = canvas.height - 18;
  for (let i = 0; i < base.length; i++) {
    const dotX = cx + (i - (base.length - 1) / 2) * 18;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(dotX, dotY, i === introLetterIdx ? 5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = i < introLetterIdx ? LETTER_COLORS[base[i]]
                  : i === introLetterIdx ? '#fff' : '#333';
    ctx.fill();
    ctx.restore();
  }
}

function drawReviewTargetShow() {
  const letter = reviewQueue[reviewQueueIdx];
  const color = LETTER_COLORS[letter.toUpperCase()] || '#fff';
  const cx = canvas.width / 2, cy = canvas.height / 2 - 10;
  let alpha = targetShowTimer < TARGET_SHOW_FADE ? targetShowTimer / TARGET_SHOW_FADE
    : targetShowTimer > TARGET_SHOW_FRAMES - TARGET_SHOW_FADE ? (TARGET_SHOW_FRAMES - targetShowTimer) / TARGET_SHOW_FADE : 1;

  ctx.fillStyle = `rgba(0,0,0,${alpha * 0.78})`; ctx.fillRect(0, 0, canvas.width, canvas.height);

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 220);
  grad.addColorStop(0, color); grad.addColorStop(1, 'transparent');
  ctx.save(); ctx.globalAlpha = alpha * 0.22; ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(cx, cy, 220, 0, Math.PI * 2); ctx.fill(); ctx.restore();

  ctx.save(); ctx.globalAlpha = alpha * 0.7; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ff0'; ctx.font = 'bold 14px Courier New';
  const phaseLabel = reviewPhase === 1 ? '⭐ REVIEW — SEE & HEAR' : '🎧 REVIEW — LISTEN ONLY';
  ctx.fillText(`${phaseLabel}  —  ${reviewQueueIdx + 1} of ${reviewQueue.length}`, cx, 36);
  ctx.fillStyle = '#aaa'; ctx.font = 'bold 20px Courier New';
  ctx.fillText('SHOOT THIS LETTER!', cx, cy - 148);
  ctx.restore();

  const bounce = Math.sin(targetShowTimer / 16) * 10;
  if (reviewPhase === 1) {
    // Phase 1: show the letter
    ctx.save(); ctx.globalAlpha = alpha; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = color; ctx.shadowBlur = 55; ctx.fillStyle = color;
    ctx.font = 'bold 230px Courier New'; ctx.fillText(letter, cx, cy + bounce);
    ctx.restore();
  } else {
    // Phase 2: hide letter — show question mark with pulsing glow
    ctx.save(); ctx.globalAlpha = alpha; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#888'; ctx.shadowBlur = 30; ctx.fillStyle = '#444';
    ctx.font = 'bold 230px Courier New'; ctx.fillText('?', cx, cy + bounce);
    ctx.shadowBlur = 0; ctx.fillStyle = '#666'; ctx.font = 'bold 22px Courier New';
    ctx.fillText('Listen to the voice!', cx, cy + 140);
    ctx.restore();
  }

  ctx.save(); ctx.globalAlpha = alpha * 0.4; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#555'; ctx.font = '12px Courier New';
  ctx.fillText('SPACE or click to continue', cx, canvas.height - 20);
  ctx.restore();
}

function drawReviewGame() {
  const cx = canvas.width / 2;
  const reviewTarget = reviewQueue[reviewQueueIdx] ?? '';
  const color = LETTER_COLORS[reviewTarget.toUpperCase()] || '#fff';

  for (const p of particles) {
    ctx.globalAlpha = p.life / 55; ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Header
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, canvas.width, 58);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ff0'; ctx.shadowColor = '#ff0'; ctx.shadowBlur = 12; ctx.font = 'bold 18px Courier New';
  ctx.fillText(reviewPhase === 1 ? '⭐  REVIEW — SEE & HEAR  ⭐' : '🎧  REVIEW — LISTEN ONLY  🎧', cx, 18);
  ctx.shadowBlur = 0; ctx.fillStyle = '#aaa'; ctx.font = '13px Courier New';
  ctx.fillText(`Letter ${reviewQueueIdx + 1} of ${reviewQueue.length}${reviewPhase === 2 ? '  —  listen for the letter!' : ''}`, cx, 42);
  ctx.restore();

  // All-letters progress strip at bottom
  const stripH = 56;
  const stripY = canvas.height - stripH;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(0, stripY, canvas.width, stripH);

  const total = reviewAllLetters.length;
  const cellW = Math.min(46, (canvas.width - 16) / total);
  const cellH = stripH - 10;
  const startX = cx - (total * cellW) / 2;
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 260);

  for (let i = 0; i < total; i++) {
    const l = reviewAllLetters[i];
    const lUp = l.toUpperCase();
    const isDone = reviewCompleted.has(lUp);
    const isCurrent = reviewQueue[reviewQueueIdx]?.toUpperCase() === lUp && !isDone;
    const lColor = LETTER_COLORS[lUp] || '#fff';
    const px = startX + i * cellW;
    const py = stripY + 5;

    // Cell background
    ctx.fillStyle = isDone ? lColor + '28' : '#111';
    ctx.strokeStyle = isDone ? lColor : '#2a2a2a';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(px + 1, py, cellW - 2, cellH, 4);
    ctx.fill(); ctx.stroke();

    // Letter (phase 2 non-done = hidden)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const showLetter = !(reviewPhase === 2 && !isDone);
    ctx.fillStyle = isDone ? lColor : '#555';
    ctx.font = `bold ${Math.round(cellW * 0.52)}px Courier New`;
    ctx.fillText(showLetter ? l : '?', px + cellW / 2, py + cellH / 2 - (isDone ? 4 : 0));

    // Checkmark
    if (isDone) {
      ctx.fillStyle = lColor;
      ctx.font = `bold ${Math.round(cellW * 0.3)}px Courier New`;
      ctx.fillText('✓', px + cellW / 2, py + cellH - 7);
    }
  }
  ctx.restore();

  for (const fl of fallingLetters) drawFallingLetter(fl);
  drawShip(player.x, player.y, player.w, player.h);
  for (const b of bullets) drawBullet(b);

  if (state === 'reviewcomplete') {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff0'; ctx.shadowColor = '#ff0'; ctx.shadowBlur = 30; ctx.font = 'bold 48px Courier New';
    ctx.fillText('⭐  GREAT JOB!  ⭐', cx, canvas.height / 2 - 28);
    ctx.shadowBlur = 0; ctx.fillStyle = '#aaa'; ctx.font = '20px Courier New';
    ctx.fillText('You remembered all the letters!', cx, canvas.height / 2 + 22);
    ctx.restore();
  }
}

function drawTargetShow() {
  const base = BASE_GROUPS[groupIdx][targetIdx];
  const color = LETTER_COLORS[base];
  const cx = canvas.width / 2;
  const cy = canvas.height / 2 - 10;

  let alpha;
  if (targetShowTimer < TARGET_SHOW_FADE) {
    alpha = targetShowTimer / TARGET_SHOW_FADE;
  } else if (targetShowTimer > TARGET_SHOW_FRAMES - TARGET_SHOW_FADE) {
    alpha = (TARGET_SHOW_FRAMES - targetShowTimer) / TARGET_SHOW_FADE;
  } else {
    alpha = 1;
  }

  // Dark overlay
  ctx.fillStyle = `rgba(0,0,0,${alpha * 0.78})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Soft glow halo
  ctx.save();
  ctx.globalAlpha = alpha * 0.22;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 220);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // "SHOOT THIS LETTER!" label
  ctx.save();
  ctx.globalAlpha = alpha * 0.8;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#aaa';
  ctx.font = 'bold 20px Courier New';
  ctx.fillText('SHOOT THIS LETTER!', cx, cy - 148);
  ctx.restore();

  // Big bouncing letter
  const bounce = Math.sin(targetShowTimer / 16) * 10;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 55;
  ctx.fillStyle = color;
  ctx.font = 'bold 230px Courier New';
  ctx.fillText(targetLetter, cx, cy + bounce);
  ctx.restore();

  // Skip hint
  ctx.save();
  ctx.globalAlpha = alpha * 0.4;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#555';
  ctx.font = '12px Courier New';
  ctx.fillText('SPACE or click to continue', cx, canvas.height - 20);
  ctx.restore();
}

function drawCursor() {
  if (mouseX < 0 || mouseX > canvas.width) return;
  const t = Date.now() / 300;
  const colors = ['#ff4444', '#ffcc00', '#44ff88', '#44ccff', '#cc44ff'];
  const spikes = 5;
  const outerR = 14;
  const innerR = 6;
  ctx.save();
  ctx.translate(mouseX, mouseY);
  ctx.rotate(t);
  ctx.shadowBlur = 12;
  ctx.shadowColor = colors[Math.floor(t * 2) % colors.length];
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i * Math.PI) / spikes;
    const r = i % 2 === 0 ? outerR : innerR;
    i === 0 ? ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r)
             : ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  ctx.closePath();
  ctx.fillStyle = colors[Math.floor(t * 1.5) % colors.length];
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function skipIntro() {
  if (state !== 'intro') return;
  window.speechSynthesis.cancel();
  showTargetLetter();
}

function skipTargetShow() {
  if (state === 'target') {
    window.speechSynthesis.cancel();
    const toSpawn = Math.max(3, MAX_LETTERS - fallingLetters.length);
    for (let i = 0; i < toSpawn; i++) spawnLetter();
    state = 'playing';
  } else if (state === 'reviewtarget') {
    window.speechSynthesis.cancel();
    spawnReviewLetter(); spawnReviewLetter();
    state = 'review';
  }
}

const pauseBtn = document.getElementById('pause-btn');

function togglePause() {
  if (state === 'menu' || state === 'win' || state === 'dead') return;
  paused = !paused;
  if (paused) {
    window.speechSynthesis.cancel();
    pauseBtn.textContent = '▶';
    pauseBtn.classList.add('paused');
  } else {
    pauseBtn.textContent = '⏸';
    pauseBtn.classList.remove('paused');
  }
}

pauseBtn.addEventListener('click', togglePause);

document.getElementById('canvas-reset-btn').addEventListener('click', () => {
  if (confirm('Reset all progress and start from the beginning?')) resetProgress();
});

function drawPauseOverlay() {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ff0';
  ctx.shadowColor = '#ff0';
  ctx.shadowBlur = 24;
  ctx.font = 'bold 54px Courier New';
  ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2 - 20);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#555';
  ctx.font = '16px Courier New';
  ctx.fillText('Press P or click ▶ to continue', canvas.width / 2, canvas.height / 2 + 36);
  ctx.restore();
}

function loop() {
  if (!paused) update();
  draw();
  if (paused) drawPauseOverlay();
  requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key === ' ') e.preventDefault();
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { togglePause(); return; }
  if (paused) return;
  if (e.key === ' ' && state === 'intro') { skipIntro(); return; }
  if (e.key === ' ' && (state === 'target' || state === 'reviewtarget')) { skipTargetShow(); return; }
  if (e.key === ' ' && (state === 'menu' || state === 'dead' || state === 'win')) {
    overlay.style.display = 'none';
    titleEl.style.color = '#0f0';
    titleEl.style.textShadow = '0 0 20px #0f0';
    initGame(); // initGroup() inside sets state = 'intro'
  }
});
document.addEventListener('keyup', e => { keys[e.key] = false; });

// --- Mouse controls ---
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  mouseX = (e.clientX - rect.left) * scaleX;
  mouseY = (e.clientY - rect.top) * scaleY;
  if (state === 'playing' || state === 'review')
    player.x = Math.max(player.w / 2, Math.min(canvas.width - player.w / 2, mouseX));
});

canvas.addEventListener('mousedown', e => {
  e.preventDefault();
  if (state === 'intro') { skipIntro(); return; }
  if (state === 'target' || state === 'reviewtarget') { skipTargetShow(); return; }
  if (state === 'menu' || state === 'dead' || state === 'win') {
    overlay.style.display = 'none';
    titleEl.style.color = '#0f0';
    titleEl.style.textShadow = '0 0 20px #0f0';
    initGame(); // initGroup() inside sets state = 'intro'
    return;
  }
  if ((state === 'playing' || state === 'review') && shootCooldown <= 0) {
    bullets.push({ x: player.x, y: player.y - player.h / 2, vy: -12 });
    shootCooldown = 14;
  }
});

// --- Group panel ---
function unlockGroup(gIdx, r) {
  if (unlockedUpTo[r] === undefined || gIdx > unlockedUpTo[r]) {
    unlockedUpTo[r] = gIdx;
    saveProgress();
    updatePanelLocks();
  }
}

function resetProgress() {
  unlockedUpTo    = { 1: 0, 2: -1, 3: -1 };
  unlockedReviews = { 1: [], 2: [], 3: [] };
  try { localStorage.removeItem(saveKey()); } catch(e) {}
  updatePanelLocks();
  jumpToGroup(0, 1);
}

function jumpToGroup(gIdx, r) {
  if (gIdx > (unlockedUpTo[r] ?? -1)) return;
  overlay.style.display = 'none';
  score = 0; lives = 3; round = r; groupIdx = gIdx;
  scoreEl.textContent = 0;
  livesEl.textContent = 3;
  letterSpeed = 0.35;
  spawnInterval = 60;
  bullets = [];
  particles = [];
  player = { x: canvas.width / 2, y: canvas.height - 50, w: 40, h: 40, speed: 5, invincible: 0 };
  if (!stars) initStars();
  initGroup();
  updatePanelActive();
}

function jumpToReview(reviewAt, r) {
  if (!(unlockedReviews[r] || []).includes(reviewAt)) return;
  overlay.style.display = 'none';
  round = r;
  groupIdx = reviewAt; // startReview uses groupIdx to collect letters 0..groupIdx-1
  bullets = [];
  particles = [];
  player = { x: canvas.width / 2, y: canvas.height - 50, w: 40, h: 40, speed: 5, invincible: 0 };
  if (!stars) initStars();
  startReview();
  updatePanelActive();
}

function updatePanelActive() {
  document.querySelectorAll('.group-btn').forEach(btn => {
    const match = parseInt(btn.dataset.group) === groupIdx && parseInt(btn.dataset.round) === round;
    btn.classList.toggle('active', match);
    btn.classList.toggle('round2', match && round === 2);
  });
}

function updatePanelLocks() {
  document.querySelectorAll('.group-btn').forEach(btn => {
    const g = parseInt(btn.dataset.group);
    const r = parseInt(btn.dataset.round);
    const locked = g > (unlockedUpTo[r] ?? -1);
    btn.classList.toggle('locked', locked);
    btn.disabled = locked;
    if (locked) {
      btn.innerHTML = `<div style="font-size:11px;line-height:1.2;opacity:0.45">🔒</div><div style="font-size:8px;letter-spacing:0;opacity:0.3;margin-top:1px">${btn.dataset.letters}</div>`;
    } else {
      btn.textContent = btn.dataset.letters;
    }
  });
  document.querySelectorAll('.review-btn').forEach(btn => {
    const at = parseInt(btn.dataset.reviewAt);
    const r  = parseInt(btn.dataset.round);
    const unlocked = (unlockedReviews[r] || []).includes(at);
    btn.classList.toggle('unlocked', unlocked);
    btn.disabled = !unlocked;
    if (unlocked) {
      btn.textContent = `⭐ ${btn.dataset.label}`;
    } else {
      btn.innerHTML = `<div style="font-size:10px;line-height:1.2;opacity:0.4">🔒</div><div style="font-size:8px;opacity:0.25;margin-top:1px">${btn.dataset.label}</div>`;
    }
  });
}

function buildGroupPanel() {
  const panel = document.getElementById('group-panel');

  const title = document.createElement('div');
  title.className = 'panel-title';
  title.textContent = 'ABC FUN';
  panel.appendChild(title);

  const sections = [
    { label: 'CAPITALS', round: 1, cls: 'caps' },
    { label: 'lowercase', round: 2, cls: 'lower' },
  ];
  for (const { label, round: r, cls } of sections) {
    const hdr = document.createElement('div');
    hdr.className = `panel-section ${cls}`;
    hdr.textContent = label;
    panel.appendChild(hdr);
    for (let g = 0; g < BASE_GROUPS.length; g++) {
      const letters = r === 1
        ? BASE_GROUPS[g].join(' ')
        : BASE_GROUPS[g].map(l => l.toLowerCase()).join(' ');
      const btn = document.createElement('button');
      btn.className = 'group-btn';
      btn.dataset.group = g;
      btn.dataset.round = r;
      btn.dataset.letters = letters;
      btn.title = `${label}: ${letters}`;
      btn.addEventListener('click', () => jumpToGroup(g, r));
      panel.appendChild(btn);

      // Review button after every 2 groups
      if ((g + 1) % 2 === 0) {
        const reviewAt = g + 1;
        const first = r === 1 ? BASE_GROUPS[0][0] : BASE_GROUPS[0][0].toLowerCase();
        const last  = r === 1 ? BASE_GROUPS[g][BASE_GROUPS[g].length - 1]
                              : BASE_GROUPS[g][BASE_GROUPS[g].length - 1].toLowerCase();
        const rangeLabel = `${first}–${last}`;
        const rb = document.createElement('button');
        rb.className = 'review-btn';
        rb.dataset.reviewAt = reviewAt;
        rb.dataset.round = r;
        rb.dataset.label = rangeLabel;
        rb.title = `Review ${rangeLabel}`;
        rb.addEventListener('click', () => jumpToReview(reviewAt, r));
        panel.appendChild(rb);
      }
    }
  }

  const resetBtn = document.createElement('button');
  resetBtn.id = 'reset-btn';
  resetBtn.textContent = '↺ RESET';
  resetBtn.title = 'Reset all progress';
  resetBtn.addEventListener('click', resetProgress);
  panel.appendChild(resetBtn);

  updatePanelLocks();
}

// --- Persistence ---
function saveKey() { return 'abcfun_save_' + currentUser; }

function saveProgress() {
  try {
    localStorage.setItem(saveKey(), JSON.stringify({
      groupIdx, round, score,
      unlockedUpTo, unlockedReviews,
      learnedFlags: [...learnedFlags],
      targetIdx, targetHits
    }));
  } catch(e) {}
}

function loadAndResume(skipIntro = false) {
  try {
    const raw = localStorage.getItem(saveKey());
    if (!raw) return false;
    const d = JSON.parse(raw);
    groupIdx    = d.groupIdx    ?? 0;
    round       = d.round       ?? 1;
    score       = d.score       ?? 0;
    unlockedUpTo    = d.unlockedUpTo    ?? { 1: 0, 2: -1, 3: -1 };
    unlockedReviews = d.unlockedReviews ?? { 1: [], 2: [], 3: [] };
    learnedFlags = d.learnedFlags ?? [];
    targetIdx   = d.targetIdx   ?? 0;
    targetHits  = d.targetHits  ?? 0;

    const g = currentGroup();
    targetLetter = g[targetIdx] ?? g[0];
    letterSpeed  = Math.min(0.35, 0.22 + (groupIdx + (round - 1) * BASE_GROUPS.length) * 0.008);
    spawnInterval = Math.max(90, 110 - groupIdx * 3);

    scoreEl.textContent = score;
    livesEl.textContent = 3;
    waveEl.textContent  = `${groupIdx + 1}/${BASE_GROUPS.length}`;

    player = { x: canvas.width / 2, y: canvas.height - 50, w: 40, h: 40, speed: 5, invincible: 0 };
    bullets = []; particles = []; fallingLetters = [];
    overlay.style.display = 'none';

    if (skipIntro) {
      state = 'playing';
      spawnTimer = spawnInterval;
    } else {
      showTargetLetter();
    }
    updatePanelActive();
    updatePanelLocks();
    return true;
  } catch(e) { return false; }
}

// --- Multi-user ---
function getUsers() {
  try { return JSON.parse(localStorage.getItem('abcfun_users')) || ['Player 1']; } catch(e) { return ['Player 1']; }
}
function saveUsers(list) {
  try { localStorage.setItem('abcfun_users', JSON.stringify(list)); } catch(e) {}
}
function initUsers() {
  if (!localStorage.getItem('abcfun_users')) {
    const old = localStorage.getItem('abcfun_save');
    if (old) try { localStorage.setItem('abcfun_save_Player 1', old); } catch(e) {}
    saveUsers(['Player 1']);
  }
  const saved = localStorage.getItem('abcfun_current_user');
  const users = getUsers();
  currentUser = (saved && users.includes(saved)) ? saved : users[0];
  try { localStorage.setItem('abcfun_current_user', currentUser); } catch(e) {}
  updateUserBtn();
}
function updateUserBtn() {
  const btn = document.getElementById('user-btn');
  if (!btn) return;
  btn.textContent = currentUser.charAt(0).toUpperCase();
  btn.title = currentUser;
}
function renderUserPanel() {
  const list = document.getElementById('user-list');
  if (!list) return;
  const users = getUsers();
  list.innerHTML = '';
  users.forEach(name => {
    const row = document.createElement('div');
    row.className = 'up-row' + (name === currentUser ? ' up-current' : '');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = (name === currentUser ? '● ' : '○ ') + name;
    if (name !== currentUser) nameSpan.style.cursor = 'pointer';
    if (name !== currentUser) nameSpan.onclick = () => switchUser(name);
    row.appendChild(nameSpan);
    if (users.length > 1) {
      const del = document.createElement('button');
      del.className = 'up-del';
      del.textContent = '×';
      del.title = 'Delete ' + name;
      del.onclick = e => { e.stopPropagation(); if (confirm('Delete ' + name + '?')) deleteUser(name); };
      row.appendChild(del);
    }
    list.appendChild(row);
  });
}
function openUserPanel() {
  renderUserPanel();
  const panel = document.getElementById('user-panel');
  if (panel) { panel.style.display = 'block'; }
  const inp = document.getElementById('new-user-input');
  if (inp) inp.value = '';
}
function closeUserPanel() {
  const panel = document.getElementById('user-panel');
  if (panel) panel.style.display = 'none';
}
function switchUser(name) {
  saveProgress();
  currentUser = name;
  try { localStorage.setItem('abcfun_current_user', name); } catch(e) {}
  updateUserBtn();
  closeUserPanel();
  fallingLetters = []; bullets = []; particles = [];
  paused = false;
  if (!loadAndResume(true)) {
    state = 'menu';
    overlay.style.display = 'block';
    document.getElementById('title').textContent = 'ABC FUN';
    document.getElementById('subtitle').textContent = 'Match the glowing letter shown at the bottom!';
    updatePanelLocks();
  }
}
function addUser(name) {
  name = name.trim().slice(0, 16);
  if (!name) return;
  const users = getUsers();
  if (!users.includes(name)) { users.push(name); saveUsers(users); }
  switchUser(name);
}
function deleteUser(name) {
  let users = getUsers();
  users = users.filter(u => u !== name);
  saveUsers(users);
  try { localStorage.removeItem('abcfun_save_' + name); } catch(e) {}
  if (currentUser === name) switchUser(users[0]);
  else renderUserPanel();
}

document.getElementById('user-btn').addEventListener('click', () => {
  const panel = document.getElementById('user-panel');
  if (!panel.style.display || panel.style.display === 'none') openUserPanel();
  else closeUserPanel();
});
document.getElementById('add-user-confirm').addEventListener('click', () => {
  addUser(document.getElementById('new-user-input').value);
});
document.getElementById('new-user-input').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') addUser(e.target.value);
});
document.addEventListener('click', e => {
  const panel = document.getElementById('user-panel');
  const btn = document.getElementById('user-btn');
  if (panel && panel.style.display === 'block' && !panel.contains(e.target) && e.target !== btn) closeUserPanel();
});
document.getElementById('add-player-btn').addEventListener('click', () => {
  const users = getUsers();
  const nums = users.map(u => { const m = u.match(/^P(\d+)$/); return m ? parseInt(m[1]) : 0; });
  const next = Math.max(0, ...nums) + 1;
  addUser('P' + next);
});

buildGroupPanel();
initUsers();
initStars();
if (!loadAndResume()) { /* start at menu */ }
loop();
