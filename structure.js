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
		
        switch(this.type) {
            case 'Shelter':
                this.cost = Config.shelterCost;
                this.buildTime = Config.shelterBuildTime;
                this.size = Config.shelterSize;
                this.color = `hsl(${Config.tribeColors[tribeId]}, 40%, 40%)`; // Slightly different base color
                this.completeColor = `hsl(${Config.tribeColors[tribeId]}, 80%, 60%)`;
                this.effectRadiusSq = Config.shelterEffectRadius * Config.shelterEffectRadius; // Store squared radius
                break;
            case 'Marker': // Fallback or default
            default:
                this.type = 'Marker';
                this.cost = { material: Config.markerCost }; // Use specific marker cost
                this.buildTime = Config.buildTime;
                this.size = 15;
                this.color = `hsl(${Config.tribeColors[tribeId]}, 30%, 30%)`;
                this.completeColor = `hsl(${Config.tribeColors[tribeId]}, 70%, 50%)`;
                break;
        }
		
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

    draw(ctx) {
        const drawColor = this.isComplete ? this.completeColor : this.color;
        const radius = this.size / 2;

        // Draw based on type (e.g., Shelter as house shape?)
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
        } else { // Default Marker drawing
             ctx.fillStyle = drawColor;
             ctx.beginPath();
             ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
             ctx.fill();
        }

        // Draw build progress bar if incomplete
        if (!this.isComplete) {
            const progressPercent = this.buildProgress / Config.buildTime;
            const barWidth = this.size * 1.2;
            const barY = this.y + radius + 2;
            ctx.fillStyle = '#555';
            ctx.fillRect(this.x - barWidth / 2, barY, barWidth, 3);
            ctx.fillStyle = 'lightblue';
            ctx.fillRect(this.x - barWidth / 2, barY, barWidth * progressPercent, 3);
        }
        // Optional: Draw effect radius for completed Shelters
         if (this.isComplete && this.type === 'Shelter') {
             ctx.strokeStyle = `hsla(${Config.tribeColors[this.tribeId]}, 80%, 70%, 0.2)`;
             ctx.lineWidth = 1;
             ctx.beginPath();
             ctx.arc(this.x, this.y, Config.shelterEffectRadius, 0, Math.PI * 2);
             ctx.stroke();
		 }			 
    }
}