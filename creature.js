// creature.js
import * as Config from './config.js'; // Import all constants

// Define states (assuming these are used globally or passed appropriately)
const CreatureState = {
    IDLE: 'idle',
    WANDERING: 'wandering',
    SEEKING_FOOD: 'seeking_food',
    SEEKING_ENEMY: 'seeking_enemy',
    FIGHTING: 'fighting',
    GATHERING: 'gathering',
    BUILDING: 'building',
    // FLEEING: 'fleeing' // Future state
};

export default class Creature {
    // Added currentBaseAggression from simState for dynamic control
    constructor(x, y, energy = null, genes = null, tribeId = null, currentBaseAggression = Config.baseAggression) {
        this.x = x; // Center X
        this.y = y; // Center Y
        this.isAlive = true;

        // --- Timers ---
        this.reproductionTimer = Math.random() * Config.reproductionCooldown;
        this.attackCooldown = 0; // Ready to attack initially
        this.gatherTimer = 0;
        this.buildTimer = 0;
        this.damageTakenVisualTimer = 0; // For flashing red effect

        // --- Tribe Affiliation ---
        this.tribeId = tribeId !== null ? tribeId : Math.floor(Math.random() * Config.numberOfTribes);

        // --- Genetics ---
        if (genes) {
            // Inherit genes
            this.genes = { ...genes };
            // Apply mutation right after inheritance (using default Config rates initially)
            // If dynamic rates are needed *during* inheritance mutation, they'd need passing here.
            this.mutate();
        } else {
            // Initialize with base genes + slight random variation using currentBaseAggression
            this.genes = {
                speed: Config.baseSpeed * (1 + (Math.random() - 0.5) * 0.2),
                perception: Config.basePerceptionRadius * (1 + (Math.random() - 0.5) * 0.2),
                size: Config.baseCreatureSize * (1 + (Math.random() - 0.5) * 0.2),
                aggression: currentBaseAggression * (1 + (Math.random() - 0.5) * 0.4), // Use passed value
            };
            // Ensure initial genes are valid
            this.validateGenes();
        }

        // --- Phenotype & Combat Stats (Derived from genes) ---
        this.updatePhenotype(); // Calculate speed, size, color, combat stats etc.

        // --- Properties for Quadtree Library (Derived from size) ---
        this.width = this.size;
        this.height = this.size;

        // --- Energy (Derived from size) ---
        this.energyDecay = Config.energyDecayRate * (this.size / Config.baseCreatureSize);
        this.energy = energy !== null ? energy : (Config.maxEnergy / 2 + Math.random() * (Config.maxEnergy / 2)); // Start with random energy level if not specified

        // --- Movement ---
        this.dx = (Math.random() - 0.5);
        this.dy = (Math.random() - 0.5);
        this.normalizeMovement(); // Initialize movement vector based on speed

        // --- State Properties ---
        this.state = CreatureState.WANDERING;
        this.targetResource = null;
        this.targetBuildSite = null;
        this.targetEnemy = null;

        // --- Bonus Effects Tracking ---
        this.shelterBonus = 0; // Reset each frame before update
    }

    // --- Helper: Ensures gene values are within valid ranges ---
    validateGenes() {
        this.genes.speed = Math.max(0.1, this.genes.speed); // Min speed
        this.genes.perception = Math.max(10, this.genes.perception); // Min perception
        this.genes.size = Math.max(Config.baseCreatureSize / 2, this.genes.size); // Min size
        this.genes.size = Math.min(Config.baseCreatureSize * 2, this.genes.size); // Max size (optional clamp)
        this.genes.aggression = Math.max(0, Math.min(1, this.genes.aggression)); // Clamp aggression 0-1
    }

    // --- Helper: Updates phenotype (expressed traits) based on genes ---
    updatePhenotype() {
        this.speed = this.genes.speed;
        this.perceptionRadius = this.genes.perception;
        this.size = this.genes.size;
        this.aggression = this.genes.aggression;

        // Recalculate combat stats
        const sizeFactor = Math.max(0, this.genes.size - Config.baseCreatureSize);
		const oldMaxHealth = this.maxHealth; 
        this.maxHealth = Config.baseHealth + sizeFactor * Config.healthPerSize;
        if (this.maxHealth !== oldMaxHealth && oldMaxHealth > 0) {
			this.health = (this.health / oldMaxHealth) * this.maxHealth;
		}
        this.health = Math.min(this.health, this.maxHealth); // Clamp health if max decreased
        this.attackDamage = Config.baseAttackDamage + sizeFactor * Config.damagePerSize;
        this.attackReach = this.size / 2 + Config.attackRange;

        // Update quadtree dims
        this.width = this.size;
        this.height = this.size;

        // Update energy decay
        this.energyDecay = Config.energyDecayRate * (this.size / Config.baseCreatureSize);

        // Recalculate color
        this.assignColor();
    }

    assignColor() {
        // Base hue from tribe
        const baseHue = Config.tribeColors[this.tribeId % Config.tribeColors.length];
        // Modify saturation/lightness based on genes
        const saturation = 70 + (this.genes.speed / Config.baseSpeed - 1) * 20;
        const lightness = 60 - (this.genes.size / Config.baseCreatureSize - 1) * 15;

        this.color = `hsl(${baseHue}, ${Math.max(40, Math.min(100, saturation))}%, ${Math.max(30, Math.min(70, lightness))}%)`;
    }

    // Accepts dynamic mutation rates from simState if passed
    mutate(mutationRate = Config.mutationRate, mutationAmount = Config.mutationAmount) {
        // Mutate Speed
        if (Math.random() < mutationRate) {
            this.genes.speed *= (1 + (Math.random() - 0.5) * 2 * mutationAmount);
        }
        // Mutate Perception
        if (Math.random() < mutationRate) {
            this.genes.perception *= (1 + (Math.random() - 0.5) * 2 * mutationAmount);
        }
        // Mutate Size
        if (Math.random() < mutationRate) {
            this.genes.size *= (1 + (Math.random() - 0.5) * 2 * mutationAmount);
        }
        // Mutate Aggression
        if (Math.random() < mutationRate) {
           this.genes.aggression *= (1 + (Math.random() - 0.5) * 2 * mutationAmount);
        }

        // Ensure genes are still valid after mutation
        this.validateGenes();

        // Update expressed traits based on new genes
        this.updatePhenotype();
    }

    normalizeMovement() {
        const magnitude = Math.sqrt(this.dx * this.dx + this.dy * this.dy);
        if (magnitude > 0) {
            // Scale existing direction by speed
            this.dx = (this.dx / magnitude) * this.speed;
            this.dy = (this.dy / magnitude) * this.speed;
        } else {
            // If no movement vector exists, create a random one scaled by speed
            const angle = Math.random() * Math.PI * 2;
            this.dx = Math.cos(angle) * this.speed * 0.5; // Start slower maybe
            this.dy = Math.sin(angle) * this.speed * 0.5;
        }
    }

    // --- Target Finding Methods ---

    findNearestFood(foodQuadTree) {
        let nearestFood = null;
        const queryBounds = {
            x: this.x - this.perceptionRadius,
            y: this.y - this.perceptionRadius,
            width: this.perceptionRadius * 2,
            height: this.perceptionRadius * 2
        };
        // Assuming foodQuadTree stores Food objects directly
        const candidates = foodQuadTree.retrieve(queryBounds);
        let minDistanceSq = this.perceptionRadius * this.perceptionRadius;

        for (const food of candidates) {
            // Food position is top-left, calculate center for distance check
            const foodCenterX = food.x + food.width / 2;
            const foodCenterY = food.y + food.height / 2;
            const dx = foodCenterX - this.x;
            const dy = foodCenterY - this.y;
            const distanceSq = dx * dx + dy * dy;
            if (distanceSq < minDistanceSq) {
                minDistanceSq = distanceSq;
                nearestFood = food;
            }
        }
        return nearestFood;
    }

    findEnemyTarget(creatureQuadTree) {
        let nearestEnemy = null;
        const perceptionSq = this.perceptionRadius * this.perceptionRadius;
        let minDistanceSq = perceptionSq;
        const queryBounds = {
            x: this.x - this.perceptionRadius,
            y: this.y - this.perceptionRadius,
            width: this.perceptionRadius * 2,
            height: this.perceptionRadius * 2
        };
        // Assuming creatureQuadTree stores bounds objects with a 'ref' property
        const candidatesBounds = creatureQuadTree.retrieve(queryBounds);

        for (const bounds of candidatesBounds) {
            const otherCreature = bounds.ref; // Get the actual creature object
            // Skip self, dead creatures, and creatures of the same tribe
            if (otherCreature === this || !otherCreature.isAlive || otherCreature.tribeId === this.tribeId) {
                continue;
            }
            // Calculate distance between centers
            const dx = otherCreature.x - this.x;
            const dy = otherCreature.y - this.y;
            const distanceSq = dx * dx + dy * dy;
            if (distanceSq < minDistanceSq) {
                minDistanceSq = distanceSq;
                nearestEnemy = otherCreature;
            }
        }
        return nearestEnemy;
    }

    findNearestResource(resourceQuadTree) {
         let nearestNode = null;
         const perceptionSq = this.perceptionRadius * this.perceptionRadius;
         let minDistanceSq = perceptionSq;
         const queryBounds = {
            x: this.x - this.perceptionRadius,
            y: this.y - this.perceptionRadius,
            width: this.perceptionRadius * 2,
            height: this.perceptionRadius * 2
         };
         // Assuming resourceQuadTree stores ResourceNode objects directly
         const candidates = resourceQuadTree.retrieve(queryBounds);

         for (const node of candidates) {
             // Skip empty nodes
             if (node.isEmpty()) continue;
             // Calculate distance to node center
             const nodeCenterX = node.x + node.width / 2;
             const nodeCenterY = node.y + node.height / 2;
             const dx = nodeCenterX - this.x;
             const dy = nodeCenterY - this.y;
             const distanceSq = dx * dx + dy * dy;
             if (distanceSq < minDistanceSq) {
                 minDistanceSq = distanceSq;
                 nearestNode = node;
             }
         }
         return nearestNode;
    }

    findNearestBuildSite(structureList) {
        let nearestSite = null;
        let minDistanceSq = this.perceptionRadius * this.perceptionRadius;
        for (const site of structureList) {
            // Check if it's incomplete AND belongs to the same tribe
            if (!site.isComplete && site.tribeId === this.tribeId) {
                const dx = site.x - this.x; // Structure x,y assumed to be center
                const dy = site.y - this.y;
                const distanceSq = dx * dx + dy * dy;
                if (distanceSq < minDistanceSq) {
                    minDistanceSq = distanceSq;
                    nearestSite = site;
                }
            }
        }
        return nearestSite;
    }

    // --- Combat & Interaction ---

    takeDamage(amount) {
        if (!this.isAlive) return;
        this.health -= amount;
        this.damageTakenVisualTimer = 10; // Start visual flash timer
        if (this.health <= 0) {
            this.health = 0;
            this.isAlive = false;
            // Logging moved to main loop or specific event handler system later maybe
            // console.log(`Tribe ${this.tribeId} creature died in combat!`);
        }
    }

    eat(foodItem) {
         this.energy += Config.energyFromFood;
         // Clamp energy to maximum
         this.energy = Math.min(this.energy, Config.maxEnergy);
    }

    // Check proximity to a target (assumes target position is top-left)
	isNearPoint(targetCenterX, targetCenterY, requiredDistance) {
		const dx = this.x - targetCenterX;
		const dy = this.y - targetCenterY;
		// Check distance between centers vs (required distance + own radius)
		const checkDistance = requiredDistance + this.size / 2;
		return (dx * dx + dy * dy) < (checkDistance * checkDistance);
	}

    // --- Bonus Application ---
    applyShelterBonus(amount) {
         this.shelterBonus = amount;
    }

    // --- Main Update Logic ---
    // Accepts simState for dynamic parameters
    update(deltaTime, foodQuadTree, creatureQuadTree, resourceQuadTree, structureList, tribeStockpiles, tribeKnowledge, tribeTech, simState) {
        if (!this.isAlive) return null; // Don't update dead creatures

        // --- Reset Frame-Specific States ---
        this.shelterBonus = 0; // Reset bonus effect each frame

        // --- Update Timers ---
        if (this.attackCooldown > 0) this.attackCooldown -= (deltaTime / (1000 / 60));
        if (this.damageTakenVisualTimer > 0) this.damageTakenVisualTimer -= (deltaTime / (1000 / 60));
        this.reproductionTimer++;

        // --- Passive Knowledge Generation ---
        // Use dynamic research speed from simState
        if (tribeKnowledge[this.tribeId] !== undefined) { // Ensure tribe exists in knowledge object
           tribeKnowledge[this.tribeId] += Config.knowledgePerCreatureTick * simState.researchSpeedMultiplier;
        } else {
           tribeKnowledge[this.tribeId] = Config.knowledgePerCreatureTick * simState.researchSpeedMultiplier; // Initialize if missing
        }

        // --- Decision Logic (State Machine) ---
        // Prioritize actions based on needs and opportunities
        let potentialEnemy = this.findEnemyTarget(creatureQuadTree);
        let isAggressive = Math.random() < (this.genes.aggression * (simState.baseAggression / Config.baseAggression));
		isAggressive = Math.random() < this.genes.aggression;
		
        let needsFood = this.energy < Config.energyThreshold;
        let potentialFood = needsFood ? this.findNearestFood(foodQuadTree) : null; // Only search if hungry
		
        let potentialBuildSite = this.findNearestBuildSite(structureList);
		let currentStockpile = tribeStockpiles[this.tribeId] || 0;
		let siteMaterialCost = potentialBuildSite ? (potentialBuildSite.cost.material || 0) : 0;
		
        // Check if tribe has resources *for this specific site's cost*
		let canConsiderBuilding = potentialBuildSite && !needsFood;

        let potentialResource = this.findNearestResource(resourceQuadTree);
        // Only gather if not hungry, not fighting, not building, and resources exist
        let canConsiderGathering = potentialResource && !needsFood && !(potentialEnemy && isAggressive);

        // Determine current state based on priorities
        let previousState = this.state; // Store previous state for transition logic if needed
        if (potentialEnemy && isAggressive) {
			this.state = CreatureState.SEEKING_ENEMY;
			this.targetEnemy = potentialEnemy;
			this.targetResource = null; this.targetBuildSite = null; // Clear other targets
		} else if (needsFood && potentialFood) {
			this.state = CreatureState.SEEKING_FOOD;
			this.targetEnemy = null; this.targetResource = null; this.targetBuildSite = null;
		} else if (canConsiderBuilding && (!canConsiderGathering || currentStockpile > siteMaterialCost * 2 || Math.random() < 0.4)) {
            this.state = CreatureState.BUILDING;
            this.targetBuildSite = potentialBuildSite;
            this.targetEnemy = null; this.targetResource = null;
        } else if (canConsiderGathering) {
             this.state = CreatureState.GATHERING;
             this.targetResource = potentialResource;
             this.targetEnemy = null; this.targetBuildSite = null;
        } else {
            // If no other action, wander
            this.state = CreatureState.WANDERING;
            this.targetEnemy = null; this.targetResource = null; this.targetBuildSite = null;
        }

        // --- Execute State Actions & Calculate Movement ---
        this.dx = 0; this.dy = 0; // Reset movement intention for this frame

        switch (this.state) {
            case CreatureState.SEEKING_ENEMY:
            case CreatureState.FIGHTING:
                if (this.targetEnemy && this.targetEnemy.isAlive) {
                     const enemy = this.targetEnemy;
                     const dxToEnemy = enemy.x - this.x;
                     const dyToEnemy = enemy.y - this.y;
                     const distanceSq = dxToEnemy * dxToEnemy + dyToEnemy * dyToEnemy;
                     // Check if within attack reach (sum of creature radius + enemy radius + config range)
                     const requiredAttackDistSq = (this.attackReach + enemy.size / 2)**2;

                     if (distanceSq <= requiredAttackDistSq) {
                         // Within range - Stop moving towards, enter fighting state
                         this.state = CreatureState.FIGHTING;
                         if (this.attackCooldown <= 0) {
                             enemy.takeDamage(this.attackDamage);
                             this.attackCooldown = Config.attackCooldownTime; // Reset cooldown
                         }
                         // No movement dx, dy remain 0
                     } else {
                         // Out of range - Move towards enemy
                         this.state = CreatureState.SEEKING_ENEMY;
                         const distance = Math.sqrt(distanceSq);
                         // Apply speed scaling
                         this.dx = (dxToEnemy / distance) * this.speed;
                         this.dy = (dyToEnemy / distance) * this.speed;
                     }
                } else {
                    // Target died or disappeared
                    this.state = CreatureState.WANDERING;
                    this.targetEnemy = null;
                }
                break;

            case CreatureState.SEEKING_FOOD:
                if (potentialFood) {
                     // Target center of food
                     const targetX = potentialFood.x + potentialFood.width / 2;
                     const targetY = potentialFood.y + potentialFood.height / 2;
                     const dxToFood = targetX - this.x;
                     const dyToFood = targetY - this.y;
                     const distance = Math.sqrt(dxToFood * dxToFood + dyToFood * dyToFood);
                     // Move only if not already overlapping (distance > combined radii)
                     if (distance > this.size / 2 + potentialFood.size / 2) {
                         this.dx = (dxToFood / distance) * this.speed;
                         this.dy = (dyToFood / distance) * this.speed;
                     } else {
                         // Close enough, stop moving (dx, dy remain 0)
                         // Eating interaction handled in main loop collision phase
                     }
                 } else {
                     // Food disappeared?
                     this.state = CreatureState.WANDERING;
                 }
                break;

             case CreatureState.GATHERING:
                if (this.targetResource && !this.targetResource.isEmpty()) {
                     const node = this.targetResource;
                     const nodeCenterX = node.x + node.width / 2;
                     const nodeCenterY = node.y + node.height / 2;
                     const dxToNode = nodeCenterX - this.x;
                     const dyToNode = nodeCenterY - this.y;
                     const distanceSq = dxToNode * dxToNode + dyToNode * dyToNode;
                     // Check if within gathering distance (radii + interaction buffer)
                     const gatherDistSq = (this.size / 2 + node.size / 2 + 5)**2; // Add small buffer

                     if (distanceSq <= gatherDistSq) {
                         // Within range - Stop moving, start gathering timer
                         this.gatherTimer++;
                         if (this.gatherTimer >= Config.gatherTime) {
                             const gathered = node.gather(); // Gather returns amount removed
                             if (gathered > 0 && tribeStockpiles[this.tribeId] !== undefined) {
                                 tribeStockpiles[this.tribeId] += gathered;
                             } else if (gathered > 0) {
                                 tribeStockpiles[this.tribeId] = gathered; // Initialize if missing
                             }
                             this.gatherTimer = 0; // Reset timer
                             // If node becomes empty after gathering, switch state
                             if (node.isEmpty()) {
                                 this.state = CreatureState.WANDERING;
                                 this.targetResource = null;
                             }
                         }
                         // No movement (dx, dy remain 0)
                     } else {
                         // Out of range - Move towards node
                         const distance = Math.sqrt(distanceSq);
                         this.dx = (dxToNode / distance) * this.speed;
                         this.dy = (dyToNode / distance) * this.speed;
                         this.gatherTimer = 0; // Reset timer if moving
                     }
                } else {
                    // Resource depleted or disappeared
                    this.state = CreatureState.WANDERING;
                    this.targetResource = null;
                }
                break;

             case CreatureState.BUILDING:
                if (this.targetBuildSite && !this.targetBuildSite.isComplete) {
                     const site = this.targetBuildSite;
                     const dxToSite = site.x - this.x; // Target center of site
                     const dyToSite = site.y - this.y;
                     const distanceSq = dxToSite * dxToSite + dyToSite * dyToSite;
                     // Check if within building distance (radii + buffer)
                     const buildDistSq = (this.size / 2 + site.size / 2 + 5)**2;

                     if (distanceSq <= buildDistSq) {
                         // Within range - Stop moving, start building timer/progress
                         this.buildTimer++;
                         // Increment build progress (could be > 1 for faster building?)
                         if (this.buildTimer >= 1) {
                              // Assume site.build increments progress internally
                              site.build(1);
                              this.buildTimer = 0; // Reset timer? Or just progress each frame? Progress each frame.
                         }
                         // Check if completed this frame
                         if (site.isComplete) {
                              this.state = CreatureState.WANDERING;
                              this.targetBuildSite = null;
                         }
                         // No movement (dx, dy remain 0)
                     } else {
                         // Out of range - Move towards site
                         const distance = Math.sqrt(distanceSq);
                         this.dx = (dxToSite / distance) * this.speed;
                         this.dy = (dyToSite / distance) * this.speed;
                         this.buildTimer = 0; // Reset build timer if moving
                     }
                 } else {
                     // Site completed by someone else or disappeared
                     this.state = CreatureState.WANDERING;
                     this.targetBuildSite = null;
                 }
                 break;

            case CreatureState.WANDERING:
            case CreatureState.IDLE:
                 // Apply a small random impulse occasionally
                 if (Math.random() < 0.05) {
                     const angle = Math.random() * Math.PI * 2;
                     this.dx = Math.cos(angle) * this.speed; // Use full speed for impulse
                     this.dy = Math.sin(angle) * this.speed;
                  } else {
                      // Apply slight deceleration if not getting impulse
                      this.dx *= 0.98;
                      this.dy *= 0.98;
                  }
                break;
        }

        // --- Apply Calculated Movement (Collision handled in main loop) ---
        // Movement is calculated above, but applied *after* collision check in main.js

        // --- Boundary Wrap (Applied *after* movement in main loop, but logic here is ok) ---
        // This logic will be used in main.js after collision checks
        // let nextX = this.x + this.dx; let nextY = this.y + this.dy;
        // if (nextX < 0) nextX = Config.canvasWidth; /* ... etc ... */
        // this.x = nextX; this.y = nextY;


        // --- Energy Decay ---
        const baseDecay = this.energyDecay;
        // Calculate movement magnitude based on intended movement (dx, dy)
        const movementMagnitude = Math.sqrt(this.dx*this.dx + this.dy*this.dy);
        // Normalize movement factor (0 if not moving, 1 if moving at full speed)
        const movementFactor = this.speed > 0 ? Math.min(1, movementMagnitude / this.speed) : 0;
        const combatFactor = (this.state === CreatureState.FIGHTING || this.state === CreatureState.SEEKING_ENEMY) ? 0.2 : 0; // Energy cost for combat readiness/action
        const actionFactor = (this.state === CreatureState.GATHERING || this.state === CreatureState.BUILDING) ? 0.1 : 0; // Energy cost for working

        // Calculate effective decay rate, applying shelter bonus
        const effectiveDecayRate = Math.max(0, baseDecay * (1 + movementFactor*0.5 + combatFactor + actionFactor) - this.shelterBonus);
        this.energy -= effectiveDecayRate * (deltaTime / (1000/60)); // Scale decay by deltaTime (assuming 60fps base)


        // --- Check for Starvation Death ---
        if (this.energy <= 0 && this.isAlive) {
            this.isAlive = false;
            // console.log(`Tribe ${this.tribeId} creature starved.`); // Log moved to main loop
        }

        // --- Reproduction ---
        if (this.isAlive && this.energy >= Config.reproductionEnergyThreshold && this.reproductionTimer >= Config.reproductionCooldown) {
             this.energy -= Config.reproductionEnergyCost; // Spend energy
             this.reproductionTimer = 0; // Reset cooldown
             const offspringX = this.x + (Math.random() - 0.5) * 20;
             const offspringY = this.y + (Math.random() - 0.5) * 20;

             // Create offspring, passing inherited genes and current dynamic aggression
             let offspring = new Creature(offspringX, offspringY, Config.offspringInitialEnergy, this.genes, this.tribeId, simState.baseAggression);

             // Apply mutation to offspring using dynamic rates from simState
             offspring.mutate(simState.mutationRate, simState.mutationAmount);

             return offspring;
        }

        return null; // No offspring produced
    }


    // --- Drawing Method ---
    draw(ctx) {
         if (!this.isAlive) return; // Don't draw dead creatures

         // --- Determine Draw Color (including damage flash) ---
         let drawColor = this.color;
         if (this.damageTakenVisualTimer > 0) {
             // Flash bright red based on timer
             const flashIntensity = Math.sin((10 - this.damageTakenVisualTimer) * Math.PI / 10); // Pulse effect
             const flashLightness = 60 + flashIntensity * 30;
             drawColor = `hsl(0, 100%, ${flashLightness}%)`;
         }

         // --- Draw Main Body (Circle) ---
         ctx.fillStyle = drawColor;
         ctx.beginPath();
         ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
         ctx.fill();

         // --- Draw Reproduction Indicator (White border when ready) ---
         if (this.energy >= Config.reproductionEnergyThreshold && this.reproductionTimer >= Config.reproductionCooldown) {
             ctx.strokeStyle = 'white';
             ctx.lineWidth = 1;
             // Need to redraw the arc path for stroke
             ctx.beginPath();
             ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
             ctx.stroke();
         }

         // --- Draw Status Bars (Health and Energy) ---
         const barWidth = Math.max(10, this.size * 1.2); // Ensure minimum bar width
         const barHeight = 3;
         const energyBarYOffset = this.size / 2 + 2; // Position below creature
         const healthBarYOffset = energyBarYOffset + barHeight + 1; // Position below energy bar

         // Energy Bar Background
         ctx.fillStyle = '#555'; // Dark grey background
         ctx.fillRect(this.x - barWidth / 2, this.y + energyBarYOffset, barWidth, barHeight);
         // Energy Bar Fill
         const energyPercent = Math.max(0, this.energy / Config.maxEnergy); // Ensure percent is not negative
         ctx.fillStyle = 'lime';
         ctx.fillRect(this.x - barWidth / 2, this.y + energyBarYOffset, barWidth * energyPercent, barHeight);

         // Health Bar Background
         ctx.fillStyle = '#500'; // Dark red background
         ctx.fillRect(this.x - barWidth / 2, this.y + healthBarYOffset, barWidth, barHeight);
         // Health Bar Fill
         const healthPercent = Math.max(0, this.health / this.maxHealth); // Ensure percent is not negative
         ctx.fillStyle = 'red';
         ctx.fillRect(this.x - barWidth / 2, this.y + healthBarYOffset, barWidth * healthPercent, barHeight);

         // --- Draw State Indicator (Colored border) ---
         let stateBorderColor = null;
         switch(this.state) {
             case CreatureState.FIGHTING: stateBorderColor = 'orange'; break;
             case CreatureState.GATHERING: stateBorderColor = 'brown'; break;
             case CreatureState.BUILDING: stateBorderColor = 'cyan'; break;
             // Add other states if needed (e.g., SEEKING_ENEMY in yellow?)
             case CreatureState.SEEKING_ENEMY: stateBorderColor = 'yellow'; break;
         }
         if (stateBorderColor) {
               ctx.strokeStyle = stateBorderColor;
               ctx.lineWidth = 1.5;
               ctx.beginPath();
               // Draw border slightly outside the main body
               ctx.arc(this.x, this.y, this.size / 2 + 1.5, 0, Math.PI * 2);
               ctx.stroke();
          }
    }
}