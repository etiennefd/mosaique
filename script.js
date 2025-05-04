const canvas = document.getElementById('mosaicCanvas');
const ctx = canvas.getContext('2d');

// --- Grid Configuration ---
const gridRows = 200;
const gridCols = 400;
const pixelSize = 5;
const spacing = 1;
// const defaultColor = '#E0E0E0'; // Replaced by palette
// const activeColor = '#0000FF';   // Replaced by palette
const backgroundColor = '#FFFFFF'; // Canvas background, used for clearing
// --- End Grid Configuration ---

// --- Palette & State ---
const palette = [
    '#00008B', '#0000CD', '#4169E1', // Dark to Royal Blue
    '#6495ED', '#ADD8E6',            // Cornflower to Light Blue
    '#FFD700', '#EEE8AA',            // Gold, Pale Goldenrod
    '#FFFFFF', '#E0E0E0'             // White, Pale Gray
];
const defaultPixelColorIndex = 8; // Index of default grid color (Pale Gray)
const erasePixelColorIndex = 8;   // Index of color to use when "erasing" (Pale Gray)

let selectedColorIndex = 0; // Default to the first color (Dark Blue)
let gridState = []; // 2D array to store pixel state (now stores color index)
let history = [];   // Array to store previous grid states for undo
const MAX_HISTORY = 50; // Limit undo history size
let isDragging = false;
let lastPixelCoords = null; // Store the last {row, col} during drag
let lastClickCoords = null; // Store the last {row, col} clicked for Shift+Click line
let shiftKeyPressed = false; // Track if Shift key is pressed
let currentTool = 'pencil'; // Default tool
let currentDragMode = null; // 'draw' or 'erase' (pencil only for now)
// --- End Palette & State ---

// --- Utilities ---
function deepCopyGrid(grid) {
    // Simple deep copy for a 2D array of numbers/indexes
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
            gridState[r][c] = defaultPixelColorIndex; // Initialize with the default color index
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
            // Ensure the index is valid before accessing palette
            const colorIndex = gridState[r][c];
            ctx.fillStyle = palette[colorIndex] || palette[defaultPixelColorIndex]; // Fallback to default
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
    const currentPixelIndex = gridState[row][col];
    let newPixelIndex;

    if (mode === 'draw') {
        newPixelIndex = selectedColorIndex;
    } else { // mode === 'erase'
        newPixelIndex = erasePixelColorIndex; // Erase to the designated erase color (e.g., white)
    }

    if (currentPixelIndex !== newPixelIndex) {
        gridState[row][col] = newPixelIndex;
        // Only redraw the single changed pixel for efficiency during drag
        ctx.fillStyle = palette[newPixelIndex];
        const x = spacing + col * (pixelSize + spacing);
        const y = spacing + row * (pixelSize + spacing);
        ctx.fillRect(x, y, pixelSize, pixelSize);
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

// --- Flood Fill Utility ---
function floodFill(startRow, startCol, fillColorIndex) {
    const startColorIndex = gridState[startRow][startCol];

    if (startColorIndex === fillColorIndex) {
        console.log("Fill color is the same as start color, skipping fill.");
        return false; // No change needed
    }

    // Save state before filling for undo
    if (history.length >= MAX_HISTORY) {
        history.shift();
    }
    history.push(deepCopyGrid(gridState));
    console.log(`State saved (Flood Fill). History size: ${history.length}`);

    const queue = [[startRow, startCol]]; // Queue of [row, col] pairs
    let iterations = 0; // Safety break
    const maxIterations = gridRows * gridCols * 3; // Generous limit

    let pixelsChanged = 0;

    while (queue.length > 0) {
        if (iterations++ > maxIterations) {
            console.error("Flood fill iteration limit reached!");
            break;
        }

        const [row, col] = queue.shift();

        // Bounds check and color check before processing
        if (row < 0 || row >= gridRows || col < 0 || col >= gridCols || gridState[row][col] !== startColorIndex) {
            continue;
        }

        // Change color and mark as processed (by changing color)
        gridState[row][col] = fillColorIndex;
        pixelsChanged++;

        // Add neighbors to the queue
        queue.push([row + 1, col]); // Down
        queue.push([row - 1, col]); // Up
        queue.push([row, col + 1]); // Right
        queue.push([row, col - 1]); // Left
    }

    if (pixelsChanged > 0) {
        drawGrid(); // Redraw the entire grid after fill
        console.log(`Flood fill completed. ${pixelsChanged} pixels changed.`);
        return true; // Indicate change occurred
    } else {
         // If no pixels were actually changed (e.g., hit iteration limit early), remove saved state
        if (history.length > 0) {
            history.pop();
             console.log(`No change detected (Flood Fill), removed saved state. History size: ${history.length}`);
        }
        return false;
    }

}
// --- End Flood Fill Utility ---

// Flag to track if any pixel was actually changed during a mousedown/drag operation
let changeOccurred = false;

canvas.addEventListener('mousedown', (event) => {
    changeOccurred = false;
    lastPixelCoords = null;
    const coords = getPixelCoords(event);

    if (coords) {
        const { row, col } = coords;

        // --- Tool Specific Logic ---
        if (currentTool === 'pencil') {
            if (shiftKeyPressed && lastClickCoords) {
                // --- Shift+Click Line Logic (Pencil) --- 
                isDragging = false;
                // ... (History saving inside drawLineBetweenPixels for this specific case might be better)
                // Let's simplify: save history *before* potential line draw
                 if (history.length >= MAX_HISTORY) { history.shift(); }
                 history.push(deepCopyGrid(gridState));

                if (drawLineBetweenPixels(lastClickCoords.row, lastClickCoords.col, row, col, 'draw')) {
                    changeOccurred = true;
                }
                 if (!changeOccurred && history.length > 0) { history.pop(); } // Pop if no change

                lastClickCoords = { row, col };
                 // --- End Shift+Click Line --- 
            } else {
                // --- Normal Click/Drag Logic (Pencil) --- 
                isDragging = true;
                 // Save state *before* drag action starts
                 if (history.length >= MAX_HISTORY) { history.shift(); }
                 history.push(deepCopyGrid(gridState));

                currentDragMode = (gridState[row][col] === selectedColorIndex) ? 'erase' : 'draw';
                if (handlePixelChange(row, col, currentDragMode)) {
                    changeOccurred = true;
                }
                lastPixelCoords = { row, col };
                lastClickCoords = { row, col };
                // --- End Normal Click/Drag --- 
            }
        } else if (currentTool === 'bucket') {
            isDragging = false; // No dragging for bucket tool
            if (floodFill(row, col, selectedColorIndex)) {
                 changeOccurred = true; // floodFill handles its own history saving
            }
             lastClickCoords = { row, col }; // Still update last click for potential tool switch + Shift+Click
        } else {
            console.warn(`Tool not implemented: ${currentTool}`);
             isDragging = false;
             lastClickCoords = { row, col };
        }
        // --- End Tool Specific Logic ---
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
         // This block now only applies if a drag was actually started (e.g., pencil tool)
        if (lastPixelCoords) {
            lastClickCoords = { row: lastPixelCoords.row, col: lastPixelCoords.col };
        }
        lastPixelCoords = null;
        isDragging = false;
        currentDragMode = null;

        if (!changeOccurred && history.length > 0) {
             // Check if the state saved was from this drag operation
             // This might need refinement if Shift+Click saves state differently
             // For now, assume the last history item corresponds to the drag start
             history.pop();
        }
        console.log("Dragging stopped.");
        changeOccurred = false;
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
    // Don't trigger shortcuts if focus is on an input element (future proofing)
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
    }

    // --- Undo Logic ---
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
        return; // Stop processing if undo was handled
    }
    // --- End Undo Logic ---

    // --- Shift Key Tracking ---
    if (event.key === 'Shift') {
        shiftKeyPressed = true;
        // No preventDefault needed here, shift often used by browser/OS
        return; // Can stop processing here if only shift was pressed
    }
    // --- End Shift Key Tracking ---

    // --- Tool Selection Shortcuts ---
    if (event.key === 'g' || event.key === 'G') {
        event.preventDefault();
        updateSelectedTool('tool-bucket');
        return; // Handled
    }
    if (event.key === 'b' || event.key === 'B' || event.key === 'p' || event.key === 'P') { // Added B and P for pencil
        event.preventDefault();
        updateSelectedTool('tool-pencil'); // Now accessible
        return; // Handled
    }
    // Add other tool shortcuts here later
    // --- End Tool Selection Shortcuts ---

    // --- Color Selection Shortcuts (1-9) ---
    const keyNum = parseInt(event.key, 10);
    if (!isNaN(keyNum) && keyNum >= 1 && keyNum <= 9) {
        const colorIndex = keyNum - 1; // Map 1-9 to index 0-8
        if (colorIndex >= 0 && colorIndex < palette.length) {
            event.preventDefault(); // Prevent typing the number if used as shortcut
            selectedColorIndex = colorIndex;
            updateSelectedSwatch(selectedColorIndex); // Update UI feedback
            console.log(`Color selected via key ${keyNum}: index ${colorIndex}`);
        }
    }
    // --- End Color Selection Shortcuts ---

});

document.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') {
        shiftKeyPressed = false;
    }
    // No preventDefault needed for keyup
});
// --- End Keyboard Listeners ---

// --- UI Interaction (Options Panel) ---
// Need access to updateSelectedSwatch/Tool, so declare them outside if possible or pass reference
// For simplicity, keep them nested for now, but ensure setupOptionsPanel is called first.
let updateSelectedSwatch = () => {}; // Placeholder
let updateSelectedTool = () => {};   // Placeholder

function setupOptionsPanel() {
    const toolButtons = document.querySelectorAll('.tool-options button');
    const colorSwatches = document.querySelectorAll('.color-options .color-swatch');

    // Assign the actual function here
    updateSelectedSwatch = (newIndex) => {
        // Remove selected class from previously selected swatch
        const oldSelected = document.querySelector('.color-options .color-swatch.selected');
        if (oldSelected) {
            oldSelected.classList.remove('selected');
        }
        // Add selected class to the new swatch
        const newSelected = document.getElementById(`color-${newIndex}`);
        if (newSelected) {
            newSelected.classList.add('selected');
        }
        // console.log(`Color ${newIndex} (${palette[newIndex]}) selected.`); // Log moved to keydown/click handlers
    };

    // Assign the actual function here
    updateSelectedTool = (newToolId) => {
        // Remove selected class from all tool buttons
        toolButtons.forEach(btn => btn.classList.remove('selected'));
        // Add selected class to the clicked button
        const selectedButton = document.getElementById(newToolId);
        if (selectedButton) {
            selectedButton.classList.add('selected');
        }
        currentTool = newToolId.replace('tool-', ''); // Extract tool name
        console.log(`Tool selected: ${currentTool}`);
    };

    toolButtons.forEach(button => {
        button.addEventListener('click', () => {
            updateSelectedTool(button.id);
        });
    });

    colorSwatches.forEach((swatch, index) => {
        // Set initial background color from palette (redundant if already in HTML style, but safer)
        swatch.style.backgroundColor = palette[index];

        swatch.addEventListener('click', () => {
            selectedColorIndex = index;
            updateSelectedSwatch(index);
             console.log(`Color selected via click: index ${index}`);
        });
    });

    // Set initial selections
    updateSelectedSwatch(selectedColorIndex);
    updateSelectedTool(`tool-${currentTool}`); // Set initial tool UI

}
// --- End UI Interaction ---

// --- Initial Setup ---
initializeGridState();
drawGrid(); // Draw the initial grid
setupOptionsPanel(); // Initialize the options panel listeners and UI
console.log(`Drew initial ${gridRows}x${gridCols} grid.`);
// --- End Initial Setup --- 