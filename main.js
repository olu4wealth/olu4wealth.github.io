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
    });
    // Mutation Amount
    uiElements.mutationAmountSlider.addEventListener('input', (e) => {
        simState.mutationAmount = parseFloat(e.target.value);
        uiElements.mutationAmountValue.textContent = simState.mutationAmount.toFixed(2);
    });
     // Base Aggression
     uiElements.baseAggressionSlider.addEventListener('input', (e) => {
         simState.baseAggression = parseFloat(e.target.value);
         uiElements.baseAggressionValue.textContent = simState.baseAggression.toFixed(2);
     });
    // Research Speed
    uiElements.researchSpeedSlider.addEventListener('input', (e) => {
        simState.researchSpeedMultiplier = parseFloat(e.target.value);
        uiElements.researchSpeedValue.textContent = `${simState.researchSpeedMultiplier.toFixed(1)}x`;
    });
    // Food Spawn Rate
    uiElements.foodSpawnRateSlider.addEventListener('input', (e) => {
        simState.foodSpawnRate = parseInt(e.target.value);
        uiElements.foodSpawnRateValue.textContent = simState.foodSpawnRate;
        let diff = simState.foodSpawnRate - foodItems.length;
        if (diff > 0) spawnFood(diff);
        else if (diff < 0) foodItems.splice(0, -diff); // Remove excess
    });
    // Max Population
    uiElements.maxPopulationSlider.addEventListener('input', (e) => {
        simState.maxPopulation = parseInt(e.target.value);
        uiElements.maxPopulationValue.textContent = simState.maxPopulation;
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
    creatureQuadTree = new Quadtree(boundary, Config.quadtreeCapacity);
	foodQuadTree = new Quadtree(boundary, Config.foodQuadtreeCapacity);
    resourceQuadTree = new Quadtree(boundary, 10); // Capacity for resources
    structureQuadTree = new Quadtree(boundary, 6);

	// Initial creatures are assigned random tribes inside the constructor now
    for (let i = 0; i < Config.startingCreatureCount; i++) {
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

// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// +++ NEW HELPER FUNCTION TO GET STRUCTURE SIZE FROM CONFIG +++
// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
function getStructureSize(type) {
    switch(type) {
        case 'Shelter': return Config.shelterSize;
        case 'Farm': return Config.farmSize;
        case 'Wall': return Config.wallSegmentSize;
        case 'GuardTower': return Config.towerSize;
        case 'Marker': // Fall through to default
        default:
            // Use the size defined in the Structure class constructor for Marker as default
            // This avoids needing a separate markerSize in config if it matches Structure.js
            return 15;
    }
}
// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

 // --- New: Tech Research Logic ---
function processResearch() {
    for (let i = 0; i < Config.numberOfTribes; i++) {
        if (!tribeTech[i]) continue; // Skip if tribe state doesn't exist

         tribeKnowledge[i] = (tribeKnowledge[i] || 0) + Config.knowledgePerCreatureTick * simState.researchSpeedMultiplier * creatures.filter(c => c.tribeId === i).length;

        const currentKnowledge = tribeKnowledge[i];
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
            }
        }
    }
}

// --- Logic for tribe starting a build site ---
// --- REVISED checkInitiateBuild Function ---
function checkInitiateBuild() {
    // Random check trigger - slightly increased frequency maybe?
    if (Math.random() < 0.0025 * Config.numberOfTribes) {
        const tribeId = Math.floor(Math.random() * Config.numberOfTribes);
        if (!tribeTech[tribeId]) return; // Ensure tribe exists

        const researched = tribeTech[tribeId];
        const stockpile = tribeStockpiles[tribeId] || 0;

        // Determine all possible builds based on tech and cost
        let possibleBuilds = [];
        if (stockpile >= Config.markerCost.material) {
            possibleBuilds.push({ type: 'Marker', cost: Config.markerCost });
        }
        if (researched?.has('BasicConstruction') && stockpile >= Config.shelterCost.material) {
            possibleBuilds.push({ type: 'Shelter', cost: Config.shelterCost });
        }
        if (researched?.has('Agriculture') && stockpile >= Config.farmCost.material) {
            possibleBuilds.push({ type: 'Farm', cost: Config.farmCost });
        }
        if (researched?.has('BasicDefenses')) {
            if (stockpile >= Config.wallCost.material) possibleBuilds.push({ type: 'Wall', cost: Config.wallCost });
            // Correct check for tower cost (material only here, knowledge checked during research)
            if (stockpile >= Config.towerCost.material) possibleBuilds.push({ type: 'GuardTower', cost: Config.towerCost });
        }

        if (possibleBuilds.length === 0) return; // Nothing can be built

        // Choose one build randomly from the possible options
        const buildChoice = possibleBuilds[Math.floor(Math.random() * possibleBuilds.length)];
        const buildType = buildChoice.type;
        const buildCost = buildChoice.cost;
        const structureSize = getStructureSize(buildType); // <<< USE THE NEW HELPER FUNCTION

        // Limit pending sites for the chosen type
        const pendingSites = structures.filter(s => s.tribeId === tribeId && !s.isComplete && s.type === buildType).length;
        let limit = (buildType === 'Wall') ? 5 : 2; // Allow more pending walls
        if (buildType === 'Shelter' || buildType === 'Farm' || buildType === 'GuardTower') limit = 1; // Only one core building at a time

        // Check if limit reached and enough material in stockpile
        if (pendingSites < limit && stockpile >= (buildCost.material || 0)) {
            let placed = false;
            let buildX = 0;
            let buildY = 0;
            const maxPlacementTries = 25; // More tries to find a spot
            const minPlacementDistFactor = 1.05; // Ensure slight gap between structures (factor of summed radii)

            // --- Smarter Placement Attempt ---
            // 1. Find potential anchor structures (completed Markers/Shelters of the same tribe)
            const potentialAnchorsBounds = structureQuadTree.retrieve({ x: 0, y: 0, width: Config.canvasWidth, height: Config.canvasHeight });
            const friendlyAnchors = potentialAnchorsBounds
                .map(b => b.ref) // Get structure objects from bounds references
                .filter(s => s.isComplete && s.tribeId === tribeId && (s.type === 'Marker' || s.type === 'Shelter'));

            if (friendlyAnchors.length > 0) {
                // Try placing near a random anchor
                for (let tryNum = 0; tryNum < maxPlacementTries && !placed; tryNum++) {
                    const anchor = friendlyAnchors[Math.floor(Math.random() * friendlyAnchors.length)];
                    // Place slightly further out than direct contact, with some randomness
                    const placementRadius = (anchor.size / 2) + (structureSize / 2) + 5 + (Math.random() * 40); // Increased max random offset
                    const angle = Math.random() * Math.PI * 2;
                    let tryX = anchor.x + Math.cos(angle) * placementRadius;
                    let tryY = anchor.y + Math.sin(angle) * placementRadius;

                    // Boundary Check (Ensure center stays within canvas)
                    tryX = Math.max(structureSize / 2, Math.min(Config.canvasWidth - structureSize / 2, tryX));
                    tryY = Math.max(structureSize / 2, Math.min(Config.canvasHeight - structureSize / 2, tryY));

                    // Collision Check against ALL structures nearby
                    const queryBounds = { // Query a slightly larger area around the potential spot
                        x: tryX - structureSize,
                        y: tryY - structureSize,
                        width: structureSize * 2,
                        height: structureSize * 2
                    };
                    const nearbyStructuresBounds = structureQuadTree.retrieve(queryBounds);
                    let overlaps = false;
                    for (const bounds of nearbyStructuresBounds) {
                        const existingStruct = bounds.ref;
                        const distSq = (existingStruct.x - tryX)**2 + (existingStruct.y - tryY)**2;
                        // Check if distance squared is less than squared sum of radii * factor
                        const requiredDistSq = ((existingStruct.size / 2) + (structureSize / 2))**2 * (minPlacementDistFactor**2);
                        if (distSq < requiredDistSq) {
                            overlaps = true;
                            break; // Overlaps, stop checking this spot
                        }
                    }

                    if (!overlaps) {
                        buildX = tryX;
                        buildY = tryY;
                        placed = true; // Found a non-overlapping spot!
                    }
                } // End anchor placement tries loop
            }

            // --- Fallback: If no anchor or placement near anchor failed, try random placement ---
            if (!placed) {
                 for (let tryNum = 0; tryNum < maxPlacementTries && !placed; tryNum++) {
                    // Random position within bounds
                    let tryX = Math.random() * (Config.canvasWidth - structureSize) + structureSize / 2;
                    let tryY = Math.random() * (Config.canvasHeight - structureSize) + structureSize / 2;

                    // Collision Check (same logic as above)
                    const queryBounds = {
                        x: tryX - structureSize, y: tryY - structureSize,
                        width: structureSize * 2, height: structureSize * 2
                    };
                    const nearbyStructuresBounds = structureQuadTree.retrieve(queryBounds);
                    let overlaps = false;
                    for (const bounds of nearbyStructuresBounds) {
                        const existingStruct = bounds.ref;
                        const distSq = (existingStruct.x - tryX)**2 + (existingStruct.y - tryY)**2;
                        const requiredDistSq = ((existingStruct.size / 2) + (structureSize / 2))**2 * (minPlacementDistFactor**2);
                        if (distSq < requiredDistSq) {
                            overlaps = true;
                            break;
                        }
                    }
                    if (!overlaps) {
                        buildX = tryX;
                        buildY = tryY;
                        placed = true; // Found a random non-overlapping spot
                    }
                } // End random placement tries
            }

            // --- Final Action: If a spot was found (either near anchor or random), create the structure ---
            if (placed) {
                // Deduct cost ONLY if placed successfully
                tribeStockpiles[tribeId] -= (buildCost.material || 0);

                // Create the new structure using the CALCULATED coordinates
                structures.push(new Structure(
                    buildX,
                    buildY,
                    tribeId,
                    buildType
                ));
                console.log(`Tribe ${tribeId} initiated a ${buildType} build site at (${buildX.toFixed(0)}, ${buildY.toFixed(0)})!`);
            } else {
                // Optional: Log if placement completely failed after all tries
                // console.log(`Tribe ${tribeId} failed to find valid placement for ${buildType} after ${maxPlacementTries} tries.`);
                // Do NOT deduct cost if not placed
            }
        } // End if pendingSites < limit && stockpile >= cost
    } // End if Math.random() check
}
// --- END OF REVISED checkInitiateBuild ---


// --- UI Display Function ---
function displayPopulationAndTraits() {
    // Clear previous text areas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; // Slightly darker background for text
    ctx.fillRect(5, 5, 200, 160); // Area for population and average traits

    // Check if creatures array exists and has elements
    if (!creatures || creatures.length === 0) {
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        // Use simState.maxPopulation for the cap display
        ctx.fillText(`Population: 0 / ${simState.maxPopulation}`, 10, 20);
        return; // Exit early if no creatures
    };

    // Calculate averages
    let avgSpeed = 0, avgPerception = 0, avgSize = 0, avgAggression = 0;
    // Calculate tribe counts
    let tribeCounts = new Array(Config.numberOfTribes).fill(0);
    let fightingCount = 0;

    for (const c of creatures) {
        // Check if creature has genes before accessing them (safety check)
        if (c.genes) {
            avgSpeed += c.genes.speed;
            avgPerception += c.genes.perception;
            avgSize += c.genes.size;
            avgAggression += c.genes.aggression;
        }
        // Check if tribeId is valid before incrementing count
        if (c.tribeId >= 0 && c.tribeId < Config.numberOfTribes) {
            tribeCounts[c.tribeId]++;
        }
        // Check if targetEnemy exists and is alive
        if (c.targetEnemy && c.targetEnemy.isAlive) {
            fightingCount++;
        }
    }
    const count = creatures.length;
    // Avoid division by zero if count is somehow still zero here
    if (count > 0) {
        avgSpeed /= count;
        avgPerception /= count;
        avgSize /= count;
        avgAggression /= count;
    }

    // Display Text
    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    // Use simState.maxPopulation for the cap display
    ctx.fillText(`Population: ${count} / ${simState.maxPopulation}`, 10, 20);

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
        // Check if tribeColor exists for safety
        if (Config.tribeColors[i] !== undefined) {
            const tribeColor = `hsl(${Config.tribeColors[i]}, 80%, 60%)`;
            ctx.fillStyle = tribeColor;
            ctx.fillText(`${tribeCounts[i]}`, tribeTextX, 110);
            // Measure text width accurately before adding spacing
            tribeTextX += ctx.measureText(`${tribeCounts[i]}`).width + 8;
        }
    }

    // Display Stockpiles LABEL
     ctx.fillStyle = 'white'; // Reset color to white for label
     ctx.font = '12px Arial';
     ctx.fillText(`Resources:`, 10, 125);

     // Display Stockpile amounts
     let resourceTextX = 75; // Align resource text
    for (let i = 0; i < Config.numberOfTribes; i++) {
         // Check if tribeColor exists for safety
        if (Config.tribeColors[i] !== undefined) {
            const tribeColor = `hsl(${Config.tribeColors[i]}, 80%, 60%)`;
            ctx.fillStyle = tribeColor;
            const amount = tribeStockpiles[i] || 0;
            ctx.fillText(`${amount}`, resourceTextX, 125);
            resourceTextX += ctx.measureText(`${amount}`).width + 8;
        }
    }

    // Display Knowledge
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.fillText(`Knowledge:`, 10, 140);
    let textX = 80; // Align text
    for (let i = 0; i < Config.numberOfTribes; i++) {
        // Check if tribeColor exists for safety
        if (Config.tribeColors[i] !== undefined) {
            const tribeColor = `hsl(${Config.tribeColors[i]}, 80%, 60%)`;
            ctx.fillStyle = tribeColor;
            const amount = Math.floor(tribeKnowledge[i] || 0); // Show whole numbers
            ctx.fillText(`${amount}`, textX, 140);
            textX += ctx.measureText(`${amount}`).width + 8;
        }
    }
     // Display researched tech
     textX = 10; // Reset X for Tech line
     ctx.fillStyle = 'lightgray';
     ctx.fillText(`Tech:`, textX, 155);
     textX += 35;
     for (let i = 0; i < Config.numberOfTribes; i++) {
        // Check if tribeTech[i] and tribeColor exist
        if(tribeTech[i] && Config.tribeColors[i] !== undefined) {
             let techString = '';
             // Check for specific techs - adapt if tech names change
             if(tribeTech[i].has('BasicConstruction')) techString += 'B';
             if(tribeTech[i].has('Agriculture')) techString += 'A';
             if(tribeTech[i].has('BasicDefenses')) techString += 'D';

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
    // Ensure timestamp is valid before calculating delta
    if (!lastTime) {
        lastTime = timestamp;
    }
    const rawDeltaTime = timestamp - lastTime;
    lastTime = timestamp;

    // Clamp rawDeltaTime to avoid large jumps (e.g., after pause or tab switch)
    const clampedRawDeltaTime = Math.min(rawDeltaTime, 100); // Max 100ms step

    const deltaTime = simState.isPaused ? 0 : clampedRawDeltaTime * simState.gameSpeed;

    // Only run updates if not paused and time has passed
	if (deltaTime > 0) {
		// --- 0. Build Quadtrees ---
		// Ensure quadtrees are initialized before clearing/inserting
        if (!creatureQuadTree || !foodQuadTree || !resourceQuadTree || !structureQuadTree) {
            console.error("Quadtrees not initialized!");
            return; // Stop loop if quadtrees are missing
        }
		creatureQuadTree.clear(); foodQuadTree.clear(); resourceQuadTree.clear(); structureQuadTree.clear();

		// Insert Creatures...
		for (const creature of creatures) {
			if (creature.isAlive) {
				const bounds = {
					x: creature.x - creature.size / 2,
					y: creature.y - creature.size / 2,
					width: creature.size,
					height: creature.size,
					ref: creature
				};
				creatureQuadTree.insert(bounds);
			}
		}

		// Insert Food...
		for (const food of foodItems) {
            // Ensure food has properties needed for quadtree
            if (typeof food.x === 'number' && typeof food.y === 'number' && typeof food.width === 'number' && typeof food.height === 'number') {
			    foodQuadTree.insert(food);
            } else {
                console.warn("Skipping invalid food item for quadtree insertion:", food);
            }
		}

		// Insert Resource Nodes...
		for (const node of resourceNodes) {
            // Ensure node has properties needed and isn't empty
			if (!node.isEmpty() && typeof node.x === 'number' && typeof node.y === 'number' && typeof node.width === 'number' && typeof node.height === 'number') {
                 resourceQuadTree.insert(node);
            }
		}

		// Insert Structures...
		for (const struct of structures) {
             // Ensure structure has properties needed
            if (typeof struct.x === 'number' && typeof struct.y === 'number' && typeof struct.size === 'number') {
                const bounds = {
                    x: struct.x - struct.size / 2,
                    y: struct.y - struct.size / 2,
                    width: struct.size,
                    height: struct.size,
                    ref: struct
                };
                structureQuadTree.insert(bounds);
            } else {
                 console.warn("Skipping invalid structure for quadtree insertion:", struct);
            }
		}

		// --- 0.5 Process Research ---
		processResearch();

		// --- Check for new build sites ---
		checkInitiateBuild();


		// --- 1. Apply Structure Effects & Update ---
		for (const struct of structures) {
            // Apply effects (like shelter bonus)
			if (struct.isComplete && struct.type === 'Shelter') {
				const effectBounds = {
					x: struct.x - Config.shelterEffectRadius,
					y: struct.y - Config.shelterEffectRadius,
					width: Config.shelterEffectRadius * 2,
					height: Config.shelterEffectRadius * 2
				};
				// Use try-catch around quadtree retrieval as a safety measure
                try {
                    const nearbyCreatureBounds = creatureQuadTree.retrieve(effectBounds);
                    const nearbyCreatures = nearbyCreatureBounds.map(b => b.ref);
                    struct.applyEffects(nearbyCreatures);
                } catch (error) {
                    console.error("Error retrieving creatures near shelter:", error, effectBounds);
                }
			}
            // Update structure (tower attacks, etc.)
            try {
			    struct.updateStructure(deltaTime, creatureQuadTree);
            } catch (error) {
                console.error("Error updating structure:", error, struct);
            }
		}

        // --- 2. Update Creatures ---
        const newOffspring = [];
        for (let i = creatures.length - 1; i >= 0; i--) { // Iterate backwards for safe removal/addition
            const creature = creatures[i];
            if (!creature || !creature.isAlive) continue; // Skip if creature is invalid or dead

            // Store original position for collision detection reference
            const originalX = creature.x;
            const originalY = creature.y;

            // 1. Creature decides action and calculates intended movement (dx, dy)
            let offspring = null;
            try {
                offspring = creature.update(deltaTime, foodQuadTree, creatureQuadTree, resourceQuadTree, structures, tribeStockpiles, tribeKnowledge, tribeTech, simState);
                if (offspring) { newOffspring.push(offspring); }
            } catch(error) {
                 console.error("Error during creature update:", error, creature);
                 continue; // Skip movement/collision if update failed
            }


            // 2. Calculate intended position
            let intendedDX = creature.dx || 0; // Ensure dx/dy are numbers
            let intendedDY = creature.dy || 0;
            let intendedX = originalX + intendedDX;
            let intendedY = originalY + intendedDY;

            // 3. Check Collision against completed Walls
            let blocked = false;
            if (intendedDX !== 0 || intendedDY !== 0) {
                // Query structure quadtree for potential walls near the *intended path*
                // Simplified query bounds around intended position for now
                 const collisionCheckRadius = creature.size; // Check around creature size
                 const queryBounds = {
                     x: intendedX - collisionCheckRadius,
                     y: intendedY - collisionCheckRadius,
                     width: collisionCheckRadius * 2, height: collisionCheckRadius * 2
                 };

                 try {
                    const nearbyStructureBounds = structureQuadTree.retrieve(queryBounds);
                    for (const bounds of nearbyStructureBounds) {
                        const struct = bounds.ref;
                        // Check only against completed walls
                        if (struct && struct.isComplete && struct.type === 'Wall') {
                            // AABB collision check between creature's intended bounding box and wall's bounding box
                            const creatureLeft = intendedX - creature.size / 2;
                            const creatureRight = intendedX + creature.size / 2;
                            const creatureTop = intendedY - creature.size / 2;
                            const creatureBottom = intendedY + creature.size / 2;

                            const wallLeft = struct.x - struct.size / 2;
                            const wallRight = struct.x + struct.size / 2;
                            const wallTop = struct.y - struct.size / 2;
                            const wallBottom = struct.y + struct.size / 2;

                            // Simple AABB overlap check
                            if (creatureRight > wallLeft && creatureLeft < wallRight && creatureBottom > wallTop && creatureTop < wallBottom) {
                                blocked = true;
                                break; // Found a collision with a wall, stop checking
                            }
                        }
                    }
                 } catch (error) {
                      console.error("Error retrieving structures for collision check:", error, queryBounds);
                 }
            }

            // 4. Determine Final Movement
            let finalDX = blocked ? 0 : intendedDX;
            let finalDY = blocked ? 0 : intendedDY;

            // 5. Apply Final Movement to Position
            creature.x = originalX + finalDX;
            creature.y = originalY + finalDY;

            // 6. Apply Boundary Wrapping (Teleportation)
            if (creature.x < 0) creature.x = Config.canvasWidth;
            if (creature.x > Config.canvasWidth) creature.x = 0;
            if (creature.y < 0) creature.y = Config.canvasHeight;
            if (creature.y > Config.canvasHeight) creature.y = 0;

        } // End of creature loop

        // Add offspring AFTER iterating through the main creatures array
        creatures.push(...newOffspring);

		// --- Handle Structure Resource Generation (e.g., Farms spawning Food) ---
		let generatedFood = []; // Specifically track food to add
		for (const struct of structures) {
            if (struct && typeof struct.generateResources === 'function') {
                try {
                    // Pass only what's needed. generateResources might need deltaTime.
                    // Let's assume it now returns an array of items to spawn.
                    const results = struct.generateResources(deltaTime); // Pass deltaTime

                    if (results && Array.isArray(results)) {
                        for(const res of results) {
                            if (res.type === 'food') {
                                generatedFood.push(new Food(res.x, res.y));
                            }
                            // Handle other resource types if needed
                        }
                    } else if (results && results.type === 'food') { // Handle single object return if needed
                         generatedFood.push(new Food(results.x, results.y));
                    }
                } catch (error) {
                    console.error("Error during structure resource generation:", error, struct);
                }
            }
		}
		// Add generated food to the main list
        if (generatedFood.length > 0) {
		    foodItems.push(...generatedFood);
        }

		// --- 3. Interactions (Eating Food) ---
		const foodToRemove = new Set(); // Use a Set to avoid duplicates easily

        for (const creature of creatures) {
            if (!creature || !creature.isAlive) continue;

            // Define search area around the creature
            const searchRadius = creature.size / 2 + Config.foodSize / 2 + 2; // Radius check optimization
            const queryBounds = {
                x: creature.x - searchRadius,
                y: creature.y - searchRadius,
                width: searchRadius * 2,
                height: searchRadius * 2
            };

            try {
                const nearbyFoodObjects = foodQuadTree.retrieve(queryBounds);

                for (const food of nearbyFoodObjects) {
                     // Check actual collision (distance between centers)
                     const foodCenterX = food.x + food.width / 2;
                     const foodCenterY = food.y + food.height / 2;
                     const dx = creature.x - foodCenterX;
                     const dy = creature.y - foodCenterY;
                     const distanceSq = dx * dx + dy * dy;
                     const radiiSum = creature.size / 2 + food.size / 2;
                     const requiredDistSq = radiiSum * radiiSum;

                     if (distanceSq <= requiredDistSq) {
                         // Check if food hasn't already been marked for removal this frame
                         if (!foodToRemove.has(food)) {
                             creature.eat(food);
                             foodToRemove.add(food); // Add food object to the Set
                             break; // Creature eats one food per frame maximum
                         }
                     }
                 }
             } catch (error) {
                  console.error("Error retrieving/processing food for eating:", error, queryBounds);
             }
        }

		// Remove eaten food efficiently using the Set
		if (foodToRemove.size > 0) {
            // Filter out items present in the Set
			foodItems = foodItems.filter(food => !foodToRemove.has(food));
			spawnFood(foodToRemove.size); // Respawn the same number of food items
		}

		// --- 4. Update World State (Removals, Spawns) ---
		// Remove destroyed structures (health <= 0)
		structures = structures.filter(s => s && (s.health > 0 || !s.isComplete)); // Keep incomplete structures

		// Remove depleted resource nodes & potentially respawn
		resourceNodes = resourceNodes.filter(node => node && !node.isEmpty());
		if (Math.random() < 0.005) { // Low chance to spawn a new node
             spawnResourceNodes(1);
        }

        // Remove dead creatures
		creatures = creatures.filter(creature => creature && creature.isAlive);

		// --- Population Cap ---
        // Use simState value dynamically
		if (creatures.length > simState.maxPopulation) {
			// Simple random cull: sort randomly and slice
			creatures.sort(() => Math.random() - 0.5);
			creatures.splice(simState.maxPopulation); // Remove excess creatures
		}
	} // End if (deltaTime > 0)

    // --- 5. Draw ---
    // Basic check for context existence
    if (!ctx) {
        console.error("Canvas context (ctx) is not available for drawing.");
        return; // Stop if context is lost
    }
    try {
        ctx.clearRect(0, 0, Config.canvasWidth, Config.canvasHeight);

        // Draw order: resources, structures, food, creatures
        for (const node of resourceNodes) { if (node) node.draw(ctx); }
        for (const struct of structures) { if (struct) struct.draw(ctx); }
        for (const food of foodItems) { if (food) food.draw(ctx); }
        for (const creature of creatures) { if (creature) creature.draw(ctx); }

        // --- UI Text ---
        displayPopulationAndTraits(); // Update and draw UI stats

    } catch (error) {
        console.error("Error during drawing phase:", error);
        // Potentially stop the loop or try to recover if drawing errors persist
        // For now, just log it and let the next frame run
    }

    // --- 6. Next Frame ---
    requestAnimationFrame(gameLoop); // Schedule the next frame
}

// --- Start Simulation ---
// Make sure canvas exists before setting size and getting context
if (canvas) {
    canvas.width = Config.canvasWidth;
    canvas.height = Config.canvasHeight;
    initializeWorld();
    lastTime = performance.now(); // Initialize lastTime right before first frame
    requestAnimationFrame(gameLoop);
} else {
    console.error("Canvas element #mainCanvas not found!");
}