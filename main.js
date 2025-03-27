// main.js
import Creature from './creature.js';
import Food from './food.js';
import ResourceNode from './resourceNode.js'; // Import
import Structure from './structure.js';     // Import
import * as Config from './config.js'; // Import config constants
// Import the library from CDN (make sure version is desired)
import Quadtree from 'https://cdn.jsdelivr.net/npm/@timohausmann/quadtree-js@1.2.6/+esm';


// Get canvas and context (remains the same)
const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');

// --- World State ---
let creatures = [];
let foodItems = [];
let resourceNodes = []; // New array for resources
let structures = [];    // New array for structures
let tribeStockpiles = {}; // Global stockpile object { tribeId: amount }
let tribeKnowledge = {};    // New state for knowledge points { tribeId: amount }
let tribeTech = {};         // New state for researched tech { tribeId: Set('techName') }

let creatureQuadTree, foodQuadTree, resourceQuadTree; 

// --- Initialization ---
function initializeWorld() {
    console.log("Initializing world with Knowledge & Tech...");
    creatures = []; foodItems = []; resourceNodes = []; structures = [];
    tribeStockpiles = {}; tribeKnowledge = {}; tribeTech = {}; // Reset all
	
    // Define the boundary for the Quadtree library { x, y, width, height }
    const boundary = {
        x: 0,
        y: 0,
        width: Config.canvasWidth,
        height: Config.canvasHeight
    };
    creatureQuadTree = new Quadtree(boundary, Config.quadtreeCapacity);	
	
    // Instantiate the library's Quadtree
    // constructor: Quadtree(bounds: object, max_objects?: number, max_levels?: number)
    creatureQuadTree = new Quadtree(boundary, Config.quadtreeCapacity);
    foodQuadTree = new Quadtree(boundary, Config.foodQuadtreeCapacity);
    resourceQuadTree = new Quadtree(boundary, 10); // Capacity for resources

	// Initial creatures are assigned random tribes inside the constructor now
    for (let i = 0; i < Config.startingCreatureCount; i++) {
        // Create creatures with random initial gene variations
        creatures.push(new Creature(
            Math.random() * Config.canvasWidth,
            Math.random() * Config.canvasHeight
        ));
    }
	// Init Food Nodes
    spawnFood(Config.startingFoodCount);
    // Init Resource Nodes
    spawnResourceNodes(Config.startingResourceNodes);
    // Init tribe state
    for (let i = 0; i < Config.numberOfTribes; i++) {
        tribeStockpiles[i] = 0;
        tribeKnowledge[i] = 0;
        tribeTech[i] = new Set(); // Initialize with an empty Set for researched tech
    }
    console.log(`Created entities and initialized tribe states.`);
    displayPopulationAndTraits(); // Update function name for clarity
}

function spawnFood(count) {
     for (let i = 0; i < count; i++) {
        foodItems.push(new Food(
            Math.random() * (Config.canvasWidth - Config.foodSize),
            Math.random() * (Config.canvasHeight - Config.foodSize)
        ));
    }
}

function spawnResourceNodes(count) {
    for (let i = 0; i < count; i++) {
        resourceNodes.push(new ResourceNode(
            Math.random() * (Config.canvasWidth - Config.resourceNodeSize),
            Math.random() * (Config.canvasHeight - Config.resourceNodeSize)
        ));
    }
}

 // --- New: Tech Research Logic ---
function processResearch() {
    for (let i = 0; i < Config.numberOfTribes; i++) {
        if (!tribeTech[i]) continue; // Skip if tribe state doesn't exist

        const currentKnowledge = tribeKnowledge[i] || 0;
        const researched = tribeTech[i];

        // Iterate through available techs in the tree
        for (const techKey in Config.techTree) {
            const tech = Config.techTree[techKey];

            // Check if already researched
            if (researched.has(techKey)) continue;

            // Check prerequisites
            let prereqsMet = true;
            for (const prereq of tech.prereqs) {
                if (!researched.has(prereq)) {
                    prereqsMet = false;
                    break;
                }
            }
            if (!prereqsMet) continue;

            // Check cost (currently only knowledge)
            if (currentKnowledge >= tech.cost.knowledge) {
                // Research Complete!
                tribeKnowledge[i] -= tech.cost.knowledge; // Deduct cost
                tribeTech[i].add(techKey); // Add to researched set
                console.log(`Tribe ${i} researched ${tech.name}!`);
                // Break after researching one tech per tribe per cycle? Or allow multiple? Allow multiple for now.
            }
        }
    }
}

// --- Simple logic for tribe starting a build site ---
function checkInitiateBuild() {
    // Random check (same as before)
    if (Math.random() < 0.001 * Config.numberOfTribes) {
        const tribeId = Math.floor(Math.random() * Config.numberOfTribes);
        const researched = tribeTech[tribeId];

         // Decide what to build: Prioritize Shelter if unlocked and affordable?
         let buildType = 'Marker'; // Default
         let buildCost = { material: Config.markerCost };

         // Check if Shelter is unlocked and affordable
         if (researched?.has('BasicConstruction') && (tribeStockpiles[tribeId] || 0) >= Config.shelterCost.material) {
             // Simple logic: Maybe build Shelter sometimes? 50% chance if possible?
             if(Math.random() < 0.5) {
                 buildType = 'Shelter';
                 buildCost = Config.shelterCost;
             }
         }

         // Check resource cost for chosen type
         if ((tribeStockpiles[tribeId] || 0) >= (buildCost.material || 0)) {
              const pendingSites = structures.filter(s => s.tribeId === tribeId && !s.isComplete && s.type === buildType).length;
              if (pendingSites < (buildType === 'Shelter' ? 1 : 2)) { // Limit pending shelters more?
                  const spawnX = Math.random() * Config.canvasWidth;
                  const spawnY = Math.random() * Config.canvasHeight;

                  tribeStockpiles[tribeId] -= (buildCost.material || 0); // Consume cost
                  structures.push(new Structure(spawnX, spawnY, tribeId, buildType)); // Specify type
                  console.log(`Tribe ${tribeId} initiated a ${buildType} build site!`);
             }
         }
    }
}


// --- UI Display Function ---
function displayPopulationAndTraits() {
    // Clear previous text areas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; // Slightly darker background for text
    ctx.fillRect(5, 5, 200, 160); // Area for population and average traits

    if (creatures.length === 0) {
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`Population: 0 / ${Config.maxPopulation}`, 10, 20);
        return;
    };

    // Calculate averages
    let avgSpeed = 0, avgPerception = 0, avgSize = 0, avgAggression = 0, totalHealth = 0;
    // Calculate tribe counts
    let tribeCounts = new Array(Config.numberOfTribes).fill(0);
    let fightingCount = 0;

    for (const c of creatures) {
        avgSpeed += c.genes.speed;
        avgPerception += c.genes.perception;
        avgSize += c.genes.size;
        avgAggression += c.genes.aggression;
        totalHealth += c.health;
        if (c.tribeId >= 0 && c.tribeId < Config.numberOfTribes) {
            tribeCounts[c.tribeId]++;
        }
        if (c.targetEnemy && c.targetEnemy.isAlive) {
            fightingCount++;
        }
    }
    const count = creatures.length;
    avgSpeed /= count;
    avgPerception /= count;
    avgSize /= count;
    avgAggression /= count;
    const avgHealthPercent = (totalHealth / (count * Config.baseHealth)) * 100;

    // Display Text
    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Population: ${count} / ${Config.maxPopulation}`, 10, 20);

    ctx.font = '12px Arial';
    ctx.fillText(`Avg Speed: ${avgSpeed.toFixed(2)}`, 10, 35);
    ctx.fillText(`Avg Perception: ${avgPerception.toFixed(1)}`, 10, 50);
    ctx.fillText(`Avg Size: ${avgSize.toFixed(2)}`, 10, 65);
    ctx.fillText(`Avg Aggression: ${avgAggression.toFixed(2)}`, 10, 80);
    ctx.fillText(`Fighting: ${fightingCount}`, 10, 95);

    // Display tribe counts LABEL
    ctx.fillText(`Tribes:`, 10, 110);
    let tribeTextX = 55; // Start X position for tribe counts
    for (let i = 0; i < Config.numberOfTribes; i++) {
        const tribeColor = `hsl(${Config.tribeColors[i]}, 80%, 60%)`;
        ctx.fillStyle = tribeColor; // Use tribe color for the count
        ctx.fillText(`${tribeCounts[i]}`, tribeTextX, 110); // Y coordinate is 110 for tribe counts
        tribeTextX += ctx.measureText(`${tribeCounts[i]}`).width + 8; // Move X for next count
    }

    // Display Stockpiles LABEL
     ctx.fillStyle = 'white'; // Reset color to white for label
     ctx.font = '12px Arial';
     ctx.fillText(`Resources:`, 10, 125);

     // Display Stockpile amounts (This part was present)
     let resourceTextX = 75; // Align resource text
    for (let i = 0; i < Config.numberOfTribes; i++) {
        const tribeColor = `hsl(${Config.tribeColors[i]}, 80%, 60%)`;
        ctx.fillStyle = tribeColor; // Use tribe color for resource amount too
         const amount = tribeStockpiles[i] || 0;
         ctx.fillText(`${amount}`, resourceTextX, 125);
         resourceTextX += ctx.measureText(`${amount}`).width + 8;
    }
	
    // Display Knowledge
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.fillText(`Knowledge:`, 10, 140);
    let textX = 80; // Align text
    for (let i = 0; i < Config.numberOfTribes; i++) {
        const tribeColor = `hsl(${Config.tribeColors[i]}, 80%, 60%)`;
        ctx.fillStyle = tribeColor;
        const amount = Math.floor(tribeKnowledge[i] || 0); // Show whole numbers
        ctx.fillText(`${amount}`, textX, 140);
        textX += ctx.measureText(`${amount}`).width + 8;
    }
     // Display researched tech? Maybe just a simple indicator
     textX = 10;
     ctx.fillStyle = 'lightgray';
     ctx.fillText(`Tech:`, textX, 155);
     textX += 35;
     for (let i = 0; i < Config.numberOfTribes; i++) {
        if(tribeTech[i]?.has('BasicConstruction')) {
             const tribeColor = `hsl(${Config.tribeColors[i]}, 80%, 60%)`;
             ctx.fillStyle = tribeColor;
             ctx.fillText(`B`, textX, 155); // Simple 'B' for BasicConstruction
             textX += 12;
        }
    }
}


// --- Main Game Loop ---
let lastTime = 0;
function gameLoop(timestamp) {
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    // --- 0. Build Quadtrees ---
    creatureQuadTree.clear(); foodQuadTree.clear(); resourceQuadTree.clear();
	
	// Insert Creatures....
    for (const creature of creatures) {
        if (creature.isAlive) {
             // The library expects objects with x, y (top-left), width, height.
             // Create a temporary bounds object for insertion OR ensure creature has these.
             // Let's create a bounds object referencing the creature.
             const bounds = {
                 x: creature.x - creature.size / 2, // Calculate top-left x
                 y: creature.y - creature.size / 2, // Calculate top-left y
                 width: creature.size,
                 height: creature.size,
                 ref: creature // Store a reference back to the original creature object
             };
             creatureQuadTree.insert(bounds);
        }
    }
	
	// Insert Food....
    for (const food of foodItems) {
        // Food object already has x, y (top-left), width, height
        foodQuadTree.insert(food); // Can insert food directly
    }
	
	// Insert Resource Node...
    for (const node of resourceNodes) {
        if (!node.isEmpty()) { resourceQuadTree.insert(node); }
    }
	
    // --- 0.5 Process Research ---
    processResearch(); // Check if any tribe can research tech
	
    // --- Check for new build sites ---
    checkInitiateBuild();

	
    // --- 1. Apply Structure Effects ---
    // Needs optimization later (e.g., using a structure Quadtree or spatial grid)
    // For now, iterate through structures and query nearby creatures
    for (const struct of structures) {
        if (struct.isComplete && struct.type === 'Shelter') { // Only check completed shelters
             const effectBounds = {
                 x: struct.x - Config.shelterEffectRadius,
                 y: struct.y - Config.shelterEffectRadius,
                 width: Config.shelterEffectRadius * 2,
                 height: Config.shelterEffectRadius * 2
             };
             const nearbyCreatureBounds = creatureQuadTree.retrieve(effectBounds);
             const nearbyCreatures = nearbyCreatureBounds.map(b => b.ref); // Get actual creature objects
             struct.applyEffects(nearbyCreatures); // Apply effect to valid creatures in range
        }
    }
	
    // --- 2. Update Creatures ---
    const newOffspring = [];
    for (const creature of creatures) {
         // Pass Knowledge and Tech state to creature update
        const offspring = creature.update(deltaTime, foodQuadTree, creatureQuadTree, resourceQuadTree, structures, tribeStockpiles, tribeKnowledge, tribeTech);
        if (offspring) { newOffspring.push(offspring); }
    }
    creatures.push(...newOffspring);

    // --- 3. Interactions (Eating using Library Quadtree) ---
    const foodToRemove = []; // Store actual food objects to remove

    for (let i = creatures.length - 1; i >= 0; i--) { // Iterate backwards if modifying array during loop
        const creature = creatures[i];
        if (!creature.isAlive) continue;
		
        // Define the search area (Rectangle) for potential collision
        const searchRadius = creature.size; // Search a bit wider maybe
        const queryBounds = {
            x: creature.x - searchRadius,
            y: creature.y - searchRadius,
            width: searchRadius * 2,
            height: searchRadius * 2
        };

        // Query the food QuadTree
        const nearbyFoodObjects = foodQuadTree.retrieve(queryBounds);

        for (const food of nearbyFoodObjects) {
             // food is the actual Food object here

            // Precise check using creature's isNear method
            // Pass food's top-left x/y and width/height
            const interactionDistance = 2; // How close centers need to be

            if (creature.isNear(food.x, food.y, food.width, food.height, interactionDistance)) {
				
                // Avoid marking the same food multiple times
                if (!foodToRemove.includes(food)) {
                    creature.eat(food);
                    foodToRemove.push(food);
                    break; // Creature eats one food per frame
				}	
            }
        }
    }

    // Remove eaten food...
    if (foodToRemove.length > 0) {
        foodItems = foodItems.filter(food => !foodToRemove.includes(food));
        spawnFood(foodToRemove.length);
    }
    // --- 4. Update World ---	
    // Remove depleted resource nodes (optional: make them respawn later)
    resourceNodes = resourceNodes.filter(node => !node.isEmpty());
    // Maybe spawn new resource nodes occasionally?
     if (Math.random() < 0.005) spawnResourceNodes(1);
	 
	// Remove dead creatures (handles both starvation and combat deaths)
    creatures = creatures.filter(creature => creature.isAlive);
	
    // --- Population Cap ---
    if (creatures.length > Config.maxPopulation) {
        // Simple random cull
        creatures.sort(() => Math.random() - 0.5);
        creatures.splice(Config.maxPopulation); // Remove excess
    }

    // --- 5. Draw ---
    ctx.clearRect(0, 0, Config.canvasWidth, Config.canvasHeight);
    // Draw order: resources, structures, food, creatures
    for (const node of resourceNodes) { node.draw(ctx); }
    for (const struct of structures) { struct.draw(ctx); } // Draw structures
    for (const food of foodItems) { food.draw(ctx); }
    for (const creature of creatures) { creature.draw(ctx); }

    // --- UI Text ---
    displayPopulationAndTraits(); // Call the updated display function

    // --- 5. Next Frame ---
    requestAnimationFrame(gameLoop);
}

// --- Start Simulation ---
console.log("Evolution Sim Starting with Knowledge & Tech...");
canvas.width = Config.canvasWidth; // Set canvas size from config
canvas.height = Config.canvasHeight;
initializeWorld();
lastTime = performance.now();
requestAnimationFrame(gameLoop);