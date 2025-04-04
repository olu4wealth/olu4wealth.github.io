// structure.js
import * as Config from './config.js';

export default class Structure {
    constructor(x, y, tribeId, type = 'Marker') {
        this.x = x; // Center X
        this.y = y; // Center Y
        this.tribeId = tribeId;
        this.type = type; // 'Marker', 'Shelter', etc.
        this.isComplete = false;
        this.buildProgress = 0;
		
		// Type-specific properties
        this.cost = {};
        this.buildTime = Config.buildTime;	
        this.size = 0; // Visual size
		this.health = null; // Only some structures have health
        this.maxHealth = null;
        this.isObstacle = false; // NEW: For pathfinding interaction
        this.influenceRate = 0; // Specific influence generation
        this.influenceRadius = 0;
		
		// Tower specific
        this.attackDamage = 0;
        this.attackRange = 0;
        this.attackRangeSq = 0; // Store squared range for efficiency
        this.attackCooldownTime = 0;
        this.currentAttackCooldown = 0;
        this.currentTarget = null;
        this.targetingScanTimer = 0; // Timer for scanning
		
        switch(this.type) {
            case 'Shelter':
                this.cost = Config.shelterCost;
                this.buildTime = Config.shelterBuildTime;
                this.size = Config.shelterSize;
                this.color = `hsl(${Config.tribeColors[tribeId]}, 40%, 40%)`; // Slightly different base color
                this.completeColor = `hsl(${Config.tribeColors[tribeId]}, 80%, 60%)`;
                this.effectRadiusSq = Config.shelterEffectRadius * Config.shelterEffectRadius; // Store squared radius
				this.health = 100; // Give shelters some basic health?
                this.maxHealth = 100;
                this.influenceRate = Config.shelterInfluenceRate;
                this.influenceRadius = Config.shelterInfluenceRadius;
                break;
			case 'Wall': // NEW Type
                this.cost = Config.wallCost;
                this.buildTime = Config.wallBuildTime;
                this.size = Config.wallSize;
                this.color = `hsl(${Config.tribeColors[tribeId]}, 20%, 50%)`; // Dull color
                this.completeColor = `hsl(${Config.tribeColors[tribeId]}, 25%, 70%)`;
                this.health = Config.wallHealth;
                this.maxHealth = Config.wallHealth;
                this.isObstacle = true; // Walls block movement
                this.influenceRate = 0.2; // Minimal influence, just presence
                this.influenceRadius = Config.wallSize;
                break;
            case 'Tower': // NEW Type
                this.cost = Config.towerCost;
                this.buildTime = Config.towerBuildTime;
                this.size = Config.towerSize;
                this.color = `hsl(${Config.tribeColors[tribeId]}, 50%, 30%)`; // Darker base
                this.completeColor = `hsl(${Config.tribeColors[tribeId]}, 60%, 50%)`;
                this.health = Config.towerHealth;
                this.maxHealth = Config.towerHealth;
                this.attackDamage = Config.towerAttackDamage;
                this.attackRange = Config.towerAttackRange;
                this.attackRangeSq = this.attackRange * this.attackRange;
                this.attackCooldownTime = Config.towerAttackCooldown;
                this.influenceRate = Config.towerInfluenceRate;
                this.influenceRadius = Config.towerInfluenceRadius;
                break;
            case 'Marker': // Fallback or default
            default:
                this.type = 'Marker';
                this.cost = { material: Config.markerCost }; // Use specific marker cost
                this.buildTime = Config.buildTime;
                this.size = 15;
                this.color = `hsl(${Config.tribeColors[tribeId]}, 30%, 30%)`;
                this.completeColor = `hsl(${Config.tribeColors[tribeId]}, 70%, 50%)`;
				this.health = 50; // Markers can be destroyed too
                this.maxHealth = 50;
                this.influenceRate = Config.markerInfluenceRate;
                this.influenceRadius = Config.markerInfluenceRadius;
                break;
        }
		
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
	
	// --- NEW: takeDamage ---
    takeDamage(amount) {
        if (!this.isComplete || this.health === null) return; // Cannot damage incomplete or indestructible structures

        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            // Structure is destroyed! Needs to be handled in main.js (remove from structures array)
            console.log(`Tribe ${this.tribeId}'s ${this.type} was destroyed!`);
            // Optionally, return true to signal destruction
            return true;
        }
        return false;
    }
	
    // --- New: Apply effects to nearby creatures ---
     update(nearbyCreatures, allStructures) {
        if (!this.isComplete) return; // Only apply effects when complete
		
		// --- Cooldowns ---
        if (this.currentAttackCooldown > 0) {
            this.currentAttackCooldown--;
        }
        if (this.targetingScanTimer > 0) {
            this.targetingScanTimer--;
        }
		
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
				
			case 'Tower':
                // Attack logic
                if (this.currentAttackCooldown <= 0 && this.targetingScanTimer <= 0) {
                    this.targetingScanTimer = Config.towerTargetingScanRate; // Reset scan timer

                    // Check if current target is still valid
                    if (this.currentTarget && (!this.currentTarget.isAlive || this.distanceSqTo(this.currentTarget) > this.attackRangeSq)) {
                        this.currentTarget = null; // Invalidate target
                    }

                    // Find a new target if needed
                    if (!this.currentTarget) {
                        this.findTarget(nearbyCreatures);
                    }

                    // Attack if target found
                    if (this.currentTarget) {
                         // Basic "attack" - just apply damage instantly
                         // TODO: Could add projectile visualization later
                         this.currentTarget.takeDamage(this.attackDamage);
                         console.log(`Tribe ${this.tribeId} Tower shot at Tribe ${this.currentTarget.tribeId} creature.`);
                         this.currentAttackCooldown = this.attackCooldownTime; // Reset cooldown

                         // Optional: Lose target after shooting to force rescan? Or keep target? Keep for now.
                    }
                }
                break;

            // Walls and Markers have no active update logic
        }
    }

    // Helper for distance check
    distanceSqTo(target) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        return dx * dx + dy * dy;
    }

    // --- NEW: Tower finds target ---
    findTarget(nearbyCreatures) {
        let closestEnemy = null;
        let minDistanceSq = this.attackRangeSq;

        for (const creature of nearbyCreatures) {
            if (creature.isAlive && creature.tribeId !== this.tribeId) {
                const distSq = this.distanceSqTo(creature);
                if (distSq < minDistanceSq) {
                    minDistanceSq = distSq;
                    closestEnemy = creature;
                }
            }
        }
        this.currentTarget = closestEnemy;        
    }

    draw(ctx) {
        const drawColor = this.isComplete ? this.completeColor : this.color;
        const radius = this.size / 2;

        // Draw based on type (e.g., Shelter as house shape?)
		// --- Draw based on type ---
        ctx.fillStyle = drawColor;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; // Outline
        ctx.lineWidth = 1;
		
        if (this.type === 'Shelter') {
             ctx.fillStyle = drawColor;
             ctx.beginPath();
             ctx.moveTo(this.x - radius, this.y + radius); // Bottom left
             ctx.lineTo(this.x - radius, this.y - radius * 0.5); // Mid left
             ctx.lineTo(this.x, this.y - radius * 1.5);      // Top peak
             ctx.lineTo(this.x + radius, this.y - radius * 0.5); // Mid right
             ctx.lineTo(this.x + radius, this.y + radius); // Bottom right
             ctx.closePath();
             ctx.fill();
			 ctx.stroke();
		} else if (this.type === 'Wall') { // NEW Draw Wall
            ctx.fillRect(this.x - radius, this.y - radius, this.size, this.size);
            ctx.strokeRect(this.x - radius, this.y - radius, this.size, this.size);
        } else if (this.type === 'Tower') { // NEW Draw Tower
            const baseRadius = radius;
            const topRadius = radius * 0.6;
            // Base
            ctx.beginPath();
            ctx.arc(this.x, this.y, baseRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // Top Platform (darker?)
            ctx.fillStyle = `hsl(${Config.tribeColors[this.tribeId]}, 50%, 40%)`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, topRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // Draw attack range if targeting? or always? (Optional)
             if (this.isComplete) {
                 ctx.strokeStyle = `hsla(${Config.tribeColors[this.tribeId]}, 60%, 50%, 0.15)`;
                 ctx.lineWidth = 1;
                 ctx.beginPath();
                 ctx.arc(this.x, this.y, this.attackRange, 0, Math.PI * 2);
                 ctx.stroke();
             }
             // Draw line to target? (Optional)
             if(this.currentTarget && this.currentAttackCooldown > (this.attackCooldownTime - 10)) { // Show recent shot line
                 ctx.strokeStyle = `hsla(0, 100%, 70%, 0.7)`; // Reddish shot line
                 ctx.lineWidth = 1.5;
                 ctx.beginPath();
                 ctx.moveTo(this.x, this.y);
                 ctx.lineTo(this.currentTarget.x, this.currentTarget.y);
                 ctx.stroke();
             }
        } else { // Default Marker drawing             
             ctx.beginPath();
             ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
             ctx.fill();
			 ctx.stroke();
        }

        // Draw build progress bar if incomplete
        if (!this.isComplete) {
            const progressPercent = this.buildProgress / this.buildTime;
            const barWidth = this.size * 1.2;
            const barY = this.y + radius + 2;
            ctx.fillStyle = '#555';
            ctx.fillRect(this.x - barWidth / 2, barY, barWidth, 3);
            ctx.fillStyle = 'lightblue';
            ctx.fillRect(this.x - barWidth / 2, barY, barWidth * progressPercent, 3);
        } // --- Draw health bar (if complete and has health) ---
        else if (this.health !== null && this.health < this.maxHealth) {
             const healthPercent = this.health / this.maxHealth;
             const barWidth = this.size * 1.2;
             const barY = this.y + radius + 2; // Position below
             ctx.fillStyle = '#500'; // Dark red background
             ctx.fillRect(this.x - barWidth / 2, barY, barWidth, 3);
             ctx.fillStyle = 'red';
             ctx.fillRect(this.x - barWidth / 2, barY, barWidth * healthPercent, 3);
        }
        // Optional: Draw effect radius for completed Shelters
        //if (this.isComplete && this.type === 'Shelter') {
         //    ctx.strokeStyle = `hsla(${Config.tribeColors[this.tribeId]}, 80%, 70%, 0.2)`;
         //    ctx.lineWidth = 1;
        //     ctx.beginPath();
         //    ctx.arc(this.x, this.y, Config.shelterEffectRadius, 0, Math.PI * 2);
         //    ctx.stroke();
		// }			 
    }
}