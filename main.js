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

// --- NEW: Influence Grid ---
let influenceGrid = [];
let gridWidth, gridHeight;

let creatureQuadTree, foodQuadTree, resourceQuadTree; 
let structureQuadTree;

// --- Helper: World to Grid Coords ---
function worldToGrid(x, y) {
    return {
        x: Math.max(0, Math.min(gridWidth - 1, Math.floor(x / Config.influenceCellSize))),
        y: Math.max(0, Math.min(gridHeight - 1, Math.floor(y / Config.influenceCellSize)))
    };
}

// --- Initialization ---
function initializeWorld() {
    console.log("Initializing world with Defenses...");
    creatures = []; foodItems = []; resourceNodes = []; structures = [];
    tribeStockpiles = {}; tribeKnowledge = {}; tribeTech = {}; // Reset all
	
	// --- NEW: Initialize Influence Grid ---
    gridWidth = Math.ceil(Config.canvasWidth / Config.influenceCellSize);
    gridHeight = Math.ceil(Config.canvasHeight / Config.influenceCellSize);
    influenceGrid = new Array(gridWidth);
    for (let i = 0; i < gridWidth; i++) {
        influenceGrid[i] = new Array(gridHeight);
        for (let j = 0; j < gridHeight; j++) {
            // Store influence per tribe temporarily, then resolve dominance
            influenceGrid[i][j] = {
                dominantTribe: -1, // -1 for neutral/none
                intensity: 0,
                // Temporary storage for accumulation during update phase
                tribeContributions: new Array(Config.numberOfTribes).fill(0)
            };
        }
    }
    console.log(`Influence Grid Initialized: ${gridWidth}x${gridHeight}`);
    
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
	structureQuadTree = new Quadtree(boundary, 6);

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
    // Logic to decide IF a tribe builds (random chance for now)
    if (Math.random() < 0.002 * Config.numberOfTribes) { // Slightly higher chance?
        const tribeId = Math.floor(Math.random() * Config.numberOfTribes);
        const researched = tribeTech[tribeId];
        const stockpile = tribeStockpiles[tribeId] || 0;

        if (!researched) return; // Safety check

        // --- Determine what to build ---
        let possibleBuilds = [];
        // Markers are always possible (if affordable)
        if (stockpile >= Config.markerCost) {
            possibleBuilds.push({ type: 'Marker', cost: { material: Config.markerCost } });
        }
        // Check unlocked structures
        if (researched.has('BasicConstruction')) {
            if (stockpile >= Config.shelterCost.material) {
                possibleBuilds.push({ type: 'Shelter', cost: Config.shelterCost });
            }
        }
        if (researched.has('BasicDefenses')) {
             if (stockpile >= Config.wallCost.material) {
                 possibleBuilds.push({ type: 'Wall', cost: Config.wallCost });
             }
             if (stockpile >= Config.towerCost.material) {
                 possibleBuilds.push({ type: 'Tower', cost: Config.towerCost });
             }
        }

        if (possibleBuilds.length > 0) {
            // --- Choose randomly from possible builds ---
            // TODO: Could add smarter weighting later (e.g., need shelter? build shelter)
            const choice = possibleBuilds[Math.floor(Math.random() * possibleBuilds.length)];
            const buildType = choice.type;
            const buildCost = choice.cost;

            // --- Limit number of pending sites (optional refinement) ---
            // const pendingSites = structures.filter(s => s.tribeId === tribeId && !s.isComplete && s.type === buildType).length;
            // let maxPending = 2;
            // if (buildType === 'Shelter') maxPending = 1;
            // if (buildType === 'Tower') maxPending = 1;
            // if (pendingSites >= maxPending) return; // Don't start too many at once

            // --- Place the build site ---
            // TODO: Smarter placement? Near existing structures? For walls, adjacent?
            const spawnX = Math.random() * Config.canvasWidth;
            const spawnY = Math.random() * Config.canvasHeight;

            tribeStockpiles[tribeId] -= (buildCost.material || 0); // Consume cost
            structures.push(new Structure(spawnX, spawnY, tribeId, buildType));
            console.log(`Tribe ${tribeId} initiated a ${buildType} build site! Cost: ${buildCost.material}`);
        }
    }
}
// --- NEW: Influence Grid Update Logic ---
function updateInfluenceGrid() {
    // --- 1. Decay and Reset Contributions ---
    for (let gx = 0; gx < gridWidth; gx++) {
        for (let gy = 0; gy < gridHeight; gy++) {
            const cell = influenceGrid[gx][gy];
            // Apply decay
            cell.intensity *= Config.influenceDecayRate;
            if (cell.intensity < 0.1) { // Threshold to reset completely
                cell.intensity = 0;
                cell.dominantTribe = -1;
            }
            // Reset contributions for this frame
            cell.tribeContributions.fill(0);
        }
    }
  // --- 2. Generate Influence from Creatures ---
    for (const creature of creatures) {
        if (!creature.isAlive) continue;
        const tribeId = creature.tribeId;
        const radius = Config.creatureInfluenceRadius;
        const rate = Config.creatureInfluenceRate;
        const radiusSq = radius * radius;
        const centerGx = creature.x / Config.influenceCellSize;
        const centerGy = creature.y / Config.influenceCellSize;
        const gridRadius = Math.ceil(radius / Config.influenceCellSize);

        // Iterate over grid cells within the bounding box of the radius
        for (let gx = Math.max(0, Math.floor(centerGx - gridRadius)); gx <= Math.min(gridWidth - 1, Math.ceil(centerGx + gridRadius)); gx++) {
            for (let gy = Math.max(0, Math.floor(centerGy - gridRadius)); gy <= Math.min(gridHeight - 1, Math.ceil(centerGy + gridRadius)); gy++) {
                // Calculate distance from cell center to creature center
                const cellCenterX = (gx + 0.5) * Config.influenceCellSize;
                const cellCenterY = (gy + 0.5) * Config.influenceCellSize;
                const dx = cellCenterX - creature.x;
                const dy = cellCenterY - creature.y;
                const distSq = dx * dx + dy * dy;

                if (distSq < radiusSq) {
                    // Linear falloff (can be adjusted)
                    const falloff = 1 - (Math.sqrt(distSq) / radius);
                    const contribution = rate * falloff;
                    if (contribution > 0) {
                         influenceGrid[gx][gy].tribeContributions[tribeId] += contribution;
                    }
                }
            }
        }
    }

    // --- 3. Generate Influence from Structures ---
    for (const struct of structures) {
        if (!struct.isComplete) continue; // Only completed structures generate
        const tribeId = struct.tribeId;
        let radius = 0;
        let rate = 0;

        switch (struct.type) {
            case 'Marker':
                radius = Config.markerInfluenceRadius;
                rate = Config.markerInfluenceRate;
                break;
            case 'Shelter':
                radius = Config.shelterInfluenceRadius;
                rate = Config.shelterInfluenceRate;
                break;
            // Add other structure types here if they generate influence
        }

        if (radius > 0 && rate > 0) {
             const radiusSq = radius * radius;
             const centerGx = struct.x / Config.influenceCellSize;
             const centerGy = struct.y / Config.influenceCellSize;
             const gridRadius = Math.ceil(radius / Config.influenceCellSize);

             for (let gx = Math.max(0, Math.floor(centerGx - gridRadius)); gx <= Math.min(gridWidth - 1, Math.ceil(centerGx + gridRadius)); gx++) {
                for (let gy = Math.max(0, Math.floor(centerGy - gridRadius)); gy <= Math.min(gridHeight - 1, Math.ceil(centerGy + gridRadius)); gy++) {
                    const cellCenterX = (gx + 0.5) * Config.influenceCellSize;
                    const cellCenterY = (gy + 0.5) * Config.influenceCellSize;
                    const dx = cellCenterX - struct.x;
                    const dy = cellCenterY - struct.y;
                    const distSq = dx * dx + dy * dy;

                    if (distSq < radiusSq) {
                        const falloff = 1 - (Math.sqrt(distSq) / radius);
                        const contribution = rate * falloff;
                         if (contribution > 0) {
                            influenceGrid[gx][gy].tribeContributions[tribeId] += contribution;
                         }
                    }
                }
            }
        }
    }

    // --- 4. Resolve Dominance and Update Intensity ---
    for (let gx = 0; gx < gridWidth; gx++) {
        for (let gy = 0; gy < gridHeight; gy++) {
            const cell = influenceGrid[gx][gy];
            let maxContribution = 0;
            let dominantTribeThisFrame = -1;
            let totalContribution = 0;

            for (let tribe = 0; tribe < Config.numberOfTribes; tribe++) {
                totalContribution += cell.tribeContributions[tribe];
                if (cell.tribeContributions[tribe] > maxContribution) {
                    maxContribution = cell.tribeContributions[tribe];
                    dominantTribeThisFrame = tribe;
                }
                // Simple tie-breaking: lower tribe ID wins (can be randomized or based on previous owner)
            }

            if (dominantTribeThisFrame !== -1) {
                // If a new tribe is dominant or the same tribe reinforced, update
                if (dominantTribeThisFrame !== cell.dominantTribe) {
                     cell.dominantTribe = dominantTribeThisFrame;
                     // Reset intensity slightly when territory flips? Or just add? Let's just add.
                     cell.intensity += totalContribution; // Add total contribution of *all* tribes this frame? Or just winner? Let's try just winner's.
                     //cell.intensity += maxContribution;
                } else {
                    // If same tribe is dominant, just add their contribution
                    cell.intensity += maxContribution;
                }
                // Add total seems more dynamic for contested areas
                 cell.intensity += totalContribution * 0.5; // Compromise: add weighted total

                cell.intensity = Math.min(cell.intensity, Config.maxInfluence); // Clamp max intensity

            } else {
                 // If no contributions this frame, intensity just decays (handled in step 1)
                 // If intensity decayed to zero, dominantTribe was already reset
            }
        }
    }
}


// --- NEW: Influence Grid Drawing Logic ---
function drawInfluenceGrid(ctx) {
    const cellSize = Config.influenceCellSize;
    for (let gx = 0; gx < gridWidth; gx++) {
        for (let gy = 0; gy < gridHeight; gy++) {
            const cell = influenceGrid[gx][gy];
            if (cell.dominantTribe !== -1 && cell.intensity > 1) { // Only draw if influence exists
                const tribeHue = Config.tribeColors[cell.dominantTribe];
                // Map intensity to alpha (make it more visible at lower levels)
                const alpha = Math.min(Config.influenceColorAlphaMax, (cell.intensity / Config.maxInfluence) * Config.influenceColorAlphaMax * 1.5); // Adjusted curve
                ctx.fillStyle = `hsla(${tribeHue}, 70%, 50%, ${alpha})`;
                ctx.fillRect(gx * cellSize, gy * cellSize, cellSize, cellSize);
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
    creatureQuadTree.clear(); foodQuadTree.clear(); resourceQuadTree.clear(); structureQuadTree.clear();
	
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
	
	// --- NEW: 0.6 Update Influence Grid ---
    updateInfluenceGrid(); // Calculate influence BEFORE creature updates
	
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
        const offspring = creature.update(deltaTime, foodQuadTree, creatureQuadTree, resourceQuadTree, structures, tribeStockpiles, tribeKnowledge, tribeTech, influenceGrid);
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
	
	// --- NEW: Draw Influence Layer FIRST ---
    drawInfluenceGrid(ctx);
	
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
console.log("Evolution Sim Starting with Influence...");
canvas.width = Config.canvasWidth; // Set canvas size from config
canvas.height = Config.canvasHeight;
initializeWorld();
lastTime = performance.now();
requestAnimationFrame(gameLoop);