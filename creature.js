// creature.js
import * as Config from './config.js'; // Import all constants

// Define states
const CreatureState = {
    IDLE: 'idle',
    WANDERING: 'wandering',
    SEEKING_FOOD: 'seeking_food',
    SEEKING_ENEMY: 'seeking_enemy',
    FIGHTING: 'fighting', // Maybe combine with seeking_enemy later
    GATHERING: 'gathering',
    BUILDING: 'building',
    // FLEEING: 'fleeing' // Future state
};

export default class Creature {
    // Add tribeId parameter, default to null for initial creatures
    constructor(x, y, energy = null, genes = null, tribeId = null) {
        this.x = x; // Center X
        this.y = y; // Center Y
        this.isAlive = true;
        // Initialize timers (Only once)
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
            this.mutate(); // Apply mutation AFTER assigning tribe
        } else {
            // Initialize base genes + random variation
            this.genes = {
                speed: Config.baseSpeed * (1 + (Math.random() - 0.5) * 0.2),
                perception: Config.basePerceptionRadius * (1 + (Math.random() - 0.5) * 0.2),
                size: Config.baseCreatureSize * (1 + (Math.random() - 0.5) * 0.2),
				aggression: Config.baseAggression * (1 + (Math.random() - 0.5) * 0.4),
            };
             // Ensure initial genes are valid
            this.genes.speed = Math.max(0.1, this.genes.speed);
            this.genes.perception = Math.max(10, this.genes.perception);
            this.genes.size = Math.max(Config.baseCreatureSize / 2, this.genes.size);
            this.genes.aggression = Math.max(0, Math.min(1, this.genes.aggression)); // Clamp 0-1
        }

        // --- Phenotype & Combat Stats ---
        this.speed = this.genes.speed;
        this.perceptionRadius = this.genes.perception;
        this.size = this.genes.size;
        this.aggression = this.genes.aggression;

        this.maxHealth = Config.baseHealth + Math.max(0, this.genes.size - Config.baseCreatureSize) * Config.healthPerSize;
        this.health = this.maxHealth;
        this.attackDamage = Config.baseAttackDamage + Math.max(0, this.genes.size - Config.baseCreatureSize) * Config.damagePerSize;
        this.attackReach = this.size / 2 + Config.attackRange;

        // Assign color based on Tribe + Genes
        this.assignColor();

        // --- Properties for Quadtree Library ---
        this.width = this.size;
        this.height = this.size;

        // --- Energy ---
        this.energyDecay = Config.energyDecayRate * (this.size / Config.baseCreatureSize);
        this.energy = energy !== null ? energy : (Config.maxEnergy / 2 + Math.random() * (Config.maxEnergy / 2));

        // --- Movement ---
        this.dx = (Math.random() - 0.5);
        this.dy = (Math.random() - 0.5);
        this.normalizeMovement(); // Initialize movement vector based on speed

        // --- State Properties ---
        this.state = CreatureState.WANDERING;
        this.targetResource = null;
        this.targetBuildSite = null;
        this.targetEnemy = null; // CORRECTED: Initialize targetEnemy
		
        // --- Bonus Effects Tracking ---
        this.shelterBonus = 0; // Reset each frame before update
    }

    assignColor() {
        // Base hue from tribe
        const baseHue = Config.tribeColors[this.tribeId % Config.tribeColors.length];
        // Modify saturation/lightness based on genes
        const saturation = 70 + (this.genes.speed / Config.baseSpeed - 1) * 20;
        const lightness = 60 - (this.genes.size / Config.baseCreatureSize - 1) * 15;

        this.color = `hsl(${baseHue}, ${Math.max(40, Math.min(100, saturation))}%, ${Math.max(30, Math.min(70, lightness))}%)`;
    }

    mutate() {
        // Mutate Speed
        if (Math.random() < Config.mutationRate) {
            this.genes.speed *= (1 + (Math.random() - 0.5) * 2 * Config.mutationAmount);
            this.genes.speed = Math.max(0.1, this.genes.speed);
        }
        // Mutate Perception
        if (Math.random() < Config.mutationRate) {
            this.genes.perception *= (1 + (Math.random() - 0.5) * 2 * Config.mutationAmount);
            this.genes.perception = Math.max(10, this.genes.perception);
        }
        // Mutate Size
        if (Math.random() < Config.mutationRate) {
            this.genes.size *= (1 + (Math.random() - 0.5) * 2 * Config.mutationAmount);
            this.genes.size = Math.max(Config.baseCreatureSize / 2, this.genes.size);
            this.genes.size = Math.min(Config.baseCreatureSize * 2, this.genes.size);
        }
        // Mutate Aggression
        if (Math.random() < Config.mutationRate) {
           this.genes.aggression *= (1 + (Math.random() - 0.5) * 2 * Config.mutationAmount);
           this.genes.aggression = Math.max(0, Math.min(1, this.genes.aggression)); // Clamp 0-1
        }

        // Update phenotype after mutation
        this.speed = this.genes.speed;
        this.perceptionRadius = this.genes.perception;
        this.size = this.genes.size;
        this.aggression = this.genes.aggression;

        // Recalculate combat stats if size changed
        this.maxHealth = Config.baseHealth + Math.max(0, this.genes.size - Config.baseCreatureSize) * Config.healthPerSize;
        // Note: Health is NOT reset to maxHealth on mutation
        this.attackDamage = Config.baseAttackDamage + Math.max(0, this.genes.size - Config.baseCreatureSize) * Config.damagePerSize;
        this.attackReach = this.size / 2 + Config.attackRange;
        // Update quadtree dims if size changed
        this.width = this.size;
        this.height = this.size;
        // Update energy decay if size changed
        this.energyDecay = Config.energyDecayRate * (this.size / Config.baseCreatureSize);

        // Recalculate color based on potentially new genes
        this.assignColor();
    }

    normalizeMovement() {
        const magnitude = Math.sqrt(this.dx * this.dx + this.dy * this.dy);
        if (magnitude > 0) {
            this.dx = (this.dx / magnitude) * this.speed;
            this.dy = (this.dy / magnitude) * this.speed;
        } else {
            // If no movement, give a slight random nudge based on speed
            this.dx = (Math.random() - 0.5) * this.speed * 0.5;
            this.dy = (Math.random() - 0.5) * this.speed * 0.5;
        }
    }

    findNearestFood(foodQuadTree) {
        let nearestFood = null;
        const queryBounds = {
            x: this.x - this.perceptionRadius,
            y: this.y - this.perceptionRadius,
            width: this.perceptionRadius * 2,
            height: this.perceptionRadius * 2
        };
        const candidates = foodQuadTree.retrieve(queryBounds);
        let minDistanceSq = this.perceptionRadius * this.perceptionRadius;

        for (const food of candidates) {
            const dx = food.x + food.width / 2 - this.x;
            const dy = food.y + food.height / 2 - this.y;
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
        const candidatesBounds = creatureQuadTree.retrieve(queryBounds);

        for (const bounds of candidatesBounds) {
            const otherCreature = bounds.ref;
            if (otherCreature === this || !otherCreature.isAlive) {
                continue;
            }
            if (otherCreature.tribeId !== this.tribeId) {
                const dx = otherCreature.x - this.x;
                const dy = otherCreature.y - this.y;
                const distanceSq = dx * dx + dy * dy;
                if (distanceSq < minDistanceSq) {
                    minDistanceSq = distanceSq;
                    nearestEnemy = otherCreature;
                }
            }
        }
        return nearestEnemy;
    }

    takeDamage(amount) {
        if (!this.isAlive) return;
        this.health -= amount;
        this.damageTakenVisualTimer = 10;
        if (this.health <= 0) {
            this.health = 0;
            this.isAlive = false;
            console.log(`Tribe ${this.tribeId} creature died in combat!`);
        }
    }

    findNearestResource(resourceQuadTree) {
         let nearestNode = null;
         const perceptionSq = this.perceptionRadius * this.perceptionRadius;
         let minDistanceSq = perceptionSq;
         // CORRECTED: Included 'y' coordinate
         const queryBounds = {
            x: this.x - this.perceptionRadius,
            y: this.y - this.perceptionRadius, // Added missing 'y'
            width: this.perceptionRadius * 2,
            height: this.perceptionRadius * 2
         };
         const candidates = resourceQuadTree.retrieve(queryBounds);

         for (const node of candidates) {
             if (node.isEmpty()) continue;
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
            if (!site.isComplete && site.tribeId === this.tribeId) {
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
	
    // --- New: Apply Shelter Bonus ---
    applyShelterBonus(amount) {
         // This flag/value will be used when calculating energy decay
         this.shelterBonus = amount;
    }

    update(deltaTime, foodQuadTree, creatureQuadTree, resourceQuadTree, structureList, tribeStockpiles, tribeKnowledge, tribeTech) { // Added Knowledge/Tech
        if (!this.isAlive) return null;
		
        // --- Reset Bonuses ---
        this.shelterBonus = 0; // Reset bonus effect before structure effects are applied (in main loop)
		
        // --- Timers ---
        if (this.attackCooldown > 0) this.attackCooldown--;
        if (this.damageTakenVisualTimer > 0) this.damageTakenVisualTimer--;
        this.reproductionTimer++;
		
        // --- Passive Knowledge Generation ---
        tribeKnowledge[this.tribeId] = (tribeKnowledge[this.tribeId] || 0) + Config.knowledgePerCreatureTick * Config.researchSpeedMultiplier;
		
        // --- State Machine & Decision Logic ---
        let potentialEnemy = this.findEnemyTarget(creatureQuadTree);
        let isAggressive = Math.random() < this.aggression;
        let needsFood = this.energy < Config.energyThreshold;
        let potentialFood = needsFood ? this.findNearestFood(foodQuadTree) : null;
        let potentialBuildSite = this.findNearestBuildSite(structureList);
        let canBuild = potentialBuildSite && tribeStockpiles[this.tribeId] > 0; // Basic check, refine later based on site type cost

        // --- New: Check if Shelter can be built ---
        let canBuildShelter = tribeTech[this.tribeId]?.has('BasicConstruction'); // Check if tech researched
         // Prioritize shelter slightly? Or have dedicated builders later?
        // Let's just add it as an option if nothing else is pressing for now		
		
        let potentialResource = this.findNearestResource(resourceQuadTree);
        let shouldGather = !needsFood && !potentialEnemy && !canBuild && potentialResource;

        // Determine State based on priorities
        if (potentialEnemy && isAggressive) {
            this.state = CreatureState.SEEKING_ENEMY;
            this.targetEnemy = potentialEnemy;
            this.targetResource = null; this.targetBuildSite = null;
        } else if (needsFood && potentialFood) {
            this.state = CreatureState.SEEKING_FOOD;
            this.targetEnemy = null; this.targetResource = null; this.targetBuildSite = null;
        } else if (canBuild) {
            this.state = CreatureState.BUILDING;
            this.targetBuildSite = potentialBuildSite;
            this.targetEnemy = null; this.targetResource = null;
        } else if (shouldGather) {
             this.state = CreatureState.GATHERING;
             this.targetResource = potentialResource;
             this.targetEnemy = null; this.targetBuildSite = null;
        } else {
            if(this.state !== CreatureState.WANDERING) {
                 this.state = CreatureState.WANDERING;
                 this.targetEnemy = null; this.targetResource = null; this.targetBuildSite = null;
            }
        }

        // --- Execute State Actions ---
        this.dx = 0; this.dy = 0; // Reset movement intention for this frame

        switch (this.state) {
            case CreatureState.SEEKING_ENEMY:
            case CreatureState.FIGHTING:
                if (this.targetEnemy && this.targetEnemy.isAlive) {
                     const enemy = this.targetEnemy;
                     const dx = enemy.x - this.x;
                     const dy = enemy.y - this.y;
                     const distanceSq = dx * dx + dy * dy;
                     const requiredAttackDistSq = (this.attackReach + enemy.size / 2)**2;

                     if (distanceSq <= requiredAttackDistSq) {
                         this.state = CreatureState.FIGHTING;
                         if (this.attackCooldown <= 0) {
                             enemy.takeDamage(this.attackDamage);
                             this.attackCooldown = Config.attackCooldownTime;
                         }
                     } else {
                         this.state = CreatureState.SEEKING_ENEMY;
                         const distance = Math.sqrt(distanceSq);
                         this.dx = (dx / distance) * this.speed;
                         this.dy = (dy / distance) * this.speed;
                     }
                } else {
                    this.state = CreatureState.WANDERING;
                    this.targetEnemy = null; // Clear dead/lost target
                }
                break;

            case CreatureState.SEEKING_FOOD:
                if (potentialFood) {
                     const targetX = potentialFood.x + potentialFood.width / 2;
                     const targetY = potentialFood.y + potentialFood.height / 2;
                     const dx = targetX - this.x;
                     const dy = targetY - this.y;
                     const distance = Math.sqrt(dx * dx + dy * dy);
                     if (distance > this.size / 2 + potentialFood.size / 2) {
                         this.dx = (dx / distance) * this.speed;
                         this.dy = (dy / distance) * this.speed;
                     }
                 } else {
                     this.state = CreatureState.WANDERING;
                 }
                break;

             case CreatureState.GATHERING:
                if (this.targetResource && !this.targetResource.isEmpty()) {
                     const node = this.targetResource;
                     const nodeCenterX = node.x + node.width / 2;
                     const nodeCenterY = node.y + node.height / 2;
                     const dx = nodeCenterX - this.x;
                     const dy = nodeCenterY - this.y;
                     const distanceSq = dx * dx + dy * dy;
                     const gatherDistSq = (this.size / 2 + node.size / 2 + 5)**2;

                     if (distanceSq <= gatherDistSq) {
                         this.gatherTimer++;
                         if (this.gatherTimer >= Config.gatherTime) {
                             const gathered = node.gather();
                             if (gathered > 0) {
                                 tribeStockpiles[this.tribeId] = (tribeStockpiles[this.tribeId] || 0) + gathered;
                             }
                             this.gatherTimer = 0;
                             if (node.isEmpty()) {
                                 this.state = CreatureState.WANDERING;
                                 this.targetResource = null;
                             }
                         }
                     } else {
                         const distance = Math.sqrt(distanceSq);
                         this.dx = (dx / distance) * this.speed;
                         this.dy = (dy / distance) * this.speed;
                         this.gatherTimer = 0;
                     }
                } else {
                    this.state = CreatureState.WANDERING;
                    this.targetResource = null; // Clear depleted/lost target
                }
                break;

             case CreatureState.BUILDING:
                if (this.targetBuildSite && !this.targetBuildSite.isComplete) {
                     const site = this.targetBuildSite;
                     const dx = site.x - this.x;
                     const dy = site.y - this.y;
                     const distanceSq = dx * dx + dy * dy;
                     const buildDistSq = (this.size / 2 + site.size / 2 + 5)**2;

                     if (distanceSq <= buildDistSq) {
                        // Build only needs proximity, resource check done in decision phase
                        this.buildTimer++;
                        if (this.buildTimer >= 1) { // Progress per frame
                             site.build(1);
                             this.buildTimer = 0;
                        }
                        if (site.isComplete) {
                             this.state = CreatureState.WANDERING;
                             this.targetBuildSite = null;
                        }
                        // Note: If tribe runs out of resources mid-build, creature will switch state in the *next* frame's decision phase.
                     } else {
                         const distance = Math.sqrt(distanceSq);
                         this.dx = (dx / distance) * this.speed;
                         this.dy = (dy / distance) * this.speed;
                         this.buildTimer = 0;
                     }
                 } else {
                     this.state = CreatureState.WANDERING;
                     this.targetBuildSite = null; // Clear completed/lost target
                 }
                 break;

            case CreatureState.WANDERING:
            case CreatureState.IDLE:
                 if (Math.random() < 0.05) {
                     this.dx = (Math.random() - 0.5);
                     this.dy = (Math.random() - 0.5);
                     this.normalizeMovement();
                  }
                  // Apply slight deceleration only if wandering
                  this.dx *= 0.98;
                  this.dy *= 0.98;
                break;
        }

        // Apply final movement
        this.x += this.dx;
        this.y += this.dy;

        // --- Boundary Wrap --- 
        if (this.x < 0) this.x = Config.canvasWidth;
        if (this.x > Config.canvasWidth) this.x = 0;
        if (this.y < 0) this.y = Config.canvasHeight;
        if (this.y > Config.canvasHeight) this.y = 0;

        // --- Energy Decay ---
        const baseDecay = this.energyDecay;
        const movementFactor = Math.sqrt(this.dx*this.dx + this.dy*this.dy) / this.speed;
        const combatFactor = (this.state === CreatureState.FIGHTING || this.state === CreatureState.SEEKING_ENEMY) ? 0.2 : 0;
        const actionFactor = (this.state === CreatureState.GATHERING || this.state === CreatureState.BUILDING) ? 0.1 : 0;
        
		// Apply shelter bonus here
        const effectiveDecayRate = Math.max(0, baseDecay * (1 + movementFactor*0.5 + combatFactor + actionFactor) - this.shelterBonus) 
        this.energy -= effectiveDecayRate;


        // --- Check for Starvation Death ---
        if (this.energy <= 0 && this.isAlive) {
            this.isAlive = false;
            console.log(`Tribe ${this.tribeId} creature starved.`);
        }

        // --- Reproduction ---
        if (this.isAlive && this.energy >= Config.reproductionEnergyThreshold && this.reproductionTimer >= Config.reproductionCooldown) {
             this.energy -= Config.reproductionEnergyCost;
             this.reproductionTimer = 0;
             const offspringX = this.x + (Math.random() - 0.5) * 20;
             const offspringY = this.y + (Math.random() - 0.5) * 20;
            return new Creature(offspringX, offspringY, Config.offspringInitialEnergy, this.genes, this.tribeId);
        }

        return null;
    }

    isNear(targetX, targetY, targetW, targetH, distance) {
        const targetCenterX = targetX + targetW / 2;
        const targetCenterY = targetY + targetH / 2;
        const dx = this.x - targetCenterX;
        const dy = this.y - targetCenterY;
        // Use distance provided + radius sum as effective check distance
        const effectiveDistance = distance + this.size / 2 + Math.max(targetW, targetH) / 2;
        return (dx * dx + dy * dy) < (effectiveDistance * effectiveDistance);
    }

    eat(foodItem) {
         this.energy += Config.energyFromFood;
         if (this.energy > Config.maxEnergy) {
             this.energy = Config.maxEnergy;
         }
    }

    draw(ctx) {
         if (!this.isAlive) return;

         // Damage Flash Effect
         let drawColor = this.color;
         if (this.damageTakenVisualTimer > 0) {
             const flashAmount = this.damageTakenVisualTimer / 10;
             drawColor = `hsl(0, 100%, ${60 + flashAmount * 30}%)`;
         }

         // Draw main body
         ctx.fillStyle = drawColor;
         ctx.beginPath();
         ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
         ctx.fill();

         // Reproduction indicator
         if (this.energy >= Config.reproductionEnergyThreshold && this.reproductionTimer >= Config.reproductionCooldown) {
             ctx.strokeStyle = 'white';
             ctx.lineWidth = 1;
             // Draw border - needs arc path again
             ctx.beginPath();
             ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
             ctx.stroke();
         }

         // Health and Energy Bars
         const barWidth = this.size * 1.2;
         const energyBarY = this.y + this.size / 2 + 2;
         const healthBarY = energyBarY + 4;
         const barHeight = 3;

         // Energy Bar
         const energyPercent = this.energy / Config.maxEnergy;
         ctx.fillStyle = '#555';
         ctx.fillRect(this.x - barWidth / 2, energyBarY, barWidth, barHeight);
         ctx.fillStyle = 'lime';
         ctx.fillRect(this.x - barWidth / 2, energyBarY, barWidth * energyPercent, barHeight);

         // Health Bar
         const healthPercent = this.health / this.maxHealth;
         ctx.fillStyle = '#500';
         ctx.fillRect(this.x - barWidth / 2, healthBarY, barWidth, barHeight);
         ctx.fillStyle = 'red';
         ctx.fillRect(this.x - barWidth / 2, healthBarY, barWidth * healthPercent, barHeight);

         // State border indicator
         let stateBorderColor = null;
         switch(this.state) {
             case CreatureState.FIGHTING: stateBorderColor = 'orange'; break;
             case CreatureState.GATHERING: stateBorderColor = 'brown'; break;
             case CreatureState.BUILDING: stateBorderColor = 'cyan'; break;
         }
          if (stateBorderColor) {
               ctx.strokeStyle = stateBorderColor;
               ctx.lineWidth = 1.5;
               ctx.beginPath();
               ctx.arc(this.x, this.y, this.size / 2 + 1.5, 0, Math.PI * 2); // Adjust radius for visibility
               ctx.stroke();
          }
    }
}