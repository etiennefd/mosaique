const canvas = document.getElementById('mosaicCanvas');
const ctx = canvas.getContext('2d');

// --- Grid Configuration ---
const gridRows = 200;
const gridCols = 400;
const pixelSize = 5;
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
let lastPixelCoords = null; // Store the last {row, col} during drag
let lastClickCoords = null; // Store the last {row, col} clicked for Shift+Click line
let shiftKeyPressed = false; // Track if Shift key is pressed
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

// --- Line Drawing Utility ---
function drawLineBetweenPixels(r1, c1, r2, c2, mode) {
    // Simple line drawing algorithm (like Bresenham's principle)
    let dx = Math.abs(c2 - c1);
    let dy = Math.abs(r2 - r1);
    let sx = (c1 < c2) ? 1 : -1;
    let sy = (r1 < r2) ? 1 : -1;
    let err = dx - dy;

    let currentCol = c1;
    let currentRow = r1;

    let changed = false;

    while (true) {
        // Apply change to the current pixel on the line
        if (handlePixelChange(currentRow, currentCol, mode)) {
             changed = true;
        }

        // Check if we've reached the end point
        if ((currentCol === c2) && (currentRow === r2)) break;

        let e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            currentCol += sx;
        }
        if (e2 < dx) {
            err += dx;
            currentRow += sy;
        }
    }
    return changed;
}
// --- End Line Drawing Utility ---

// Flag to track if any pixel was actually changed during a mousedown/drag operation
let changeOccurred = false;

canvas.addEventListener('mousedown', (event) => {
    changeOccurred = false; // Reset flag for this action
    lastPixelCoords = null; // Reset last drag coords for new action
    const coords = getPixelCoords(event);

    if (coords) {
        const { row, col } = coords;

        if (shiftKeyPressed && lastClickCoords) {
            // --- Shift+Click Logic --- 
            // Don't start dragging
            isDragging = false;
            // Save state before drawing the line
            if (history.length >= MAX_HISTORY) {
                history.shift();
            }
            history.push(deepCopyGrid(gridState));
            // console.log(`State saved (Shift+Click). History size: ${history.length}`);

            // Draw line from last click to current click (always in 'draw' mode for now)
            if (drawLineBetweenPixels(lastClickCoords.row, lastClickCoords.col, row, col, 'draw')) {
                changeOccurred = true;
            }

            // If no change actually occurred, pop the saved state
            if (!changeOccurred && history.length > 0) {
                history.pop();
                // console.log(`No change detected (Shift+Click), removed saved state. History size: ${history.length}`);
            }
            lastClickCoords = { row, col }; // Update last click position AFTER drawing line
             // --- End Shift+Click Logic ---
        } else {
            // --- Normal Click/Drag Logic --- 
            isDragging = true; // Prepare for potential drag
            // Save state *before* this action starts
            if (history.length >= MAX_HISTORY) {
                history.shift();
            }
            history.push(deepCopyGrid(gridState));
            // console.log(`State saved (Drag Start). History size: ${history.length}`);

            // Determine mode based on the first pixel clicked
            currentDragMode = (gridState[row][col] === 0) ? 'draw' : 'erase';
            if (handlePixelChange(row, col, currentDragMode)) {
                changeOccurred = true;
            }
            lastPixelCoords = { row, col }; // Set starting point for line interpolation during drag
            lastClickCoords = { row, col }; // Update last click position
            // --- End Normal Click/Drag Logic ---
        }
    }
});

canvas.addEventListener('mousemove', (event) => {
    if (isDragging) {
        const coords = getPixelCoords(event);
        if (coords && currentDragMode) {
            if (lastPixelCoords && (coords.row !== lastPixelCoords.row || coords.col !== lastPixelCoords.col)) {
                // Draw line from last coords to current coords
                if (drawLineBetweenPixels(lastPixelCoords.row, lastPixelCoords.col, coords.row, coords.col, currentDragMode)) {
                    changeOccurred = true;
                }
            } else if (!lastPixelCoords) {
                // Handle the very first pixel if not handled by mousedown (shouldn't usually happen here but safe)
                if (handlePixelChange(coords.row, coords.col, currentDragMode)){
                     changeOccurred = true;
                }
            }
            lastPixelCoords = { row: coords.row, col: coords.col }; // Update last coords
        }
    }
});

canvas.addEventListener('mouseup', () => {
    if (isDragging) {
        // If dragging finished, update the last *click* position
        // to where the drag ended, for subsequent Shift+Clicks.
        if (lastPixelCoords) {
            lastClickCoords = { row: lastPixelCoords.row, col: lastPixelCoords.col };
        }

        lastPixelCoords = null; // Clear last drag coords on mouse up
        isDragging = false;
        currentDragMode = null;

        // If no change actually occurred during the click/drag, remove the state we optimistically saved
        if (!changeOccurred && history.length > 0) {
            history.pop();
            // console.log(`No change detected (mouse up), removed saved state. History size: ${history.length}`); // Debugging
        }
        console.log("Dragging stopped.");
        changeOccurred = false; // Reset for next action
    }
});

canvas.addEventListener('mouseleave', () => {
    // Stop dragging if mouse leaves the canvas
    if (isDragging) {
        lastPixelCoords = null; // Clear last coords on mouse leave
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

// --- Keyboard Listeners ---
document.addEventListener('keydown', (event) => {
    if (event.key === 'Shift') {
        shiftKeyPressed = true;
    }

    // Check for Cmd+Z on Mac or Ctrl+Z on other systems
    const isUndo = (event.metaKey || event.ctrlKey) && event.key === 'z';

    if (isUndo) {
        event.preventDefault(); // Prevent browser's default undo behavior
        if (isDragging) return; // Don't allow undo while dragging

        if (history.length > 0) {
            gridState = history.pop(); // Restore the previous state
            drawGrid(); // Redraw the entire grid with the restored state
            console.log(`Undo executed. History size: ${history.length}`);
        } else {
            console.log("Nothing to undo.");
        }
    }
});

document.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') {
        shiftKeyPressed = false;
    }
});
// --- End Keyboard Listeners ---

// --- Initial Setup ---
initializeGridState();
drawGrid(); // Draw the initial grid
console.log(`Drew initial ${gridRows}x${gridCols} grid.`);
// --- End Initial Setup --- 