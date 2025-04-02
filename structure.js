// structure.js
import * as Config from './config.js';

export default class Structure {
    constructor(x, y, tribeId, type = 'Marker') {
        this.x = x; // Center X
        this.y = y; // Center Y
        this.tribeId = tribeId;
        this.type = type; // 'Marker', 'Shelter', etc.
        this.isComplete = false;

		// Type-specific properties
        this.cost = {};
        this.buildTime = 0;
        this.size = 0; // Visual size

        // --- Combat/Health for Structures ---
        this.maxHealth = 1; // Default, overridden below
        this.health = this.maxHealth;
        this.damageTakenVisualTimer = 0; // For flashing

        // --- Tower Specific ---
        this.attackRangeSq = 0;
        this.attackCooldown = 0;
        this.currentAttackCooldown = 0; // Ready initially

        // --- Farm Specific ---
		this.foodGenerationTimer = 0; // Timer for generation rate (using seconds now potentially)

        // --- Shelter Specific ---
        this.effectRadiusSq = 0;

        switch(this.type) {
            case 'Shelter':
                this.cost = Config.shelterCost;
                this.buildTime = Config.shelterBuildTime;
                this.size = Config.shelterSize;
                this.color = `hsl(${Config.tribeColors[tribeId]}, 40%, 40%)`; // Slightly different base color
                this.completeColor = `hsl(${Config.tribeColors[tribeId]}, 80%, 60%)`;
                this.effectRadiusSq = Config.shelterEffectRadius * Config.shelterEffectRadius; // Store squared radius
                this.maxHealth = 50; // Shelters can be destroyed
                break;
			case 'Farm':
				this.cost = Config.farmCost;
				this.buildTime = Config.farmBuildTime;
				this.size = Config.farmSize;
				this.color = `hsl(${Config.tribeColors[tribeId]}, 50%, 30%)`; // Earthy tones
				this.completeColor = `hsl(${Config.tribeColors[tribeId]}, 90%, 55%)`;
                this.maxHealth = 80; // Farms too
				break;
            case 'Wall':
                this.cost = Config.wallCost;
                this.buildTime = Config.wallBuildTime;
                this.size = Config.wallSegmentSize; // Use segment size for visuals/collision
                this.color = `hsl(${Config.tribeColors[tribeId]}, 20%, 45%)`; // Greyish stone
                this.completeColor = `hsl(${Config.tribeColors[tribeId]}, 25%, 60%)`;
                this.maxHealth = Config.wallHealth;
                break;
            case 'GuardTower':
                this.cost = Config.towerCost;
                this.buildTime = Config.towerBuildTime;
                this.size = Config.towerSize;
                this.color = `hsl(${Config.tribeColors[tribeId]}, 35%, 35%)`; // Darker stone
                this.completeColor = `hsl(${Config.tribeColors[tribeId]}, 40%, 55%)`;
                this.maxHealth = Config.towerHealth;
                // Tower combat stats
                this.attackRangeSq = Config.towerAttackRange * Config.towerAttackRange;
                this.attackCooldown = Config.towerAttackCooldown;
                break;
            case 'Marker':
            default:
                this.type = 'Marker';
                this.cost = Config.markerCost; // Use specific marker cost obj
                this.buildTime = Config.markerBuildTime; // *** USE SPECIFIC MARKER BUILD TIME ***
                this.size = 15;
                this.color = `hsl(${Config.tribeColors[tribeId]}, 30%, 30%)`;
                this.completeColor = `hsl(${Config.tribeColors[tribeId]}, 70%, 50%)`;
                this.maxHealth = 20; // Markers are weak
                break;
        }

        this.health = this.maxHealth; // Set initial health
        this.buildProgress = 0;
        this.width = this.size; this.height = this.size; // For quadtree
    }

    build(amount) {
        if (this.isComplete) return;
        this.buildProgress += amount;
        if (this.buildProgress >= this.buildTime) {
            this.buildProgress = this.buildTime;
            this.isComplete = true;
            console.log(`Tribe ${this.tribeId} completed a ${this.type}!`);
        }
    }

    // --- New: Apply effects to nearby creatures ---
    applyEffects(nearbyCreatures) {
        if (!this.isComplete) return; // Only apply effects when complete

        switch (this.type) {
            case 'Shelter':
                for (const creature of nearbyCreatures) {
                    // Check tribe and distance (using squared distance)
                    if (creature.tribeId === this.tribeId) {
                        const dx = creature.x - this.x;
                        const dy = creature.y - this.y;
                        if (dx*dx + dy*dy < this.effectRadiusSq) {
                            // Apply effect: Reduce energy decay (handled in creature's update)
                            creature.applyShelterBonus(Config.shelterEnergySave);
                        }
                    }
                }
                break;
            // Add cases for other structure types later
        }
    }

	// --- Apply effects / Generate Resources ---
	// Added deltaTime for rate-based generation
	generateResources(deltaTime) {
		if (!this.isComplete) return null;

		switch (this.type) {
			case 'Farm':
				// Increment timer by time elapsed in seconds
				this.foodGenerationTimer += deltaTime / 1000;
				// Check if enough time has passed based on rate (food per second)
				if (Config.farmFoodGenerationRate > 0 && this.foodGenerationTimer >= (1 / Config.farmFoodGenerationRate)) {
					this.foodGenerationTimer -= (1 / Config.farmFoodGenerationRate); // Subtract time for one unit

					const spawnRadius = this.size;
					const angle = Math.random() * Math.PI * 2;
					const spawnX = this.x + Math.cos(angle) * (spawnRadius * Math.random());
					const spawnY = this.y + Math.sin(angle) * (spawnRadius * Math.random());

					const clampedX = Math.max(Config.foodSize / 2, Math.min(Config.canvasWidth - Config.foodSize / 2, spawnX));
					const clampedY = Math.max(Config.foodSize / 2, Math.min(Config.canvasHeight - Config.foodSize / 2, spawnY));

					// Return data needed to create food in main loop
					return { type: 'food', amount: 1, x: clampedX, y: clampedY };
				}
				break;
		}
		return null;
	}

    takeDamage(amount) {
        if (!this.isComplete || this.health <= 0) return; // Prevent damaging destroyed or under construction?

        this.health -= amount;
        this.damageTakenVisualTimer = 10;
        if (this.health <= 0) {
            this.health = 0;
            this.isComplete = false; // Mark as no longer complete/functional if destroyed
            // Structure is destroyed! Needs removal in main loop based on health.
            console.log(`Tribe ${this.tribeId}'s ${this.type} was destroyed!`);
        }
    }

    // --- Structure Update (e.g., Tower Attack) ---
    updateStructure(deltaTime, creatureQuadTree) { // Pass deltaTime
        if (!this.isComplete || this.health <= 0) return; // Don't update incomplete or destroyed

        // Decrement cooldowns (using deltaTime for frame-rate independence)
        const deltaFrames = deltaTime / (1000/60); // Approximate frames passed
        if (this.currentAttackCooldown > 0) this.currentAttackCooldown -= deltaFrames;
        if (this.damageTakenVisualTimer > 0) this.damageTakenVisualTimer -= deltaFrames;


        // Tower Attack Logic
        if (this.type === 'GuardTower' && this.currentAttackCooldown <= 0) {
			let target = this.findTowerTarget(creatureQuadTree);
            if (target) {
                target.takeDamage(Config.towerAttackDamage);
                this.currentAttackCooldown = this.attackCooldown; // Reset cooldown (in frames)
            }
        }
    }

    findTowerTarget(creatureQuadTree) {
        let nearestEnemy = null;
        let minDistanceSq = this.attackRangeSq; // Use tower's range

        const queryBounds = {
            x: this.x - Config.towerAttackRange, // Use range for query
            y: this.y - Config.towerAttackRange,
            width: Config.towerAttackRange * 2,
            height: Config.towerAttackRange * 2
        };
        const candidatesBounds = creatureQuadTree.retrieve(queryBounds);

        for (const bounds of candidatesBounds) {
            const creature = bounds.ref;
            if (!creature.isAlive || creature.tribeId === this.tribeId) { // Skip allies and dead
                continue;
            }

            const dx = creature.x - this.x;
            const dy = creature.y - this.y;
            const distanceSq = dx * dx + dy * dy;

            if (distanceSq < minDistanceSq) {
                minDistanceSq = distanceSq;
                nearestEnemy = creature;
            }
        }
        return nearestEnemy;
    }



    draw(ctx) {
        if (this.health <= 0 && this.isComplete) return; // Don't draw destroyed structures (allow drawing under construction)

        let drawColor = this.isComplete ? this.completeColor : this.color;
        const radius = this.size / 2;

        // Damage Flash
         if (this.damageTakenVisualTimer > 0) {
             const flashAmount = Math.max(0, this.damageTakenVisualTimer) / 10; // Ensure timer isn't negative
             drawColor = `hsl(0, 100%, ${60 + flashAmount * 30}%)`; // Flash Red
         }

        // --- Draw Base Shape ---
        ctx.fillStyle = drawColor;
        const topLeftX = this.x - radius;
        const topLeftY = this.y - radius;

        if (this.type === 'Shelter') {
             ctx.beginPath();
             ctx.moveTo(topLeftX, this.y + radius); // Bottom left
             ctx.lineTo(topLeftX, this.y - radius * 0.5); // Mid left
             ctx.lineTo(this.x, this.y - radius * 1.5);      // Top peak
             ctx.lineTo(this.x + radius, this.y - radius * 0.5); // Mid right
             ctx.lineTo(this.x + radius, this.y + radius); // Bottom right
             ctx.closePath();
             ctx.fill();
        }
		else if (this.type === 'Farm') {
				ctx.fillRect(topLeftX, topLeftY, this.size, this.size);
                if (this.isComplete) {
                    ctx.strokeStyle = `hsla(${Config.tribeColors[this.tribeId]}, 95%, 75%, 0.6)`;
                    ctx.lineWidth = 1;
                    for(let i=1; i<4; ++i) {
                        ctx.beginPath();
                        ctx.moveTo(topLeftX, topLeftY + (this.size * i / 4));
                        ctx.lineTo(topLeftX + this.size, topLeftY + (this.size * i / 4));
                        ctx.stroke();
                    }
                }
        }
        else if (this.type === 'Wall') {
             ctx.fillRect(topLeftX, topLeftY, this.size, this.size);
        }
        else if (this.type === 'GuardTower') {
             ctx.fillRect(topLeftX, topLeftY, this.size, this.size); // Base
             if(this.isComplete) {
                 ctx.fillStyle = this.completeColor; // Top part color
                 // Draw top slightly smaller and offset upwards
                 const topSize = this.size * 0.8;
                 const topOffset = radius * 0.6;
                 ctx.fillRect(this.x - topSize/2, this.y - radius - topOffset, topSize, topSize);
             }
        }
		else { // Default Marker drawing (Circle)
             ctx.beginPath();
             ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
             ctx.fill();
        }

        // --- Draw Health Bar ---
        if (this.maxHealth > 1) {
             const barWidth = Math.max(8, this.size * 0.8); // Slightly smaller bar
             const barY = this.y + radius + (this.isComplete ? 2 : 5);
             const barHeight = 3;
             const healthPercent = Math.max(0, this.health / this.maxHealth);
             ctx.fillStyle = '#500'; // Dark red background
             ctx.fillRect(this.x - barWidth / 2, barY, barWidth, barHeight);
             ctx.fillStyle = 'red';
             ctx.fillRect(this.x - barWidth / 2, barY, barWidth * healthPercent, barHeight);
        }

        // Draw build progress bar if incomplete
        if (!this.isComplete) {
            const progressPercent = this.buildProgress / this.buildTime; // Use specific buildTime
            const barWidth = Math.max(8, this.size * 0.8);
            const barY = this.y + radius + 2;
            ctx.fillStyle = '#555';
            ctx.fillRect(this.x - barWidth / 2, barY, barWidth, 3);
            ctx.fillStyle = 'lightblue';
            ctx.fillRect(this.x - barWidth / 2, barY, barWidth * progressPercent, 3);
        }

        // --- Draw Visual Radii ---
         if (this.isComplete) {
             if (this.type === 'Shelter') {
                 ctx.strokeStyle = `hsla(${Config.tribeColors[this.tribeId]}, 80%, 70%, 0.2)`;
                 ctx.lineWidth = 1;
                 ctx.beginPath();
                 ctx.arc(this.x, this.y, Config.shelterEffectRadius, 0, Math.PI * 2);
                 ctx.stroke();
             } else if (this.type === 'GuardTower') {
                 ctx.strokeStyle = `hsla(${Config.tribeColors[this.tribeId]}, 50%, 50%, 0.15)`;
                 ctx.lineWidth = 1;
                 ctx.beginPath();
                 ctx.arc(this.x, this.y, Config.towerAttackRange, 0, Math.PI * 2);
                 ctx.stroke();
             }
         }
    }
}