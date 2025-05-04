const canvas = document.getElementById('mosaicCanvas');
const ctx = canvas.getContext('2d');

// --- Grid Configuration ---
const gridRows = 200;
const gridCols = 400;
const pixelSize = 7;
const spacing = 1;
const defaultColor = '#E0E0E0'; // Light gray (inactive)
const activeColor = '#0000FF';   // Deep bright blue (active)
const backgroundColor = '#FFFFFF'; // White background to see spacing
// --- End Grid Configuration ---

// --- State ---
let gridState = []; // 2D array to store pixel state (0 for default, 1 for active)
let history = [];   // Array to store previous grid states for undo
const MAX_HISTORY = 50; // Limit undo history size
let isDragging = false;
let currentDragMode = null; // 'draw' or 'erase'
// --- End State ---

// --- Utilities ---
function deepCopyGrid(grid) {
    // Simple deep copy for a 2D array of numbers
    return grid.map(row => [...row]);
}
// --- End Utilities ---

// Calculate canvas size based on grid
const canvasWidth = spacing + gridCols * (pixelSize + spacing);
const canvasHeight = spacing + gridRows * (pixelSize + spacing);

canvas.width = canvasWidth;
canvas.height = canvasHeight;

console.log(`Canvas size set to ${canvasWidth}x${canvasHeight}`);

// --- Initialization ---
function initializeGridState() {
    gridState = []; // Reset
    for (let r = 0; r < gridRows; r++) {
        gridState[r] = [];
        for (let c = 0; c < gridCols; c++) {
            gridState[r][c] = 0; // 0 represents defaultColor
        }
    }
    console.log("Grid state initialized.");
}
// --- End Initialization ---

// --- Drawing ---
function drawGrid() {
    // Set background color (clears canvas)
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw pixels based on state
    for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
            ctx.fillStyle = gridState[r][c] === 1 ? activeColor : defaultColor;
            const x = spacing + c * (pixelSize + spacing);
            const y = spacing + r * (pixelSize + spacing);
            ctx.fillRect(x, y, pixelSize, pixelSize);
        }
    }
    // console.log("Grid redrawn."); // Optional: for debugging
}
// --- End Drawing ---

// --- Interaction ---
function getPixelCoords(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const canvasX = (event.clientX - rect.left) * scaleX;
    const canvasY = (event.clientY - rect.top) * scaleY;

    // Calculate row and column, considering spacing
    const col = Math.floor((canvasX - spacing) / (pixelSize + spacing));
    const row = Math.floor((canvasY - spacing) / (pixelSize + spacing));

    // Check bounds
    if (row >= 0 && row < gridRows && col >= 0 && col < gridCols) {
        return { row, col };
    }
    return null; // Click was outside the grid pixels
}

function handlePixelChange(row, col, mode) {
    const currentState = gridState[row][col];
    const newState = (mode === 'draw') ? 1 : 0;

    if (currentState !== newState) {
        gridState[row][col] = newState;
        // Only redraw the single changed pixel for efficiency during drag
        ctx.fillStyle = newState === 1 ? activeColor : defaultColor;
        const x = spacing + col * (pixelSize + spacing);
        const y = spacing + row * (pixelSize + spacing);
        ctx.fillRect(x, y, pixelSize, pixelSize);
        // console.log(`Pixel (${row}, ${col}) changed to ${mode}`); // Optional: for debugging
        return true; // Indicate that a change was made
    }
    return false; // No change made
}

// Flag to track if any pixel was actually changed during a mousedown/drag operation
let changeOccurred = false;

canvas.addEventListener('mousedown', (event) => {
    changeOccurred = false; // Reset flag for this action
    const coords = getPixelCoords(event);
    if (coords) {
        isDragging = true;
        const { row, col } = coords;

        // Save state *before* this action starts
        if (history.length >= MAX_HISTORY) {
            history.shift(); // Remove oldest state if history is full
        }
        history.push(deepCopyGrid(gridState));
        // console.log(`State saved. History size: ${history.length}`); // Debugging

        // Determine mode based on the first pixel clicked
        currentDragMode = (gridState[row][col] === 0) ? 'draw' : 'erase';
        if (handlePixelChange(row, col, currentDragMode)) {
            changeOccurred = true;
        }
    }
});

canvas.addEventListener('mousemove', (event) => {
    if (isDragging) {
        const coords = getPixelCoords(event);
        if (coords && currentDragMode) {
             if (handlePixelChange(coords.row, coords.col, currentDragMode)) {
                 changeOccurred = true;
             }
        }
    }
});

canvas.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        currentDragMode = null;
        // If no change actually occurred during the click/drag, remove the state we optimistically saved
        if (!changeOccurred && history.length > 0) {
            history.pop();
             // console.log(`No change detected, removed saved state. History size: ${history.length}`); // Debugging
        }
        console.log("Dragging stopped.");
        changeOccurred = false; // Reset for next action
    }
});

canvas.addEventListener('mouseleave', () => {
    // Stop dragging if mouse leaves the canvas
    if (isDragging) {
        // Treat mouseleave like mouseup regarding history
        if (!changeOccurred && history.length > 0) {
            history.pop();
            // console.log(`No change detected, removed saved state. History size: ${history.length}`); // Debugging
        }
        isDragging = false;
        currentDragMode = null;
        changeOccurred = false;
        console.log("Dragging stopped (mouse left canvas).");
    }
});

// --- Undo Logic ---
document.addEventListener('keydown', (event) => {
    // Check for Cmd+Z on Mac or Ctrl+Z on other systems
    const isUndo = (event.metaKey || event.ctrlKey) && event.key === 'z';

    if (isUndo) {
        event.preventDefault(); // Prevent browser's default undo behavior
        if (history.length > 0) {
            gridState = history.pop(); // Restore the previous state
            drawGrid(); // Redraw the entire grid with the restored state
            console.log(`Undo executed. History size: ${history.length}`);
        } else {
            console.log("Nothing to undo.");
        }
    }
});
// --- End Undo Logic ---

// --- Initial Setup ---
initializeGridState();
drawGrid(); // Draw the initial grid
console.log(`Drew initial ${gridRows}x${gridCols} grid.`);
// --- End Initial Setup --- 