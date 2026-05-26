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
  ['K','L','M','N','O'],
  ['P','Q','R','S','T'],
  ['U','V','W','X','Y','Z'],
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
let score = 0, lives = 3;
let round = 1;      // 1, 2, 3
let groupIdx = 0;
let learnedFlags = [];
let targetIdx = 0;
let targetLetter = '';   // the exact letter/case to shoot
let levelCompleteTimer = 0;
let roundCompleteTimer = 0;

let player, bullets, fallingLetters, particles, stars;
let keys = {};
let shootCooldown = 0;
let spawnTimer = 0;
let spawnInterval = 80;
let letterSpeed = 0.6;

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
function nextTarget() {
  const g = currentGroup();
  for (let i = 0; i < learnedFlags.length; i++) {
    if (!learnedFlags[i]) { targetIdx = i; targetLetter = g[i]; return; }
  }
  levelComplete();
}

function levelComplete() {
  state = 'levelcomplete';
  levelCompleteTimer = 150;
  spawnParticlesAt(canvas.width / 2, canvas.height / 2, '#0f0', 40);
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
  fallingLetters = [];
  spawnTimer = 0;
  waveEl.textContent = `${groupIdx + 1}/5`;
  for (let i = 0; i < 3; i++) spawnLetter();
}

function initGame() {
  score = 0; lives = 3; round = 1; groupIdx = 0;
  scoreEl.textContent = 0;
  livesEl.textContent = 3;
  letterSpeed = 1.4;
  spawnInterval = 80;
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

function spawnLetter() {
  const g = currentGroup();
  let letter;
  if (round < 3) {
    // 55% chance to spawn the target, else any group letter
    letter = Math.random() < 0.55 ? targetLetter : g[Math.floor(Math.random() * g.length)];
  } else {
    // Round 3: spawn target letter (either case, 50/50) or random group letter in random case
    const base = Math.random() < 0.6
      ? targetLetter.toUpperCase()
      : BASE_GROUPS[groupIdx][Math.floor(Math.random() * BASE_GROUPS[groupIdx].length)];
    letter = Math.random() < 0.5 ? base : base.toLowerCase();
  }
  fallingLetters.push({
    letter,
    x: 50 + Math.random() * (canvas.width - 100),
    y: -36,
    speed: letterSpeed + Math.random() * 0.3,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: (Math.random() - 0.5) * 0.04,
  });
}

// --- Drawing ---
function drawShip(x, y, w, h, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha ?? 1;
  ctx.translate(x, y);
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
  ctx.shadowColor = '#0f0';
  ctx.shadowBlur = 8 + pulse * 6;
  ctx.strokeStyle = '#0f0';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  const r = w * 0.42;
  ctx.beginPath();
  ctx.arc(r * 0.18, -r * 0.55, r * 0.55, Math.PI * 0.05, Math.PI, true);
  ctx.arc(-r * 0.18, r * 0.55, r * 0.55, Math.PI * 1.05, 0, false);
  ctx.stroke();
  ctx.shadowBlur = 12;
  ctx.fillStyle = `rgba(0,200,255,${0.5 + 0.4 * pulse})`;
  ctx.beginPath();
  ctx.ellipse(0, h * 0.45, 5, 4 + pulse * 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFallingLetter(fl) {
  const color = letterColor(fl.letter);
  const isTarget = isTargetMatch(fl);
  const base = BASE_GROUPS[groupIdx];
  const idx = base.indexOf(fl.letter.toUpperCase());
  const isLearned = idx >= 0 && learnedFlags[idx];

  ctx.save();
  ctx.translate(fl.x, fl.y);

  if (isTarget) {
    const p = 0.4 + 0.4 * Math.abs(Math.sin(Date.now() / 280));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = p;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = isLearned ? '#ffffff08' : isTarget ? color + '33' : '#ffffff11';
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = isLearned ? '#ffffff22' : isTarget ? color : '#ffffff33';
  ctx.lineWidth = isTarget ? 2 : 1;
  ctx.stroke();

  ctx.globalAlpha = isLearned ? 0.25 : 1;
  ctx.fillStyle = isTarget ? '#fff' : color + 'cc';
  ctx.shadowColor = isTarget ? color : 'transparent';
  ctx.shadowBlur = isTarget ? 10 : 0;
  ctx.font = `bold ${isTarget ? 26 : 22}px Courier New`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fl.letter, 0, 1);

  ctx.restore();
}

function drawBullet(b) {
  ctx.save();
  ctx.fillStyle = '#ff0';
  ctx.shadowColor = '#ff0';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.rect(b.x - 3, b.y - 8, 6, 16);
  ctx.fill();
  ctx.restore();
}

// Top banner: 5 letters of current group, target highlighted
function drawTopLetters() {
  const base = BASE_GROUPS[groupIdx];
  const boxW = 72, boxH = 58, gap = 12;
  const totalW = base.length * boxW + (base.length - 1) * gap;
  const startX = (canvas.width - totalW) / 2;
  const y = 8;

  // Background strip
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(startX - 14, y - 4, totalW + 28, boxH + 8, 10);
  ctx.fill();

  for (let i = 0; i < base.length; i++) {
    const baseLetter = base[i];
    const color = LETTER_COLORS[baseLetter];
    const learned = learnedFlags[i] ?? false;
    const isTarget = targetIdx === i && !learned;
    const x = startX + i * (boxW + gap);
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 260);

    ctx.save();

    // Box
    if (isTarget) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 16 + pulse * 10;
    }
    ctx.fillStyle = isTarget ? color + '33' : learned ? '#ffffff0a' : '#ffffff0f';
    ctx.strokeStyle = isTarget ? color : learned ? '#ffffff22' : '#ffffff28';
    ctx.lineWidth = isTarget ? 2.5 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 8);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Letter(s)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const centerX = x + boxW / 2;
    const centerY = y + boxH / 2 - (learned ? 5 : 0);

    if (round === 3) {
      ctx.font = `bold ${isTarget ? 22 : 17}px Courier New`;
      ctx.fillStyle = isTarget ? '#fff' : learned ? color + '55' : color + '99';
      if (isTarget) { ctx.shadowColor = color; ctx.shadowBlur = 10; }
      ctx.fillText(`${baseLetter}${baseLetter.toLowerCase()}`, centerX, centerY);
    } else {
      const display = round === 2 ? baseLetter.toLowerCase() : baseLetter;
      ctx.font = `bold ${isTarget ? 32 : 24}px Courier New`;
      ctx.fillStyle = isTarget ? '#fff' : learned ? color + '55' : color + '99';
      if (isTarget) { ctx.shadowColor = color; ctx.shadowBlur = 10; }
      ctx.fillText(display, centerX, centerY);
    }
    ctx.shadowBlur = 0;

    // Checkmark on learned
    if (learned) {
      ctx.fillStyle = color + 'aa';
      ctx.font = 'bold 13px Courier New';
      ctx.fillText('✓', centerX, y + boxH - 9);
    }

    // Animated arrow below target
    if (isTarget) {
      const bounce = Math.sin(Date.now() / 200) * 2;
      ctx.fillStyle = color;
      ctx.font = '11px Courier New';
      ctx.fillText('▼', centerX, y + boxH - 8 + bounce);
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
  ctx.fillText('SHOOT:', bx - 28, by);
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
        letterSpeed = Math.min(1.8, 0.6 + (groupIdx + (round - 1) * 5) * 0.08);
        spawnInterval = Math.max(45, 80 - groupIdx * 5);
        initGroup();
        state = 'playing';
      }
    }
    return;
  }

  if (state === 'roundcomplete') {
    roundCompleteTimer--;
    if (roundCompleteTimer <= 0) {
      round++;
      groupIdx = 0;
      letterSpeed = 0.6 + (round - 1) * 0.15;
      spawnInterval = 80;
      initGroup();
      state = 'playing';
    }
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
  if (spawnTimer >= spawnInterval) { spawnTimer = 0; spawnLetter(); }

  for (let i = fallingLetters.length - 1; i >= 0; i--) {
    const fl = fallingLetters[i];
    fl.wobble += fl.wobbleSpeed;
    fl.x += Math.sin(fl.wobble) * 0.4;
    fl.y += fl.speed;
    if (fl.y > canvas.height + 30) {
      if (isTargetMatch(fl)) loseLife();
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
          score += 10 * (round * (groupIdx + 1));
          scoreEl.textContent = score;
          spawnParticlesAt(fl.x, fl.y, letterColor(fl.letter), 18);
          learnedFlags[targetIdx] = true;
          // Remove all copies of this letter (any case) from screen
          fallingLetters = fallingLetters.filter(x => x.letter.toUpperCase() !== fl.letter.toUpperCase());
          nextTarget();
        } else {
          spawnParticlesAt(fl.x, fl.y, '#555', 5);
        }
        return false;
      }
    }
    return true;
  });
}

function loseLife() {
  if (player.invincible > 0) return;
  spawnParticlesAt(player.x, player.y - 10, '#f44', 20);
  lives--;
  livesEl.textContent = lives;
  player.invincible = 90;
  if (lives <= 0) {
    state = 'dead';
    titleEl.textContent = 'GAME OVER';
    titleEl.style.color = '#f44';
    titleEl.style.textShadow = '0 0 20px #f44';
    subtitleEl.textContent = `Score: ${score} — Press SPACE to Retry`;
    overlay.style.display = 'block';
  }
}

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

  if (state === 'menu') return;

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
}

function loop() { update(); draw(); requestAnimationFrame(loop); }

document.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key === ' ') e.preventDefault();
  if (e.key === ' ' && (state === 'menu' || state === 'dead' || state === 'win')) {
    overlay.style.display = 'none';
    titleEl.style.color = '#0f0';
    titleEl.style.textShadow = '0 0 20px #0f0';
    initGame();
    state = 'playing';
  }
});
document.addEventListener('keyup', e => { keys[e.key] = false; });

// --- Mouse controls ---
canvas.addEventListener('mousemove', e => {
  if (state !== 'playing') return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  player.x = Math.max(player.w / 2, Math.min(canvas.width - player.w / 2,
    (e.clientX - rect.left) * scaleX));
});

canvas.addEventListener('mousedown', e => {
  e.preventDefault();
  if (state === 'menu' || state === 'dead' || state === 'win') {
    overlay.style.display = 'none';
    titleEl.style.color = '#0f0';
    titleEl.style.textShadow = '0 0 20px #0f0';
    initGame();
    state = 'playing';
    return;
  }
  if (state === 'playing' && shootCooldown <= 0) {
    bullets.push({ x: player.x, y: player.y - player.h / 2, vy: -12 });
    shootCooldown = 14;
  }
});

initStars();
loop();
