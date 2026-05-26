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

// --- State ---
let state = 'menu';
let score = 0, lives = 3, level = 1;
let player, bullets, fallingLetters, particles, stars;
let keys = {};
let shootCooldown = 0;
let targetLetter = '';
let spawnTimer = 0;
let spawnInterval = 90;
let letterSpeed = 1.2;
let lettersDestroyed = 0;
let perLevel = 10;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LETTER_COLORS = {
  A:'#ff4444',B:'#ff8844',C:'#ffcc44',D:'#aaff44',E:'#44ff88',
  F:'#44ffcc',G:'#44ccff',H:'#4488ff',I:'#8844ff',J:'#cc44ff',
  K:'#ff44cc',L:'#ff4488',M:'#ff6655',N:'#55ff66',O:'#66aaff',
  P:'#ffaa55',Q:'#aa55ff',R:'#55ffaa',S:'#ff55aa',T:'#aaffaa',
  U:'#ffaaff',V:'#aaffff',W:'#ffffaa',X:'#ff9999',Y:'#99ff99',Z:'#9999ff'
};

function pickTargetLetter() {
  // Bias toward letters currently on screen, sometimes pick a new one
  const onScreen = fallingLetters.map(l => l.letter);
  if (onScreen.length > 0 && Math.random() < 0.7) {
    return onScreen[Math.floor(Math.random() * onScreen.length)];
  }
  return ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
}

function initStars() {
  stars = Array.from({ length: 100 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 1.2 + 0.3,
    speed: Math.random() * 0.4 + 0.1,
  }));
}

function createPlayer() {
  return { x: canvas.width / 2, y: canvas.height - 50, w: 40, h: 40, speed: 5, invincible: 0 };
}

function spawnLetter() {
  const letter = ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  fallingLetters.push({
    letter,
    x: 50 + Math.random() * (canvas.width - 100),
    y: -30,
    speed: letterSpeed + Math.random() * 0.5,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: (Math.random() - 0.5) * 0.05,
  });
}

function initGame() {
  score = 0; lives = 3; level = 1;
  lettersDestroyed = 0;
  letterSpeed = 1.2;
  spawnInterval = 90;
  player = createPlayer();
  bullets = [];
  fallingLetters = [];
  particles = [];
  initStars();
  // Spawn a few to start
  for (let i = 0; i < 3; i++) spawnLetter();
  targetLetter = fallingLetters[0].letter;
  spawnTimer = 0;
  scoreEl.textContent = 0;
  livesEl.textContent = 3;
  waveEl.textContent = 1;
}

// --- Drawing ---
function drawShip(x, y, w, h, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha ?? 1;
  ctx.translate(x, y);
  ctx.strokeStyle = '#0f0';
  ctx.fillStyle = 'rgba(0,255,0,0.15)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(-w / 2, h / 2);
  ctx.lineTo(-w / 4, h / 4);
  ctx.lineTo(0, h / 3);
  ctx.lineTo(w / 4, h / 4);
  ctx.lineTo(w / 2, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Engine thrust
  const thrust = 0.5 + 0.5 * Math.sin(Date.now() / 80);
  ctx.fillStyle = `rgba(0,180,255,${thrust})`;
  ctx.beginPath();
  ctx.ellipse(-w / 5, h / 3, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w / 5, h / 3, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFallingLetter(fl) {
  const color = LETTER_COLORS[fl.letter];
  const isTarget = fl.letter === targetLetter;
  ctx.save();
  ctx.translate(fl.x, fl.y);
  // Glow ring for target
  if (isTarget) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.4 + 0.4 * Math.abs(Math.sin(Date.now() / 300));
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // Background circle
  ctx.fillStyle = isTarget ? color + '44' : '#ffffff11';
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = isTarget ? color : '#ffffff44';
  ctx.lineWidth = isTarget ? 2 : 1;
  ctx.stroke();
  // Letter
  ctx.fillStyle = isTarget ? '#fff' : color + 'bb';
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

function spawnParticles(x, y, color, count = 14) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4 + 1;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 35, color });
  }
}

// --- Update ---
function update() {
  if (state !== 'playing') return;

  // Stars
  for (const s of stars) {
    s.y += s.speed;
    if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; }
  }

  // Spawn letters
  spawnTimer++;
  if (spawnTimer >= spawnInterval) {
    spawnTimer = 0;
    spawnLetter();
  }

  // Player move (left/right only — fixed at bottom)
  if (keys['ArrowLeft'] || keys['a']) player.x -= player.speed;
  if (keys['ArrowRight'] || keys['d']) player.x += player.speed;
  player.x = Math.max(player.w / 2, Math.min(canvas.width - player.w / 2, player.x));
  if (player.invincible > 0) player.invincible--;

  // Shooting
  if (shootCooldown > 0) shootCooldown--;
  if ((keys[' '] || keys['z']) && shootCooldown <= 0) {
    bullets.push({ x: player.x, y: player.y - player.h / 2, vy: -12 });
    shootCooldown = 14;
  }

  // Falling letters
  for (let i = fallingLetters.length - 1; i >= 0; i--) {
    const fl = fallingLetters[i];
    fl.wobble += fl.wobbleSpeed;
    fl.x += Math.sin(fl.wobble) * 0.4;
    fl.y += fl.speed;
    if (fl.y > canvas.height + 30) {
      // Letter escaped — lose a life if it was the target
      if (fl.letter === targetLetter) {
        loseLife();
      }
      fallingLetters.splice(i, 1);
    }
  }

  // Always keep a valid target
  if (!fallingLetters.find(fl => fl.letter === targetLetter)) {
    if (fallingLetters.length > 0) {
      targetLetter = fallingLetters[Math.floor(Math.random() * fallingLetters.length)].letter;
    }
  }

  // Bullets
  bullets = bullets.filter(b => {
    b.y += b.vy;
    if (b.y < -20) return false;
    // Hit a falling letter
    for (let i = fallingLetters.length - 1; i >= 0; i--) {
      const fl = fallingLetters[i];
      if (Math.abs(b.x - fl.x) < 24 && Math.abs(b.y - fl.y) < 24) {
        if (fl.letter === targetLetter) {
          // Correct hit!
          score += 10 * level;
          scoreEl.textContent = score;
          lettersDestroyed++;
          spawnParticles(fl.x, fl.y, LETTER_COLORS[fl.letter], 18);
          fallingLetters.splice(i, 1);
          // Pick next target
          if (fallingLetters.length > 0) {
            targetLetter = fallingLetters[Math.floor(Math.random() * fallingLetters.length)].letter;
          } else {
            targetLetter = ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
          }
          // Level up
          if (lettersDestroyed > 0 && lettersDestroyed % perLevel === 0) {
            level++;
            waveEl.textContent = level;
            letterSpeed = Math.min(4, 1.2 + (level - 1) * 0.25);
            spawnInterval = Math.max(40, 90 - (level - 1) * 6);
          }
        } else {
          // Wrong letter — small penalty flash, no score
          spawnParticles(fl.x, fl.y, '#888', 6);
          // Bullet consumed anyway
        }
        return false;
      }
    }
    return true;
  });

  // Particles
  particles = particles.filter(p => {
    p.x += p.vx; p.y += p.vy; p.life--;
    p.vx *= 0.92; p.vy *= 0.92;
    return p.life > 0;
  });
}

function loseLife() {
  if (player.invincible > 0) return;
  spawnParticles(player.x, player.y - 10, '#f44', 20);
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
function drawHUD() {
  if (!targetLetter) return;
  const color = LETTER_COLORS[targetLetter];
  // Target box
  const bx = canvas.width / 2, by = canvas.height - 18;
  ctx.save();
  ctx.font = 'bold 14px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#333';
  ctx.fillRect(bx - 80, by - 14, 160, 28);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx - 80, by - 14, 160, 28);
  ctx.fillStyle = '#aaa';
  ctx.fillText('SHOOT: ', bx - 22, by);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px Courier New';
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillText(targetLetter, bx + 30, by);
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Stars
  for (const s of stars || []) {
    ctx.globalAlpha = 0.5 + s.r * 0.2;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (state === 'menu') return;

  // Particles
  for (const p of particles) {
    ctx.globalAlpha = p.life / 35;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Falling letters
  for (const fl of fallingLetters) drawFallingLetter(fl);

  // Player
  if (player.invincible <= 0 || Math.floor(player.invincible / 5) % 2 === 0) {
    drawShip(player.x, player.y, player.w, player.h);
  }

  // Bullets
  for (const b of bullets) drawBullet(b);

  // HUD target display
  drawHUD();
}

// --- Loop ---
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// --- Input ---
document.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key === ' ') e.preventDefault();
  if (e.key === ' ' && (state === 'menu' || state === 'dead')) {
    overlay.style.display = 'none';
    titleEl.style.color = '#0f0';
    titleEl.style.textShadow = '0 0 20px #0f0';
    initGame();
    state = 'playing';
  }
});
document.addEventListener('keyup', e => { keys[e.key] = false; });

// --- Start ---
initStars();
loop();
