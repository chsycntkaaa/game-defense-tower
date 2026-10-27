/**
 * 2D Tower Defense Engine
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- WEB AUDIO API (SYNTH SOUND GENERATOR) ---
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
  if (!audioCtx) audioCtx = new AudioCtx();
}

function playSound(type) {
  try {
    initAudio();
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'shoot') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'hit') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(50, now + 0.08);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'coin') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, now);
      osc.frequency.setValueAtTime(1318.51, now + 0.08);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch (e) {
    console.error("Audio Error:", e);
  }
}

// --- GAME STATE ---
const gameState = {
  health: 20,
  gold: 150,
  wave: 1,
  isWaveActive: false,
  selectedTowerType: 'basic',
  gameOver: false
};

// --- MAP WAYPOINTS (PATH) ---
const waypoints = [
  { x: -20, y: 240 },
  { x: 160, y: 240 },
  { x: 160, y: 100 },
  { x: 400, y: 100 },
  { x: 400, y: 380 },
  { x: 640, y: 380 },
  { x: 640, y: 240 },
  { x: 820, y: 240 }
];

// Potential Tower Placement Slots
const placementSlots = [
  { x: 80, y: 170, occupied: false },
  { x: 80, y: 310, occupied: false },
  { x: 280, y: 170, occupied: false },
  { x: 280, y: 30, occupied: false },
  { x: 480, y: 240, occupied: false },
  { x: 480, y: 440, occupied: false },
  { x: 560, y: 170, occupied: false },
  { x: 720, y: 170, occupied: false },
  { x: 720, y: 310, occupied: false }
];

// --- CLASSES ---
class Enemy {
  constructor(healthMultiplier = 1, speedMultiplier = 1) {
    this.x = waypoints[0].x;
    this.y = waypoints[0].y;
    this.radius = 12;
    this.waypointIndex = 0;
    this.maxHealth = 50 * healthMultiplier;
    this.health = this.maxHealth;
    this.speed = 1.8 * speedMultiplier;
    this.goldReward = 20;
  }

  draw() {
    // Health Bar
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(this.x - 15, this.y - 22, 30, 5);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(this.x - 15, this.y - 22, (this.health / this.maxHealth) * 30, 5);

    // Body
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#10b981';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#047857';
    ctx.stroke();
  }

  update() {
    this.draw();
    const target = waypoints[this.waypointIndex + 1];
    if (!target) return;

    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const angle = Math.atan2(dy, dx);

    this.x += Math.cos(angle) * this.speed;
    this.y += Math.sin(angle) * this.speed;

    const distance = Math.hypot(target.x - this.x, target.y - this.y);
    if (distance < this.speed) {
      this.waypointIndex++;
    }
  }
}

class Tower {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.radius = 20;
    this.target = null;
    this.fireTimer = 0;

    if (type === 'basic') {
      this.range = 140;
      this.damage = 15;
      this.fireRate = 30; // Frames per shot
      this.color = '#3b82f6';
      this.cost = 100;
    } else if (type === 'cannon') {
      this.range = 100;
      this.damage = 45;
      this.fireRate = 60;
      this.color = '#ef4444';
      this.cost = 175;
    }
  }

  draw() {
    // Range Circle on Hover/Selection
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(59, 130, 246, 0.05)';
    ctx.fill();

    // Tower Base
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Cannon Barrel Angle
    let angle = 0;
    if (this.target) {
      angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(angle);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, -4, 22, 8);
    ctx.restore();
  }

  update(enemies, projectiles) {
    this.draw();
    this.fireTimer++;

    // Find Target
    this.target = null;
    for (const enemy of enemies) {
      const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      if (dist < this.range) {
        this.target = enemy;
        break;
      }
    }

    // Shoot Projectile
    if (this.target && this.fireTimer >= this.fireRate) {
      projectiles.push(new Projectile(this.x, this.y, this.target, this.damage, this.type));
      playSound('shoot');
      this.fireTimer = 0;
    }
  }
}

class Projectile {
  constructor(x, y, target, damage, type) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.damage = damage;
    this.type = type;
    this.speed = 6;
    this.radius = type === 'cannon' ? 5 : 3;
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.type === 'cannon' ? '#f97316' : '#60a5fa';
    ctx.fill();
  }

  update(projectiles, index) {
    this.draw();
    if (!this.target || this.target.health <= 0) {
      projectiles.splice(index, 1);
      return;
    }

    const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
    this.x += Math.cos(angle) * this.speed;
    this.y += Math.sin(angle) * this.speed;

    // Hit Detection
    const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
    if (dist < this.target.radius) {
      this.target.health -= this.damage;
      playSound('hit');
      projectiles.splice(index, 1);
    }
  }
}

// --- ARRAYS ---
let enemies = [];
let towers = [];
let projectiles = [];

// --- RENDERING HELPERS ---
function drawMap() {
  // Clear Canvas
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw Path Lines
  ctx.beginPath();
  ctx.moveTo(waypoints[0].x, waypoints[0].y);
  for (let i = 1; i < waypoints.length; i++) {
    ctx.lineTo(waypoints[i].x, waypoints[i].y);
  }
  ctx.lineWidth = 40;
  ctx.strokeStyle = '#334155';
  ctx.stroke();

  ctx.lineWidth = 36;
  ctx.strokeStyle = '#1e293b';
  ctx.stroke();

  // Draw Placement Slots
  placementSlots.forEach(slot => {
    ctx.beginPath();
    ctx.arc(slot.x, slot.y, 22, 0, Math.PI * 2);
    ctx.fillStyle = slot.occupied ? 'rgba(30, 41, 59, 0.4)' : 'rgba(16, 185, 129, 0.15)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = slot.occupied ? '#475569' : '#10b981';
    ctx.stroke();
  });
}

function updateUI() {
  document.getElementById('ui-health').textContent = gameState.health;
  document.getElementById('ui-gold').textContent = gameState.gold;
  document.getElementById('ui-wave').textContent = gameState.wave;
}

// --- WAVE SPAWNER ---
function spawnWave() {
  if (gameState.isWaveActive) return;

  gameState.isWaveActive = true;
  document.getElementById('btn-next-wave').disabled = true;
  document.getElementById('btn-next-wave').classList.add('opacity-50');

  let enemiesToSpawn = 5 + gameState.wave * 3;
  let spawned = 0;

  const spawnInterval = setInterval(() => {
    if (spawned < enemiesToSpawn) {
      enemies.push(new Enemy(1 + gameState.wave * 0.2, 1 + gameState.wave * 0.05));
      spawned++;
    } else {
      clearInterval(spawnInterval);
    }
  }, 1000);
}

// --- INTERACTION ---
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  placementSlots.forEach(slot => {
    const dist = Math.hypot(slot.x - mouseX, slot.y - mouseY);
    if (dist < 22 && !slot.occupied) {
      const cost = gameState.selectedTowerType === 'basic' ? 100 : 175;
      if (gameState.gold >= cost) {
        gameState.gold -= cost;
        slot.occupied = true;
        towers.push(new Tower(slot.x, slot.y, gameState.selectedTowerType));
        playSound('coin');
        updateUI();
      } else {
        alert("Emas tidak cukup!");
      }
    }
  });
});

// Tower Selection Tabs
document.querySelectorAll('.tower-select-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tower-select-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    gameState.selectedTowerType = btn.dataset.type;
  });
});

document.getElementById('btn-next-wave').addEventListener('click', spawnWave);
document.getElementById('btn-restart').addEventListener('click', () => location.reload());

// --- MAIN GAME LOOP ---
function gameLoop() {
  if (gameState.gameOver) return;

  drawMap();

  // Update Towers
  towers.forEach(tower => tower.update(enemies, projectiles));

  // Update Projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    projectiles[i].update(projectiles, i);
  }

  // Update Enemies
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    enemy.update();

    // Enemy Reached End
    if (enemy.waypointIndex >= waypoints.length - 1) {
      gameState.health -= 1;
      enemies.splice(i, 1);
      updateUI();

      if (gameState.health <= 0) {
        gameState.gameOver = true;
        document.getElementById('game-overlay').classList.remove('hidden');
        document.getElementById('game-overlay').classList.add('flex');
      }
      continue;
    }

    // Enemy Defeated
    if (enemy.health <= 0) {
      gameState.gold += enemy.goldReward;
      playSound('coin');
      enemies.splice(i, 1);
      updateUI();
    }
  }

  // Check Wave Completion
  if (gameState.isWaveActive && enemies.length === 0) {
    gameState.isWaveActive = false;
    gameState.wave += 1;
    gameState.gold += 50; // Bonus Wave Clear
    updateUI();

    const btn = document.getElementById('btn-next-wave');
    btn.disabled = false;
    btn.classList.remove('opacity-50');
  }

  requestAnimationFrame(gameLoop);
}

// Start Engine
updateUI();
requestAnimationFrame(gameLoop);
