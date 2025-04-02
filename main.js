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
let creatureQuadTree, foodQuadTree, resourceQuadTree, structureQuadTree; 

// --- NEW: Dynamic Simulation State ---
// Initialized from config, but can be changed by UI
let simState = {
    mutationRate: Config.mutationRate,
    mutationAmount: Config.mutationAmount,
    baseAggression: Config.baseAggression, // Base value for new creatures
    researchSpeedMultiplier: Config.researchSpeedMultiplier,
    foodSpawnRate: Config.startingFoodCount, // Control initial/respawn count
    maxPopulation: Config.maxPopulation,
    gameSpeed: 1.0,
    isPaused: false,
    // Add other parameters here as needed (e.g., climate stability, disaster freq)
};

// --- UI Element References ---
const uiElements = {
    mutationRateSlider: document.getElementById('mutationRate'),
    mutationRateValue: document.getElementById('mutationRateValue'),
    mutationAmountSlider: document.getElementById('mutationAmount'),
    mutationAmountValue: document.getElementById('mutationAmountValue'),
    baseAggressionSlider: document.getElementById('baseAggression'),
    baseAggressionValue: document.getElementById('baseAggressionValue'),
    researchSpeedSlider: document.getElementById('researchSpeed'),
    researchSpeedValue: document.getElementById('researchSpeedValue'),
    foodSpawnRateSlider: document.getElementById('foodSpawnRate'),
    foodSpawnRateValue: document.getElementById('foodSpawnRateValue'),
    maxPopulationSlider: document.getElementById('maxPopulation'),
    maxPopulationValue: document.getElementById('maxPopulationValue'),
    gameSpeedSlider: document.getElementById('gameSpeed'),
    gameSpeedValue: document.getElementById('gameSpeedValue'),
    pauseButton: document.getElementById('pauseButton'),
};

// --- UI Event Listeners ---
function setupUIListeners() {
    // Mutation Rate
    uiElements.mutationRateSlider.addEventListener('input', (e) => {
        simState.mutationRate = parseFloat(e.target.value);
        uiElements.mutationRateValue.textContent = simState.mutationRate.toFixed(2);
        // Pass this value to Creature's mutate function if needed dynamically
    });
    // Mutation Amount
    uiElements.mutationAmountSlider.addEventListener('input', (e) => {
        simState.mutationAmount = parseFloat(e.target.value);
        uiElements.mutationAmountValue.textContent = simState.mutationAmount.toFixed(2);
        // Pass this value to Creature's mutate function if needed dynamically
    });
     // Base Aggression (Affects NEW creatures, might not change existing ones easily)
     uiElements.baseAggressionSlider.addEventListener('input', (e) => {
         simState.baseAggression = parseFloat(e.target.value);
         uiElements.baseAggressionValue.textContent = simState.baseAggression.toFixed(2);
         // This primarily influences the initial aggression in creature constructor
     });
    // Research Speed
    uiElements.researchSpeedSlider.addEventListener('input', (e) => {
        simState.researchSpeedMultiplier = parseFloat(e.target.value);
        uiElements.researchSpeedValue.textContent = `${simState.researchSpeedMultiplier.toFixed(1)}x`;
    });
    // Food Spawn Rate (Controls how many food items exist)
    uiElements.foodSpawnRateSlider.addEventListener('input', (e) => {
        simState.foodSpawnRate = parseInt(e.target.value);
        uiElements.foodSpawnRateValue.textContent = simState.foodSpawnRate;
        // Adjust current food count immediately? Or just affect respawn rate?
        // Let's adjust current count for simplicity now.
        let diff = simState.foodSpawnRate - foodItems.length;
        if (diff > 0) spawnFood(diff);
        else if (diff < 0) foodItems.splice(0, -diff); // Remove excess
    });
    // Max Population
    uiElements.maxPopulationSlider.addEventListener('input', (e) => {
        simState.maxPopulation = parseInt(e.target.value);
        uiElements.maxPopulationValue.textContent = simState.maxPopulation;
        // Population cap logic in main loop will use this value
    });
    // Game Speed
    uiElements.gameSpeedSlider.addEventListener('input', (e) => {
        simState.gameSpeed = parseFloat(e.target.value);
        uiElements.gameSpeedValue.textContent = `${simState.gameSpeed.toFixed(1)}x`;
        if (simState.gameSpeed === 0) {
             simState.isPaused = true;
             uiElements.pauseButton.textContent = 'Resume';
             uiElements.pauseButton.classList.add('active');
        } else {
             simState.isPaused = false;
             uiElements.pauseButton.textContent = 'Pause';
             uiElements.pauseButton.classList.remove('active');
        }
    });
    // Pause Button
    uiElements.pauseButton.addEventListener('click', () => {
        simState.isPaused = !simState.isPaused;
        if (simState.isPaused) {
             uiElements.gameSpeedSlider.value = 0; // Set slider to 0 visually
             simState.gameSpeed = 0;
             uiElements.gameSpeedValue.textContent = '0.0x';
             uiElements.pauseButton.textContent = 'Resume';
             uiElements.pauseButton.classList.add('active');
        } else {
             simState.gameSpeed = parseFloat(uiElements.gameSpeedSlider.value) || 1.0; // Restore slider value or default to 1
             if(simState.gameSpeed === 0) simState.gameSpeed = 1.0; // Ensure not stuck at 0 if slider was 0
             uiElements.gameSpeedSlider.value = simState.gameSpeed;
             uiElements.gameSpeedValue.textContent = `${simState.gameSpeed.toFixed(1)}x`;
             uiElements.pauseButton.textContent = 'Pause';
             uiElements.pauseButton.classList.remove('active');
        }
    });

    // Initial setup of values
    uiElements.mutationRateSlider.value = simState.mutationRate;
    uiElements.mutationRateValue.textContent = simState.mutationRate.toFixed(2);
    uiElements.mutationAmountSlider.value = simState.mutationAmount;
    uiElements.mutationAmountValue.textContent = simState.mutationAmount.toFixed(2);
    uiElements.baseAggressionSlider.value = simState.baseAggression;
    uiElements.baseAggressionValue.textContent = simState.baseAggression.toFixed(2);
    uiElements.researchSpeedSlider.value = simState.researchSpeedMultiplier;
    uiElements.researchSpeedValue.textContent = `${simState.researchSpeedMultiplier.toFixed(1)}x`;
    uiElements.foodSpawnRateSlider.value = simState.foodSpawnRate;
    uiElements.foodSpawnRateValue.textContent = simState.foodSpawnRate;
    uiElements.maxPopulationSlider.value = simState.maxPopulation;
    uiElements.maxPopulationValue.textContent = simState.maxPopulation;
    uiElements.gameSpeedSlider.value = simState.gameSpeed;
    uiElements.gameSpeedValue.textContent = `${simState.gameSpeed.toFixed(1)}x`;
}


// --- Initialization ---
function initializeWorld() {
    console.log("Initializing world with UI controls...");
    creatures = []; foodItems = []; resourceNodes = []; structures = [];
    tribeStockpiles = {}; tribeKnowledge = {}; tribeTech = {}; // Reset all
	
    // Define the boundary for the Quadtree library { x, y, width, height }
    const boundary = {
        x: 0,
        y: 0,
        width: Config.canvasWidth,
        height: Config.canvasHeight
    };
	
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
	
    setupUIListeners(); // Setup listeners after elements exist
    //console.log(`Created entities and initialized tribe states.`);
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
         // Use simState for speed multiplier in passive gain
         tribeKnowledge[i] = (tribeKnowledge[i] || 0) + Config.knowledgePerCreatureTick * simState.researchSpeedMultiplier * creatures.filter(c => c.tribeId === i).length; // Multiply by tribe pop?

         // ... rest of research logic using tribeKnowledge[i] ...
        const currentKnowledge = tribeKnowledge[i]; /* ... check costs ... */
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

// --- Logic for tribe starting a build site ---
function checkInitiateBuild() {
    // Random check trigger
    if (Math.random() < 0.0015 * Config.numberOfTribes) {
        const tribeId = Math.floor(Math.random() * Config.numberOfTribes);
        const researched = tribeTech[tribeId];
        const stockpile = tribeStockpiles[tribeId] || 0;

        // --- Block 1: Determine all possible builds ---
        let possibleBuilds = [];
        // Check Marker
        if (stockpile >= Config.markerCost.material) {
             possibleBuilds.push({ type: 'Marker', cost: Config.markerCost });
        }
        // Check Shelter
        if (researched?.has('BasicConstruction') && stockpile >= Config.shelterCost.material) {
            possibleBuilds.push({ type: 'Shelter', cost: Config.shelterCost });
        }
        // Check Farm
        if (researched?.has('Agriculture') && stockpile >= Config.farmCost.material) {
            possibleBuilds.push({ type: 'Farm', cost: Config.farmCost });
        }
         // Check Defenses
        if (researched?.has('BasicDefenses')) {
            if (stockpile >= Config.wallCost.material) possibleBuilds.push({ type: 'Wall', cost: Config.wallCost });
            if (stockpile >= Config.towerCost.material) possibleBuilds.push({ type: 'GuardTower', cost: Config.towerCost });
        }
		
        // --- Action based on possible builds ---
        if (possibleBuilds.length > 0) {
            // Choose one build randomly from the possible options
            const buildChoice = possibleBuilds[Math.floor(Math.random() * possibleBuilds.length)];
            const buildType = buildChoice.type;
            const buildCost = buildChoice.cost;

            // Limit pending sites for the chosen type
             const pendingSites = structures.filter(s => s.tribeId === tribeId && !s.isComplete && s.type === buildChoice.type).length;
            let limit = (buildChoice.type === 'Wall') ? 5 : 2; // Allow more pending walls?
            if (buildChoice.type === 'Shelter' || buildChoice.type === 'Farm' || buildChoice.type === 'GuardTower') limit = 1;

            if (pendingSites < limit && stockpile >= (buildChoice.cost.material || 0)) {
                tribeStockpiles[tribeId] -= (buildChoice.cost.material || 0);
                structures.push(new Structure( // Add structure ONCE
                    Math.random() * Config.canvasWidth,
                    Math.random() * Config.canvasHeight,
                    tribeId,
                    buildChoice.type
                ));
                console.log(`Tribe ${tribeId} initiated a ${buildChoice.type} build site!`);
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
     textX = 10; // Reset X for Tech line
     ctx.fillStyle = 'lightgray';
     ctx.fillText(`Tech:`, textX, 155);
     textX += 35;
     for (let i = 0; i < Config.numberOfTribes; i++) {
        if(tribeTech[i]) {
             let techString = '';
             if(tribeTech[i].has('BasicConstruction')) techString += 'B';
             if(tribeTech[i].has('Agriculture')) techString += 'A'; // Add 'A' for Agriculture
             if(tribeTech[i].has('BasicDefenses')) techString += 'D'; // 'D' for Defenses

             if(techString.length > 0) {
                 const tribeColor = `hsl(${Config.tribeColors[i]}, 80%, 60%)`;
                 ctx.fillStyle = tribeColor;
                 ctx.fillText(techString, textX, 155);
                 textX += ctx.measureText(techString).width + 6;
             }
        }
    }
}


// --- Main Game Loop ---
let lastTime = 0;
function gameLoop(timestamp) {
    const rawDeltaTime = timestamp - lastTime;
    lastTime = timestamp;
    const deltaTime = simState.isPaused ? 0 : rawDeltaTime * simState.gameSpeed;
    // Only run updates if not paused and time has passed
	if (deltaTime > 0) {	
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
		
		// Insert Structures...
		for (const struct of structures) {
			// Insert based on center point for query, or actual bounds? Let's use bounds.
			const bounds = {
				x: struct.x - struct.size / 2,
				y: struct.y - struct.size / 2,
				width: struct.size,
				height: struct.size,
				ref: struct
			};
			structureQuadTree.insert(bounds);
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
			struct.updateStructure(deltaTime, creatureQuadTree);
		}
	
// --- 2. Update Creatures ---
const newOffspring = [];
for (const creature of creatures) {
			// 1. Calculate Intended Movement: Call creature update first
			const offspring = creature.update(deltaTime, foodQuadTree, creatureQuadTree, resourceQuadTree, structures, tribeStockpiles, tribeKnowledge, tribeTech, simState);
			if (offspring) { newOffspring.push(offspring); }
		
			// 2. Store Intended Movement (dx/dy were set by creature.update)
			let intendedDX = creature.dx;
			let intendedDY = creature.dy;
			let finalDX = intendedDX;
			let finalDY = intendedDY;
		
			// 3. Check Collision against Walls using *intended* movement
			let blocked = false; // Declare only ONCE
			if (intendedDX !== 0 || intendedDY !== 0) { // Only check collision if trying to move
				let intendedX = creature.x + intendedDX; // Where it WANTS to go (Declare ONCE)
				let intendedY = creature.y + intendedDY; // Declare ONCE
		
				// Query structure quadtree for potential walls nearby based on intended position
				const collisionCheckRadius = creature.size * 1.5;
				const queryBounds = {
					x: intendedX - collisionCheckRadius / 2,
					y: intendedY - collisionCheckRadius / 2,
					width: collisionCheckRadius, height: collisionCheckRadius
				};
				const nearbyStructureBounds = structureQuadTree.retrieve(queryBounds);
		
				for (const bounds of nearbyStructureBounds) {
					const struct = bounds.ref;
					if (struct.isComplete && struct.type === 'Wall') {
						// AABB collision check (Your existing AABB logic is correct here)
						const creatureLeft = intendedX - creature.size / 2;
						const creatureRight = intendedX + creature.size / 2;
						const creatureTop = intendedY - creature.size / 2;
						const creatureBottom = intendedY + creature.size / 2;
		
						const wallLeft = struct.x - struct.size / 2;
						const wallRight = struct.x + struct.size / 2;
						const wallTop = struct.y - struct.size / 2;
						const wallBottom = struct.y + struct.size / 2;
		
						if (creatureRight > wallLeft && creatureLeft < wallRight && creatureBottom > wallTop && creatureTop < wallBottom) {
							blocked = true;
							break; // Found a collision, stop checking
						}
					}
				}
			}
		
			// 4. Determine Final Movement
			if (blocked) {
				finalDX = 0; // Prevent movement if blocked
				finalDY = 0;
				// Optional: Reset creature's internal dx/dy if needed for next frame's logic?
				// creature.dx = 0;
				// creature.dy = 0;
			}
		
			// 5. Apply Final Movement to Position
			creature.x += finalDX;
			creature.y += finalDY;
		
			// 6. Apply Boundary Wrapping
			if (creature.x < 0) creature.x = Config.canvasWidth;
			if (creature.x > Config.canvasWidth) creature.x = 0;
			if (creature.y < 0) creature.y = Config.canvasHeight;
			if (creature.y > Config.canvasHeight) creature.y = 0;
		
		} // End of creature loop
		
		creatures.push(...newOffspring); // Add offspring outside the loop
		
		// --- Handle Structure Resource Generation ---
		let generatedResources = [];
		for (const struct of structures) {
			// Call generateResources (passing references if needed - foodItems here)
			const result = struct.generateResources(foodItems, tribeStockpiles);
			if (result) {
				generatedResources.push(result);
			}
		}
		// Process generated resources (spawn food from farms)
		for (const res of generatedResources) {
			if (res.type === 'food') {
				const newFood = new Food(res.x, res.y); // Create food at farm's specified location
				foodItems.push(newFood);
				// No need to insert into quadtree here, it's rebuilt next frame
			}
		}
		
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
				const foodCenterX = food.x + food.width / 2;
				const foodCenterY = food.y + food.height / 2;
				const dx = creature.x - foodCenterX;
				const dy = creature.y - foodCenterY;
				const distanceSq = dx * dx + dy * dy;
				// Check if distance is less than sum of radii squared
				const radiiSum = creature.size / 2 + food.size / 2;
				const requiredDistSq = radiiSum * radiiSum;
	
				// *** USE THIS FIXED CHECK ***
				if (distanceSq <= requiredDistSq) {
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
		// Remove destroyed structures
		structures = structures.filter(s => s.health > 0 || !s.isComplete); //
		// Remove depleted resource nodes (optional: make them respawn later)
		
		resourceNodes = resourceNodes.filter(node => !node.isEmpty());	
		if (Math.random() < 0.005) spawnResourceNodes(1);
		creatures = creatures.filter(creature => creature.isAlive);
		
		// --- Population Cap ---
		if (creatures.length > Config.maxPopulation) {
			// Simple random cull
			creatures.sort(() => Math.random() - 0.5);
			creatures.splice(Config.maxPopulation); // Remove excess
		}
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
//console.log("Evolution Sim Starting with Knowledge & Tech...");
canvas.width = Config.canvasWidth; // Set canvas size from config
canvas.height = Config.canvasHeight;
initializeWorld();
lastTime = performance.now();
requestAnimationFrame(gameLoop);