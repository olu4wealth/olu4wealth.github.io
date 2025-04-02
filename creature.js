// creature.js
import * as Config from './config.js'; // Import all constants

// Define states
const CreatureState = {
    IDLE: 'idle',
    WANDERING: 'wandering',
    SEEKING_FOOD: 'seeking_food',
    SEEKING_ENEMY: 'seeking_enemy',
    FIGHTING: 'fighting',
    GATHERING: 'gathering',
    BUILDING: 'building',
    SEEKING_DROPOFF: 'seeking_dropoff', // <<< NEW STATE
    // FLEEING: 'fleeing' // Future state
};

export default class Creature {
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
            this.genes = { ...genes };
            this.mutate(); // Apply mutation using simState rates passed during reproduction
        } else {
            // Initialize with base genes + slight random variation
            this.genes = {
                speed: Config.baseSpeed * (1 + (Math.random() - 0.5) * 0.2),
                perception: Config.basePerceptionRadius * (1 + (Math.random() - 0.5) * 0.2),
                size: Config.baseCreatureSize * (1 + (Math.random() - 0.5) * 0.2),
                aggression: currentBaseAggression * (1 + (Math.random() - 0.5) * 0.4),
            };
            this.validateGenes();
        }

        // --- Phenotype & Combat Stats (Derived from genes) ---
        // Initialize health here BEFORE updatePhenotype sets maxHealth
        this.health = Config.baseHealth;
        this.updatePhenotype(); // Calculate speed, size, color, combat stats, maxCarry etc.

        // --- Properties for Quadtree Library ---
        this.width = this.size;
        this.height = this.size;

        // --- Energy ---
        this.energyDecay = Config.energyDecayRate * (this.size / Config.baseCreatureSize); // Initial decay based on size
        this.energy = energy !== null ? energy : (Config.maxEnergy / 2 + Math.random() * (Config.maxEnergy / 2));

        // --- Movement ---
        this.dx = 0; // Initial dx/dy set by update logic
        this.dy = 0;
        // this.normalizeMovement(); // Movement vector calculated in update based on state

        // --- State Properties ---
        this.state = CreatureState.WANDERING;
        this.targetResource = null;
        this.targetBuildSite = null;
        this.targetEnemy = null;
        this.targetFood = null; // Keep track of food target
        this.targetDropoff = null; // <<< NEW: Target for dropping off resources

        // --- Resource Carrying ---
        this.carryingMaterial = 0; // <<< NEW: Amount currently carried
        // maxCarryAmount is set in updatePhenotype based on size

        // --- Bonus Effects Tracking ---
        this.shelterBonus = 0;
    }

    // --- Helper: Ensures gene values are within valid ranges ---
    validateGenes() {
        this.genes.speed = Math.max(0.1, this.genes.speed);
        this.genes.perception = Math.max(10, this.genes.perception);
        this.genes.size = Math.max(Config.baseCreatureSize / 2, this.genes.size);
        this.genes.size = Math.min(Config.baseCreatureSize * 2.5, this.genes.size); // Allow slightly larger max size maybe
        this.genes.aggression = Math.max(0, Math.min(1, this.genes.aggression));
    }

    // --- Helper: Updates phenotype (expressed traits) based on genes ---
    updatePhenotype() {
        this.speed = this.genes.speed;
        this.perceptionRadius = this.genes.perception;
        this.size = this.genes.size;
        this.aggression = this.genes.aggression;

        // Recalculate combat stats
        const sizeFactor = Math.max(0, this.genes.size - Config.baseCreatureSize);
		const oldMaxHealth = this.maxHealth; // Store old max health
        this.maxHealth = Config.baseHealth + sizeFactor * Config.healthPerSize;
        // Adjust current health proportionally if max health changed
        if (this.health && oldMaxHealth && oldMaxHealth > 0 && this.maxHealth !== oldMaxHealth) {
             this.health = (this.health / oldMaxHealth) * this.maxHealth;
        }
        this.health = Math.min(this.health || this.maxHealth, this.maxHealth); // Ensure health doesn't exceed new max
        this.attackDamage = Config.baseAttackDamage + sizeFactor * Config.damagePerSize;
        this.attackReach = this.size / 2 + Config.attackRange;

        // Update quadtree dims
        this.width = this.size;
        this.height = this.size;

        // Update energy decay based on size
        this.energyDecay = Config.energyDecayRate * (this.size / Config.baseCreatureSize);

        // --- NEW: Update max carrying capacity based on size ---
        // Example: Base capacity + bonus for size
        this.maxCarryAmount = 5 + Math.floor(sizeFactor * 1.5); // Adjust formula as needed

        // Recalculate color
        this.assignColor();
    }

    assignColor() {
        const baseHue = Config.tribeColors[this.tribeId % Config.tribeColors.length];
        const saturation = 70 + (this.genes.speed / Config.baseSpeed - 1) * 20;
        const lightness = 60 - (this.genes.size / Config.baseCreatureSize - 1) * 15;
        this.color = `hsl(${baseHue}, ${Math.max(40, Math.min(100, saturation))}%, ${Math.max(30, Math.min(70, lightness))}%)`;
    }

    // Accepts dynamic mutation rates from simState
    mutate(mutationRate = Config.mutationRate, mutationAmount = Config.mutationAmount) {
        if (Math.random() < mutationRate) this.genes.speed *= (1 + (Math.random() - 0.5) * 2 * mutationAmount);
        if (Math.random() < mutationRate) this.genes.perception *= (1 + (Math.random() - 0.5) * 2 * mutationAmount);
        if (Math.random() < mutationRate) this.genes.size *= (1 + (Math.random() - 0.5) * 2 * mutationAmount);
        if (Math.random() < mutationRate) this.genes.aggression *= (1 + (Math.random() - 0.5) * 2 * mutationAmount);
        this.validateGenes();
        this.updatePhenotype(); // Update traits after mutation
    }

    normalizeMovement() {
        // This was previously used to set dx/dy based on speed
        // Now, dx/dy are calculated directly in the state logic using speed
        // This function might not be needed, or could be used differently
        // For now, we'll calculate dx/dy directly where needed.
    }

    // --- Target Finding Methods ---

    findNearestFood(foodQuadTree) {
        this.targetFood = null; // Reset target
        let nearestFood = null;
        const queryBounds = { x: this.x - this.perceptionRadius, y: this.y - this.perceptionRadius, width: this.perceptionRadius * 2, height: this.perceptionRadius * 2 };
        const candidates = foodQuadTree.retrieve(queryBounds);
        let minDistanceSq = this.perceptionRadius * this.perceptionRadius;

        for (const food of candidates) {
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
        this.targetFood = nearestFood; // Store the found target
        return nearestFood;
    }

    findEnemyTarget(creatureQuadTree) {
        // this.targetEnemy = null; // Resetting target here might cause issues if currently fighting
        let nearestEnemy = null;
        const perceptionSq = this.perceptionRadius * this.perceptionRadius;
        let minDistanceSq = perceptionSq;
        const queryBounds = { x: this.x - this.perceptionRadius, y: this.y - this.perceptionRadius, width: this.perceptionRadius * 2, height: this.perceptionRadius * 2 };
        const candidatesBounds = creatureQuadTree.retrieve(queryBounds);

        for (const bounds of candidatesBounds) {
            const otherCreature = bounds.ref;
            if (!otherCreature || otherCreature === this || !otherCreature.isAlive || otherCreature.tribeId === this.tribeId) {
                continue;
            }
            const dx = otherCreature.x - this.x;
            const dy = otherCreature.y - this.y;
            const distanceSq = dx * dx + dy * dy;
            if (distanceSq < minDistanceSq) {
                minDistanceSq = distanceSq;
                nearestEnemy = otherCreature;
            }
        }
        // Only update target if a new one is found or none exists?
        // If currently fighting, we might want to stick to the current target unless it dies/flees.
        // Let state logic handle target assignment more carefully.
        return nearestEnemy;
    }

    findNearestResource(resourceQuadTree) {
        // this.targetResource = null; // Don't reset if already gathering? State logic handles this.
        let nearestNode = null;
        const perceptionSq = this.perceptionRadius * this.perceptionRadius;
        let minDistanceSq = perceptionSq;
        const queryBounds = { x: this.x - this.perceptionRadius, y: this.y - this.perceptionRadius, width: this.perceptionRadius * 2, height: this.perceptionRadius * 2 };
        const candidates = resourceQuadTree.retrieve(queryBounds);

        for (const node of candidates) {
             if (!node || node.isEmpty()) continue;
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
            if (site && !site.isComplete && site.tribeId === this.tribeId) {
                const dx = site.x - this.x;
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

    // --- NEW: Find nearest structure that accepts resource drop-offs ---
    findNearestDropoff(structureQuadTree) { // Pass structure Quadtree
        this.targetDropoff = null; // Reset target
        let nearestDropoff = null;
        let minDistanceSq = this.perceptionRadius * this.perceptionRadius * 4; // Search wider for dropoff?
        const queryBounds = {
            x: this.x - this.perceptionRadius * 2,
            y: this.y - this.perceptionRadius * 2,
            width: this.perceptionRadius * 4,
            height: this.perceptionRadius * 4
        };

        const candidatesBounds = structureQuadTree.retrieve(queryBounds);

        for (const bounds of candidatesBounds) {
            const struct = bounds.ref;
            // Check if structure is valid, complete, belongs to the tribe, AND is a drop-off point
            // For now, hardcode Marker and Shelter as drop-off points.
            // Later, use struct.isDropoffPoint if added.
            if (struct && struct.isComplete && struct.tribeId === this.tribeId && (struct.type === 'Marker' || struct.type === 'Shelter')) {
                 const dx = struct.x - this.x;
                 const dy = struct.y - this.y;
                 const distanceSq = dx * dx + dy * dy;
                 if (distanceSq < minDistanceSq) {
                     minDistanceSq = distanceSq;
                     nearestDropoff = struct;
                 }
            }
        }
        this.targetDropoff = nearestDropoff; // Store the found target
        return nearestDropoff;
    }


    // --- Combat & Interaction ---

    takeDamage(amount) {
        if (!this.isAlive) return;
        this.health -= amount;
        this.damageTakenVisualTimer = 10; // Start visual flash timer
        if (this.health <= 0) {
            this.health = 0;
            this.isAlive = false;
            // TODO: Drop carried resources on death?
            // Drop resources on death? --> Add to main.js removal logic later
             console.log(`Tribe ${this.tribeId} creature died carrying ${this.carryingMaterial} material.`); // Log amount carried
            this.carryingMaterial = 0; // Lose carried material
        }
    }

    eat(foodItem) {
         this.energy += Config.energyFromFood;
         this.energy = Math.min(this.energy, Config.maxEnergy); // Clamp energy
         // Eating might interrupt other actions like gathering/building/seeking dropoff
         // State logic in update() should handle this transition if needed.
         this.targetFood = null; // Consumed the target
    }

	isNearPoint(targetCenterX, targetCenterY, requiredDistance) {
		const dx = this.x - targetCenterX;
		const dy = this.y - targetCenterY;
		const checkDistance = requiredDistance + this.size / 2;
		return (dx * dx + dy * dy) < (checkDistance * checkDistance);
	}

    // --- Bonus Application ---
    applyShelterBonus(amount) {
         this.shelterBonus = amount;
    }

    // --- Main Update Logic ---
    update(deltaTime, foodQuadTree, creatureQuadTree, resourceQuadTree, structureList, tribeStockpiles, tribeKnowledge, tribeTech, simState) {
        if (!this.isAlive) return null;

        const deltaFrames = deltaTime / (1000/60); // Approximate frames passed

        // --- Reset Frame-Specific States ---
        this.shelterBonus = 0; // Reset bonus effect each frame

        // --- Update Timers ---
        if (this.attackCooldown > 0) this.attackCooldown -= deltaFrames;
        if (this.damageTakenVisualTimer > 0) this.damageTakenVisualTimer -= deltaFrames;
        if (this.reproductionTimer < Config.reproductionCooldown) this.reproductionTimer += deltaFrames; // Use deltaFrames

        // --- Passive Knowledge Generation ---
        if (tribeKnowledge[this.tribeId] !== undefined) {
           tribeKnowledge[this.tribeId] += Config.knowledgePerCreatureTick * simState.researchSpeedMultiplier * deltaFrames; // Scale by deltaFrames
        } else {
           tribeKnowledge[this.tribeId] = Config.knowledgePerCreatureTick * simState.researchSpeedMultiplier * deltaFrames;
        }

        // --- Decision Logic (State Machine) ---
        // Priorities: Fight > Flee (future) > Eat > Dropoff > Build > Gather > Wander

        let potentialEnemy = this.findEnemyTarget(creatureQuadTree);
        let isAggressive = Math.random() < this.genes.aggression; // Keep simple aggression check

        let needsFood = this.energy < Config.energyThreshold;
        let isFullOfMaterial = this.carryingMaterial >= this.maxCarryAmount;

        // Determine state based on priorities
        let previousState = this.state;

        // --- State Determination ---
        if (potentialEnemy && isAggressive) {
            this.state = CreatureState.SEEKING_ENEMY;
            this.targetEnemy = potentialEnemy; // Assign target here
            this.targetResource = null; this.targetBuildSite = null; this.targetFood = null; this.targetDropoff = null; // Clear other targets
        }
        else if (needsFood) {
            if (!this.targetFood) this.findNearestFood(foodQuadTree); // Search only if no current target
            if (this.targetFood) {
                this.state = CreatureState.SEEKING_FOOD;
                 this.targetEnemy = null; this.targetResource = null; this.targetBuildSite = null; this.targetDropoff = null;
            } else {
                // Hungry but no food found? Wander or maybe seek dropoff if carrying something?
                if (this.carryingMaterial > 0) { // If carrying something, prioritize dropping off even if hungry and can't find food
                     if (!this.targetDropoff) this.findNearestDropoff(structureQuadTree); // Use structureQuadTree
                     if (this.targetDropoff) {
                        this.state = CreatureState.SEEKING_DROPOFF;
                        this.targetEnemy = null; this.targetResource = null; this.targetBuildSite = null; this.targetFood = null;
                     } else {
                         this.state = CreatureState.WANDERING; // No food, no dropoff point -> Wander
                     }
                } else {
                    this.state = CreatureState.WANDERING; // No food, not carrying -> Wander
                }
            }
        }
        else if (isFullOfMaterial) { // Not hungry, but inventory is full
             if (!this.targetDropoff) this.findNearestDropoff(structureQuadTree); // Use structureQuadTree
             if (this.targetDropoff) {
                 this.state = CreatureState.SEEKING_DROPOFF;
                 this.targetEnemy = null; this.targetResource = null; this.targetBuildSite = null; this.targetFood = null;
             } else {
                 this.state = CreatureState.WANDERING; // Full but nowhere to drop off -> Wander
                 // Maybe add logic later to drop resources on the ground if no dropoff exists?
             }
        }
        else { // Not hungry, not full - consider building or gathering
            let potentialBuildSite = this.findNearestBuildSite(structureList);
            let potentialResource = this.findNearestResource(resourceQuadTree);

            // Prioritize building if a site exists and we have *some* resources (or stockpile is high)
            let currentStockpile = tribeStockpiles[this.tribeId] || 0;
            let shouldBuild = potentialBuildSite && (!potentialResource || currentStockpile > 10 || Math.random() < 0.3); // Heuristic

            if (shouldBuild) {
                 this.state = CreatureState.BUILDING;
                 this.targetBuildSite = potentialBuildSite; // Assign target
                 this.targetEnemy = null; this.targetResource = null; this.targetFood = null; this.targetDropoff = null;
            } else if (potentialResource) {
                 this.state = CreatureState.GATHERING;
                 this.targetResource = potentialResource; // Assign target
                 this.targetEnemy = null; this.targetBuildSite = null; this.targetFood = null; this.targetDropoff = null;
            } else {
                 // Nothing specific to do, wander
                 this.state = CreatureState.WANDERING;
                 this.targetEnemy = null; this.targetResource = null; this.targetBuildSite = null; this.targetFood = null; this.targetDropoff = null;
            }
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
                     const requiredAttackDistSq = (this.attackReach + enemy.size / 2)**2;

                     if (distanceSq <= requiredAttackDistSq) {
                         this.state = CreatureState.FIGHTING; // Correct state if in range
                         if (this.attackCooldown <= 0) {
                             enemy.takeDamage(this.attackDamage);
                             this.attackCooldown = Config.attackCooldownTime;
                             // Add small recoil/pushback maybe? (optional)
                         }
                         // dx/dy remain 0 (stay engaged)
                     } else {
                         // Move towards enemy if out of range
                         this.state = CreatureState.SEEKING_ENEMY;
                         const distance = Math.sqrt(distanceSq);
                         if (distance > 0) {
                            this.dx = (dxToEnemy / distance) * this.speed;
                            this.dy = (dyToEnemy / distance) * this.speed;
                         }
                     }
                } else {
                    // Target died or disappeared
                    this.state = CreatureState.WANDERING;
                    this.targetEnemy = null;
                }
                break;

            case CreatureState.SEEKING_FOOD:
                if (this.targetFood) { // Use stored targetFood
                     const targetX = this.targetFood.x + this.targetFood.width / 2;
                     const targetY = this.targetFood.y + this.targetFood.height / 2;
                     const dxToFood = targetX - this.x;
                     const dyToFood = targetY - this.y;
                     const distance = Math.sqrt(dxToFood * dxToFood + dyToFood * dyToFood);
                     const eatDistance = this.size / 2 + this.targetFood.size / 2;

                     if (distance > eatDistance) { // Move only if not close enough to eat
                         this.dx = (dxToFood / distance) * this.speed;
                         this.dy = (dyToFood / distance) * this.speed;
                     } else {
                         // Close enough, stop moving (dx, dy remain 0)
                         // Eating interaction handled in main loop collision phase based on proximity
                     }
                 } else {
                     this.state = CreatureState.WANDERING; // Target disappeared
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
                     const gatherDist = this.size / 2 + node.size / 2 + 5; // Interaction distance
                     const gatherDistSq = gatherDist * gatherDist;

                     if (distanceSq <= gatherDistSq) {
                         // Within range - Stop moving, start gathering timer
                         this.gatherTimer += deltaFrames; // Accumulate time based on deltaFrames
                         if (this.gatherTimer >= Config.gatherTime) {
                             const gathered = node.gather();
                             if (gathered > 0) {
                                 // --- Add to carrying amount ---
                                 const canCarryMore = this.maxCarryAmount - this.carryingMaterial;
                                 const amountToTake = Math.min(gathered, canCarryMore);
                                 this.carryingMaterial += amountToTake;
                                 // TODO: If gathered > amountToTake, the resource node should retain the difference?
                                 // Current node.gather() doesn't support partial takes easily. Assume full gatherAmount is taken for now.
                             }
                             this.gatherTimer = 0; // Reset timer

                             // Check if full or node is empty
                             if (this.carryingMaterial >= this.maxCarryAmount || node.isEmpty()) {
                                 this.targetResource = null; // Forget this node
                                 // If carrying something, seek dropoff, otherwise wander
                                 this.state = this.carryingMaterial > 0 ? CreatureState.SEEKING_DROPOFF : CreatureState.WANDERING;
                             }
                         }
                         // dx/dy remain 0 while gathering
                     } else {
                         // Out of range - Move towards node
                         const distance = Math.sqrt(distanceSq);
                         if (distance > 0) {
                            this.dx = (dxToNode / distance) * this.speed;
                            this.dy = (dyToNode / distance) * this.speed;
                         }
                         this.gatherTimer = 0; // Reset timer if moving
                     }
                } else {
                    // Resource depleted by someone else or disappeared
                    this.state = this.carryingMaterial > 0 ? CreatureState.SEEKING_DROPOFF : CreatureState.WANDERING;
                    this.targetResource = null;
                }
                break;

            // --- NEW STATE LOGIC ---
            case CreatureState.SEEKING_DROPOFF:
                if (!this.targetDropoff || !this.targetDropoff.isComplete || this.targetDropoff.tribeId !== this.tribeId) {
                     // Target is invalid, find a new one
                     this.findNearestDropoff(structureQuadTree); // Pass quadtree
                }

                if (this.targetDropoff) { // Check if a valid target was found/exists
                    const site = this.targetDropoff;
                    const dxToSite = site.x - this.x;
                    const dyToSite = site.y - this.y;
                    const distanceSq = dxToSite * dxToSite + dyToSite * dyToSite;
                    const dropDist = this.size / 2 + site.size / 2 + 5; // Interaction distance
                    const dropDistSq = dropDist * dropDist;

                    if (distanceSq <= dropDistSq) {
                        // Within range - Drop off resources
                        if (tribeStockpiles[this.tribeId] !== undefined) {
                            tribeStockpiles[this.tribeId] += this.carryingMaterial;
                        } else {
                            tribeStockpiles[this.tribeId] = this.carryingMaterial; // Initialize if needed
                        }
                        console.log(`Tribe ${this.tribeId} creature deposited ${this.carryingMaterial} material.`);
                        this.carryingMaterial = 0;
                        this.targetDropoff = null;
                        this.state = CreatureState.WANDERING; // Switch state after dropping off
                        // dx/dy remain 0 for this frame
                    } else {
                        // Out of range - Move towards dropoff site
                        const distance = Math.sqrt(distanceSq);
                         if (distance > 0) {
                            this.dx = (dxToSite / distance) * this.speed;
                            this.dy = (dyToSite / distance) * this.speed;
                         }
                    }
                } else {
                    // No dropoff point found for this tribe
                    this.state = CreatureState.WANDERING; // Give up and wander (still carrying)
                }
                break;
            // --- END NEW STATE LOGIC ---


             case CreatureState.BUILDING:
                // Build logic remains largely the same for now
                if (this.targetBuildSite && !this.targetBuildSite.isComplete) {
                     const site = this.targetBuildSite;
                     const dxToSite = site.x - this.x;
                     const dyToSite = site.y - this.y;
                     const distanceSq = dxToSite * dxToSite + dyToSite * dyToSite;
                     const buildDist = this.size / 2 + site.size / 2 + 5;
                     const buildDistSq = buildDist * buildDist;

                     if (distanceSq <= buildDistSq) {
                         // Within range - Stop moving, contribute to building
                         this.buildTimer += deltaFrames;
                         // Build rate could be faster (e.g., build(deltaFrames)?)
                         if (this.buildTimer >= 1) { // Progress based on frames for now
                              site.build(1); // Increment build progress
                              this.buildTimer = 0; // Reset timer? Or allow continuous progress? Let's reset for discrete progress steps.
                         }

                         if (site.isComplete) {
                              this.state = CreatureState.WANDERING;
                              this.targetBuildSite = null;
                         }
                         // dx/dy remain 0
                     } else {
                         // Out of range - Move towards site
                         const distance = Math.sqrt(distanceSq);
                         if(distance > 0) {
                            this.dx = (dxToSite / distance) * this.speed;
                            this.dy = (dyToSite / distance) * this.speed;
                         }
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
                 // Simple wandering: occasional random impulse
                 if (Math.random() < 0.05) {
                     const angle = Math.random() * Math.PI * 2;
                     // Apply impulse relative to current speed allowance
                     this.dx = Math.cos(angle) * this.speed;
                     this.dy = Math.sin(angle) * this.speed;
                  } else {
                      // Dampen movement slightly if no impulse
                      this.dx *= 0.95;
                      this.dy *= 0.95;
                  }
                  // Ensure minimum movement speed if wandering? Optional.
                 // if (Math.abs(this.dx) < 0.1 && Math.abs(this.dy) < 0.1) {
                 //     this.dx = (Math.random() - 0.5) * 0.2 * this.speed;
                 //     this.dy = (Math.random() - 0.5) * 0.2 * this.speed;
                 // }
                break;
        }


        // --- Apply Energy Decay ---
        const baseDecay = this.energyDecay;
        const movementMagnitude = Math.sqrt(this.dx * this.dx + this.dy * this.dy);
        const movementFactor = this.speed > 0 ? Math.min(1, movementMagnitude / this.speed) : 0;
        const combatFactor = (this.state === CreatureState.FIGHTING || this.state === CreatureState.SEEKING_ENEMY) ? 0.2 : 0;
        // --- Add energy cost for carrying resources ---
        const carryingFactor = this.carryingMaterial > 0 ? (0.1 * (this.carryingMaterial / this.maxCarryAmount)) : 0; // Cost proportional to how full
        const actionFactor = (this.state === CreatureState.GATHERING || this.state === CreatureState.BUILDING) ? 0.1 : 0;

        const effectiveDecayRate = Math.max(0, baseDecay * (1 + movementFactor * 0.5 + combatFactor + actionFactor + carryingFactor) - this.shelterBonus);
        this.energy -= effectiveDecayRate * deltaFrames;


        // --- Check for Starvation Death ---
        if (this.energy <= 0) {
            this.takeDamage(this.maxHealth + 1); // Inflict lethal damage if starving
        }

        // --- Reproduction ---
        // Check against simState population cap for the specific tribe? Or global cap? Global for now.
        if (this.energy >= Config.reproductionEnergyThreshold && this.reproductionTimer >= Config.reproductionCooldown) {
             // Check global population cap from simState
             const currentPopulation = creatureQuadTree.retrieve({x:0,y:0,width:Config.canvasWidth, height:Config.canvasHeight}).length; // Approx count
             if (currentPopulation < simState.maxPopulation) {
                this.energy -= Config.reproductionEnergyCost;
                this.reproductionTimer = 0;
                const offspringX = this.x + (Math.random() - 0.5) * 20;
                const offspringY = this.y + (Math.random() - 0.5) * 20;

                // Pass current simState aggression and create offspring
                let offspring = new Creature(offspringX, offspringY, Config.offspringInitialEnergy, this.genes, this.tribeId, simState.baseAggression);
                // Offspring immediately mutates using simState rates
                offspring.mutate(simState.mutationRate, simState.mutationAmount);
                return offspring;
             } else {
                 // Population cap reached, reset timer slightly maybe?
                 this.reproductionTimer = Config.reproductionCooldown * 0.8; // Don't try again immediately
             }
        }

        return null; // No offspring produced
    }


    // --- Drawing Method ---
    draw(ctx) {
         if (!this.isAlive) return;

         // --- Determine Draw Color ---
         let drawColor = this.color;
         if (this.damageTakenVisualTimer > 0) {
             const flashIntensity = Math.sin((10 - this.damageTakenVisualTimer) * Math.PI / 10);
             const flashLightness = 60 + flashIntensity * 30;
             drawColor = `hsl(0, 100%, ${flashLightness}%)`;
         }

         // --- Draw Main Body (Circle) ---
         ctx.fillStyle = drawColor;
         ctx.beginPath();
         ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
         ctx.fill();

         // --- Draw Reproduction Indicator ---
         if (this.energy >= Config.reproductionEnergyThreshold && this.reproductionTimer >= Config.reproductionCooldown) {
             ctx.strokeStyle = 'white';
             ctx.lineWidth = 1;
             ctx.beginPath();
             ctx.arc(this.x, this.y, this.size / 2 + 1, 0, Math.PI * 2); // Slightly larger circle
             ctx.stroke();
         }

         // --- NEW: Draw Carrying Indicator ---
         if (this.carryingMaterial > 0) {
             const fullness = this.carryingMaterial / this.maxCarryAmount;
             ctx.fillStyle = 'rgba(160, 82, 45, 0.7)'; // Brownish overlay (SaddleBrown with alpha)
             ctx.beginPath();
             // Draw a partial arc representing fullness, centered inside
             ctx.arc(this.x, this.y, this.size * 0.3, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * fullness) );
             //ctx.lineTo(this.x, this.y); // Make it a pie wedge? Or just arc? Let's try arc+fill.
             //ctx.closePath(); // Not needed for arc fill
             // --- Draw a small circle representing carrying ---
             ctx.arc(this.x, this.y, this.size * 0.3 * fullness, 0, Math.PI * 2);
             ctx.fill();
         }


         // --- Draw Status Bars ---
         const barWidth = Math.max(10, this.size * 1.2);
         const barHeight = 3;
         const energyBarYOffset = this.size / 2 + 2;
         const healthBarYOffset = energyBarYOffset + barHeight + 1;

         // Energy Bar
         ctx.fillStyle = '#555';
         ctx.fillRect(this.x - barWidth / 2, this.y + energyBarYOffset, barWidth, barHeight);
         ctx.fillStyle = 'lime';
         ctx.fillRect(this.x - barWidth / 2, this.y + energyBarYOffset, barWidth * Math.max(0, this.energy / Config.maxEnergy), barHeight);

         // Health Bar
         ctx.fillStyle = '#500';
         ctx.fillRect(this.x - barWidth / 2, this.y + healthBarYOffset, barWidth, barHeight);
         ctx.fillStyle = 'red';
         ctx.fillRect(this.x - barWidth / 2, this.y + healthBarYOffset, barWidth * Math.max(0, this.health / this.maxHealth), barHeight);

         // --- Draw State Indicator ---
         let stateBorderColor = null;
         switch(this.state) {
             case CreatureState.FIGHTING: stateBorderColor = 'orange'; break;
             case CreatureState.GATHERING: stateBorderColor = 'brown'; break;
             case CreatureState.BUILDING: stateBorderColor = 'cyan'; break;
             case CreatureState.SEEKING_ENEMY: stateBorderColor = 'yellow'; break;
             case CreatureState.SEEKING_DROPOFF: stateBorderColor = '#A9A9A9'; break; // DarkGray for seeking dropoff
         }
         if (stateBorderColor) {
               ctx.strokeStyle = stateBorderColor;
               ctx.lineWidth = 1.5;
               ctx.beginPath();
               ctx.arc(this.x, this.y, this.size / 2 + 1.5, 0, Math.PI * 2);
               ctx.stroke();
          }
    }
}