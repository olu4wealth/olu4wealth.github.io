// config.js - Shared simulation parameters

export const canvasWidth = 800;
export const canvasHeight = 600;

// Creature settings
export const baseCreatureSize = 8; // Base size, can be modified by genes
export const maxEnergy = 100;
export const energyDecayRate = 0.05; // Base decay
export const energyFromFood = 30;
export const reproductionEnergyThreshold = maxEnergy * 0.8;
export const reproductionEnergyCost = maxEnergy * 0.5;
export const offspringInitialEnergy = maxEnergy * 0.4;
export const reproductionCooldown = 250; // Slightly longer cooldown maybe
export const baseSpeed = 1.0; // Base speed, modified by genes
export const basePerceptionRadius = 80; // Base perception, modified by genes
export const energyThreshold = maxEnergy * 0.6; // Hunger threshold

// Food settings
export const foodSize = 5;
export const startingFoodCount = 150; // Increase food slightly maybe

// Evolution settings
export const mutationRate = 0.1; // 10% chance for *each* gene to mutate
export const mutationAmount = 0.15; // Max +/- 15% change during mutation

// World settings
export const startingCreatureCount = 50;
export const maxPopulation = 200;

// --- Tribe Settings ---
export const numberOfTribes = 5; // How many distinct tribes to start with
export const tribeColors = [ // Define base HSL hues for each tribe
    0,    // Red
    60,   // Yellow
    120,  // Green
    200,  // Cyan-Blue
    270   // Purple
    // Add more hues if numberOfTribes increases
];

// --- Combat & Health Settings ---
export const baseHealth = 50;      // Base health points
export const healthPerSize = 5;    // Extra health per unit of size above base
export const baseAttackDamage = 5; // Base damage per attack
export const damagePerSize = 1;    // Extra damage per unit of size above base
export const attackRange = 5;      // Additional range beyond creature size
export const attackCooldownTime = 60; // Frames/updates between attacks
export const baseAggression = 0.3; // Base chance/tendency to initiate attack (0-1)

// --- Resources & Building ---
export const resourceNodeSize = 15;
export const startingResourceNodes = 30;
export const materialPerNode = 50; // Amount of 'material' in each node
export const gatherAmount = 1;     // Material gathered per 'tick' or action
export const gatherTime = 30;      // Frames/updates required to gather one unit
export const markerCost = 25;      // Material cost for a Tribal Marker
export const buildTime = 150;      // Frames/updates needed to build a Marker

// --- Structure Specifics ---
export const shelterCost = { material: 40 }; // Shelter costs materials
export const shelterBuildTime = 200;
export const shelterSize = 20;
export const shelterEffectRadius = 50;      // How far the shelter's effect reaches
export const shelterEnergySave = 0.02;    // Amount of energy decay reduced nearby

// NEW: Wall Stats
export const wallCost = { material: 15 }; // Cheaper per segment
export const wallBuildTime = 100;
export const wallSize = 12; // Make them slightly smaller grid-like?
export const wallHealth = 150; // Tougher than basic creatures

// NEW: Tower Stats
export const towerCost = { material: 75 }; // Expensive
export const towerBuildTime = 300;
export const towerSize = 18;
export const towerHealth = 250;
export const towerInfluenceRate = 3.5; // High influence anchor
export const towerInfluenceRadius = 85;
export const towerAttackDamage = 8;
export const towerAttackRange = 120; // Needs to be decent
export const towerAttackCooldown = 90; // Frames between shots
export const towerTargetingScanRate = 15; // How often (in frames) the tower scans for targets


// --- Knowledge & Tech ---
export const knowledgePerCreatureTick = 0.001; // Passive Knowledge gain per creature per frame (can link to Intelligence later)
export const researchSpeedMultiplier = 1.0;    // Global speed modifier
export const techTree = {
    'BasicConstruction': {
        name: 'Basic Construction',
        cost: { knowledge: 50 }, // Cost in Knowledge
        prereqs: [],             // No prerequisites for the first tech
        unlocks: ['Shelter', 'Marker']     // What building does it unlock?
    },
	// NEW Tech
    'BasicDefenses': {
        name: 'Basic Defenses',
        cost: { knowledge: 100 }, // More expensive
        prereqs: ['BasicConstruction'], // Requires basic building knowledge
        unlocks: ['Wall', 'Tower'] // Unlocks both Walls and Towers
    }
    // Add more techs later: 'BasicTools', 'Walls', etc.
};

// --- NEW: Influence & Essence System ---
export const influenceCellSize = 10; // Size of each grid cell for influence map (pixels)
export const maxInfluence = 100;    // Maximum intensity value in a cell
export const influenceDecayRate = 0.99; // Multiplier per frame (e.g., 0.99 means 1% decay)

export const creatureInfluenceRate = 0.5; // Influence generated per creature per frame
export const creatureInfluenceRadius = 40;  // Radius creature affects (pixels)

// Structures generate more influence
export const markerInfluenceRate = 1.0;
export const markerInfluenceRadius = 50;
export const shelterInfluenceRate = 2.5;
export const shelterInfluenceRadius = 75;

export const influenceColorAlphaMax = 0.25; // Max alpha for the visual influence layer

// Gameplay effects of influence
export const ownTerritorySpeedBoost = 1.15;   // Speed multiplier in own strong influence
export const enemyTerritorySpeedPenalty = 0.85; // Speed multiplier in enemy strong influence
export const influenceEffectThreshold = maxInfluence * 0.3; // Intensity needed for effects to apply
export const aggressionInfluenceModifier = 0.2; // How much influence affects aggression (adds/subtracts from base)

// --- Quadtree Settings ---
export const quadtreeCapacity = 4; // Max items per node before splitting
export const foodQuadtreeCapacity = 8; // Can be different for food if needed