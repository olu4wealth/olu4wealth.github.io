// food.js
import * as Config from './config.js'; // Import config if needed (e.g., for size)

export default class Food {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = Config.foodSize; // Use config size
        this.width = this.size;
        this.height = this.size;
        this.color = 'lightgreen';;
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.size / 2, 0, Math.PI * 2);
        ctx.fill();
    }
}