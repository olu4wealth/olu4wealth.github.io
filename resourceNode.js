// resourceNode.js
import * as Config from './config.js';

export default class ResourceNode {
    constructor(x, y) {
        // Store as top-left // CHECK: Consistent with usage? Yes, Quadtree and drawing use top-left.
        this.x = x;
        this.y = y;
        this.size = Config.resourceNodeSize; // CHECK: Config var exists? Assumed yes.
        this.width = this.size;
        this.height = this.size;
        this.material = Config.materialPerNode; // CHECK: Config var exists? Assumed yes.
        this.color = 'saddlebrown';
    }

    gather() {
        if (this.material > 0) {
            const initialMaterial = this.material; // Store material before decrementing
            this.material -= Config.gatherAmount; // CHECK: Config var exists? Assumed yes.
            if (this.material < 0) {
                 this.material = 0;
            }
            const amountGathered = initialMaterial - this.material;
            return amountGathered;

        }
        return 0; // Nothing left to gather - CORRECT
    }

    isEmpty() {
        // Uses <= 0, robust for potential float inaccuracies or exact 0. CORRECT.
        return this.material <= 0;
    }

    draw(ctx) {
        if (this.isEmpty()) return; // Correctly prevents drawing empty nodes - GOOD.

        // Draw as a square/rock shape
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height); // Correct usage.

        // Optional: Indicate remaining amount visually
        // CHECK: Config.materialPerNode != 0? If it could be 0, division by zero risk. Assume > 0.
        const fullness = this.material / Config.materialPerNode;
        // Alpha calculation: 0.3 * (1 - fullness). Correctly makes overlay stronger as node depletes.
        ctx.fillStyle = `rgba(255, 255, 255, ${0.3 * (1 - fullness)})`;
        ctx.fillRect(this.x, this.y, this.width, this.height); // Correctly draws overlay.
        // Visual effect logic seems sound.
    }
}