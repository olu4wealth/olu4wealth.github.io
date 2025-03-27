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

// --- Knowledge & Tech ---
export const knowledgePerCreatureTick = 0.001; // Passive Knowledge gain per creature per frame (can link to Intelligence later)
export const researchSpeedMultiplier = 1.0;    // Global speed modifier
export const techTree = {
    'BasicConstruction': {
        name: 'Basic Construction',
        cost: { knowledge: 50 }, // Cost in Knowledge
        prereqs: [],             // No prerequisites for the first tech
        unlocks: ['Shelter']     // What building does it unlock?
    },
    // Add more techs later: 'BasicTools', 'Walls', etc.
};


// --- Quadtree Settings ---
export const quadtreeCapacity = 4; // Max items per node before splitting
export const foodQuadtreeCapacity = 8; // Can be different for food if needed