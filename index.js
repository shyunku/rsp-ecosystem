const simulationCanvas = document.getElementById("simulation");
const simulationCtx = simulationCanvas.getContext("2d");
function resizeCanvas() {
  const width = simulationCanvas.clientWidth;
  const height = simulationCanvas.clientHeight;
  simulationCanvas.width = width;
  simulationCanvas.height = height;

  const chartCanvas = document.getElementById("chart");
  chartCanvas.style.width = "100%";
  chartCanvas.style.height = "30%";
  chartCanvas.width = width;
  chartCanvas.height = (height / 0.7) * 0.3;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();
simulationCanvas.style.width = "100%";
simulationCanvas.style.height = "70%";
const chartCtx = document.getElementById("chart").getContext("2d");

// Initial Population Setup
const entities = [];
const entityTypes = ["rock", "paper", "scissors"];
const ENTITY_COUNT = 90; // 개체의 초기 개수
const ENTITY_SIZE = 6; // 개체의 기준 크기
const REPRODUCTION_BASE_INTERVAL = 480; //  자식을 낳는 주기
const REPRODUCTION_VARIATION_RATE = 0.4; // 개체별 자식을 낳는 주기의 랜덤 인자
const DIRECTION_CHANGE_INTERVAL = 160; // 개체가 방향을 바꾸는 주기
const SIGHT_RADIUS = 90; // 개체의 시야 반경
const SPEED = 0.6; // 개체의 이동 속도

const SPLIT_MIN_HUNGER_REQUIREMENT = 100; // 긴급 분열을 위한 최소 포만도
const SPLIT_PREDATOR_AVOIDANCE_RADIUS = 15; // 긴급 분열을 위한 포식자 회피 반경 (포식자가 이 반경 내에 들어오면 분열함)

const HUNGER_THRESHOLD_FOR_REPRODUCTION = 80; // 분열을 위한 최소한의 포만도
const HUNGER_THRESHOLD_FOR_CRAZY = 20; // 광분 상태에 돌입하는 포만도
const HUNGER_FOR_SPLIT = 4; // 분열 시 소모되는 포만도
const HUNGER_DECREASE_RATE = 0.04; // 포만도 감소 속도
const HUNGER_MIN_INCREASE_ON_EAT = 10; // 먹이를 먹었을 때 최소 포만도 증가량

const PREY_HUNGER_FACTOR = 0.6; // 먹이를 먹었을 때 포만도 증가량 배수
const SAME_ENTITY_HUNGER_FACTOR = 0.3; // 같은 종류의 개체를 먹었을 때 포만도 증가량 배수

const STANDARD_HUNGER_THRESHOLD = 30; // 기준 포만도
const LOW_HUNGER_BOOST = 3.0; // 낮은 포만도에서의 속도 최대 증가율
const HIGH_HUNGER_SLOWDOWN = 0.4; // 높은 포만도에서의 속도 최대 감소율
const INITIAL_HUNGER = 100; // 초기 포만도

// Chart Data
const data = {
  labels: [],
  datasets: [
    {
      label: "바위",
      data: [],
      borderColor: "red",
      fill: false,
    },
    {
      label: "보자기",
      data: [],
      borderColor: "green",
      fill: false,
    },
    {
      label: "가위",
      data: [],
      borderColor: "blue",
      fill: false,
    },
  ],
};
const chart = new Chart(chartCtx, {
  type: "line",
  data: data,
  options: {
    animation: false,
    responsive: true,
    maintainAspectRatio: true,
    scales: {
      x: { beginAtZero: true },
      y: { beginAtZero: true },
    },
  },
});

const State = {
  CHASING: "chasing",
  RUNNING: "running",
  CRAZY: "crazy",
  IDLE: "idle",
};

// Entity Class
class Entity {
  constructor(type) {
    this.type = type;
    this.chasePrey = Math.random() < 0.3; // Randomly assigned characteristic: true means chase prey first, false means avoid predators first
    this.x = Math.random() * (simulationCanvas.width - ENTITY_SIZE);
    this.y = Math.random() * (simulationCanvas.height - ENTITY_SIZE);
    this.angle = Math.random() * 2 * Math.PI;
    this.hunger = INITIAL_HUNGER;
    this.sightRadius = SIGHT_RADIUS * (0.8 + Math.random() * 0.4);
    this.reproductionTimer = 0;
    this.reproductionInterval =
      REPRODUCTION_BASE_INTERVAL * (1 - REPRODUCTION_VARIATION_RATE + Math.random() * 2 * REPRODUCTION_VARIATION_RATE);
    this.directionChangeTimer = 0;
    this.directionChangeInterval = DIRECTION_CHANGE_INTERVAL * (0.7 + Math.random() * 0.6);
    this.size = ENTITY_SIZE;
    this.boost = 1;

    this.target = null;
    this.state = State.IDLE;
  }

  update() {
    this.size = Math.max(ENTITY_SIZE * Math.sqrt(this.hunger / INITIAL_HUNGER), 1);
    this.target = null;
    this.state = State.IDLE;
    this.boost = 1;

    if (this.hunger < STANDARD_HUNGER_THRESHOLD) {
      this.boost = 1 + (LOW_HUNGER_BOOST * (STANDARD_HUNGER_THRESHOLD - this.hunger)) / STANDARD_HUNGER_THRESHOLD;
    } else {
      if (this.hunger > INITIAL_HUNGER) {
        this.boost = 1 - HIGH_HUNGER_SLOWDOWN;
      } else {
        this.boost =
          1 -
          (HIGH_HUNGER_SLOWDOWN * (this.hunger - STANDARD_HUNGER_THRESHOLD)) /
            (INITIAL_HUNGER - STANDARD_HUNGER_THRESHOLD);
      }
    }

    const prey = this.findMaxHungerPrey();
    const predator = this.findNearestPredator();

    if (this.hunger < HUNGER_THRESHOLD_FOR_CRAZY) {
      this.target = this.findNearestPrey();
      this.state = State.CRAZY;
    } else if (this.chasePrey) {
      // Find nearest prey first
      if (prey) {
        this.target = prey;
        this.state = State.CHASING;
      } else if (predator) {
        this.target = predator;
        this.state = State.RUNNING;
      }
    } else {
      // Find nearest predator first
      if (predator) {
        this.target = predator;
        this.state = State.RUNNING;
      } else if (prey) {
        this.target = prey;
        this.state = State.CHASING;
      }
    }

    if (this.target) {
      if (this.state === State.RUNNING) {
        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        this.angle = Math.atan2(dy, dx) + Math.PI;
      } else if (this.state === State.CHASING || this.state === State.CRAZY) {
        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        this.angle = Math.atan2(dy, dx);
      } else {
        this.changeDirection();
      }
    } else {
      this.changeDirection();
    }

    // Split if hunger is high enough and predator is nearby
    if (this.hunger >= SPLIT_MIN_HUNGER_REQUIREMENT && predator) {
      const dx = predator.x - this.x;
      const dy = predator.y - this.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < SPLIT_PREDATOR_AVOIDANCE_RADIUS) {
        const child = this.reproduce();
        child.x = this.x + Math.cos(this.angle) * this.size * 2;
        child.y = this.y + Math.sin(this.angle) * this.size * 2;
        child.hunger = this.hunger / 2;
        this.hunger /= 2;
      }
    }
  }

  move() {
    // Update position based on current angle for more natural movement

    this.x += Math.cos(this.angle) * this.boost;
    this.y += Math.sin(this.angle) * this.boost;

    // Bounce off the walls by changing angle
    if (this.x <= 0 || this.x >= simulationCanvas.width - this.size) {
      this.angle = Math.PI - this.angle;
    }
    if (this.y <= 0 || this.y >= simulationCanvas.height - this.size) {
      this.angle = -this.angle;
    }

    this.x = Math.max(0, Math.min(this.x, simulationCanvas.width - ENTITY_SIZE));
    this.y = Math.max(0, Math.min(this.y, simulationCanvas.height - ENTITY_SIZE));

    // Decrease hunger level
    this.hunger -= HUNGER_DECREASE_RATE;
    if (this.hunger <= 0) {
      this.die();
    }

    // Handle reproduction
    this.reproductionTimer++;
    if (this.reproductionTimer >= this.reproductionInterval && this.hunger >= HUNGER_THRESHOLD_FOR_REPRODUCTION) {
      const child = this.reproduce();
      child.x = this.x + Math.cos(this.angle) * this.size * 2;
      child.y = this.y + Math.sin(this.angle) * this.size * 2;
      this.hunger -= HUNGER_FOR_SPLIT;
      this.reproductionTimer = 0;
    }
  }

  findMaxHungerPrey() {
    let maxHunger = 0;
    let maxHungerPrey = null;
    entities.forEach((entity) => {
      if (this.canEat(entity)) {
        const dx = entity.x - this.x;
        const dy = entity.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < this.sightRadius) {
          if (entity.hunger > maxHunger) {
            maxHunger = entity.hunger;
            maxHungerPrey = entity;
          }
        }
      }
    });
    return maxHungerPrey;
  }

  findNearestPredator() {
    let predators = [];
    let minDistance = this.sightRadius;
    entities.forEach((entity) => {
      if (entity.canEat(this)) {
        const dx = entity.x - this.x;
        const dy = entity.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < minDistance) {
          predators.push({ entity, distance });
        }
      }
    });

    if (predators.length === 0) {
      return null;
    }

    // Calculate average direction away from all predators
    let avgDx = 0;
    let avgDy = 0;
    predators.forEach((predator) => {
      avgDx += this.x - predator.entity.x;
      avgDy += this.y - predator.entity.y;
    });

    avgDx /= predators.length;
    avgDy /= predators.length;

    this.angle = Math.atan2(avgDy, avgDx); // Adjust angle away from average direction of predators
    return predators[0].entity; // Return the nearest predator as reference
  }

  findNearestPrey() {
    let nearestSameType = null;
    let minDistance = this.sightRadius;
    entities.forEach((entity) => {
      if (this === entity) return;
      if (entity.type === this.type || this.canEat(entity)) {
        const dx = entity.x - this.x;
        const dy = entity.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < minDistance) {
          minDistance = distance;
          nearestSameType = entity;
        }
      }
    });
    return nearestSameType;
  }

  canEat(entity) {
    if (this === entity) return false;
    return (
      (this.type === "rock" && entity.type === "scissors") ||
      (this.type === "scissors" && entity.type === "paper") ||
      (this.type === "paper" && entity.type === "rock")
    );
  }

  draw() {
    simulationCtx.beginPath();
    simulationCtx.arc(this.x, this.y, this.size, 0, 2 * Math.PI);
    simulationCtx.fillStyle = this.type === "rock" ? "red" : this.type === "paper" ? "green" : "blue";
    simulationCtx.fill();
    simulationCtx.closePath();

    // draw current hunger text
    // simulationCtx.font = "10px Arial";
    // simulationCtx.fillStyle = "black";
    // simulationCtx.fillText(this.hunger.toFixed(0), this.x - 8, this.y - 10);
  }

  reproduce() {
    const newEntity = new Entity(this.type);
    entities.push(newEntity);
    return newEntity;
  }

  die() {
    entities.splice(entities.indexOf(this), 1);
  }

  changeDirection() {
    this.directionChangeTimer++;
    if (this.directionChangeTimer >= this.directionChangeInterval) {
      this.angle = Math.random() * 2 * Math.PI;
      this.directionChangeTimer = 0;
    }
  }
}

// Initialize Entities
for (let i = 0; i < ENTITY_COUNT; i++) {
  const type = entityTypes[i % 3];
  entities.push(new Entity(type));
}

// Update Loop
let updateChartInterval = setInterval(updateChart, 200);
let timeTick = 0;
function update() {
  simulationCtx.clearRect(0, 0, simulationCanvas.width, simulationCanvas.height);

  // Display time tick
  simulationCtx.font = "12px Arial";
  simulationCtx.fillStyle = "black";
  simulationCtx.fillText(`Time Tick: ${timeTick}`, 10, 20);

  // Display entity count for each type
  const rockCount = entities.filter((e) => e.type === "rock").length;
  const paperCount = entities.filter((e) => e.type === "paper").length;
  const scissorsCount = entities.filter((e) => e.type === "scissors").length;

  simulationCtx.fillStyle = "red";
  simulationCtx.fillText(`바위: ${rockCount}`, 10, 40);
  simulationCtx.fillStyle = "green";
  simulationCtx.fillText(`보자기: ${paperCount}`, 10, 60);
  simulationCtx.fillStyle = "blue";
  simulationCtx.fillText(`가위: ${scissorsCount}`, 10, 80);

  // Move and draw Entities
  entities.forEach((entity) => {
    entity.update();
    entity.move();
    entity.draw();
  });

  // Simulate Interaction
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      if (areEntitiesClose(entities[i], entities[j])) {
        handleInteraction(entities[i], entities[j]);
      }
    }
  }

  // if all dead, stop
  if (entities.length === 0) {
    clearInterval(updateChartInterval);
    return;
  }

  timeTick++;
  requestAnimationFrame(update);
}

function areEntitiesClose(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy) < ENTITY_SIZE * 1.5;
}

function handleInteraction(a, b) {
  if (a.canEat(b)) {
    eatEntity(a, b);
  } else if (b.canEat(a)) {
    eatEntity(b, a);
  } else if (a.type === b.type) {
    if (a.hunger < b.hunger && a.state === State.CRAZY) {
      a.hunger += Math.max(b.hunger * SAME_ENTITY_HUNGER_FACTOR, HUNGER_MIN_INCREASE_ON_EAT);
      b.die();
    } else if (b.hunger < a.hunger && b.state === State.CRAZY) {
      b.hunger += Math.max(a.hunger * SAME_ENTITY_HUNGER_FACTOR, HUNGER_MIN_INCREASE_ON_EAT);
      a.die();
    }
  }
}

function eatEntity(predator, prey) {
  entities.splice(entities.indexOf(prey), 1);
  const hungerAddition = Math.max(HUNGER_MIN_INCREASE_ON_EAT, prey.hunger * PREY_HUNGER_FACTOR);
  predator.hunger += hungerAddition;
}

function updateChart() {
  const rockCount = entities.filter((e) => e.type === "rock").length;
  const paperCount = entities.filter((e) => e.type === "paper").length;
  const scissorsCount = entities.filter((e) => e.type === "scissors").length;

  data.labels.push(timeTick);
  data.datasets[0].data.push(rockCount);
  data.datasets[1].data.push(paperCount);
  data.datasets[2].data.push(scissorsCount);

  chart.update();
}

update();
