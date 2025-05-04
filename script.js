const canvas = document.getElementById('mosaicCanvas');
const ctx = canvas.getContext('2d');
const previewCanvas = document.getElementById('previewCanvas');
const previewCtx = previewCanvas.getContext('2d');

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
let isDrawingShape = false;
let shapeStartX = null;
let shapeStartY = null;

// Selection State
let selectionRect = null; // Stores { r1, c1, r2, c2 } of the selected area
let isDefiningSelection = false;
let isMovingSelection = false;   // Track if currently moving the selection
let selectionBuffer = null;    // Stores the pixel data { width, height, data: [[index,...],...] }
let moveStartCoords = null;    // Store {row, col} where move drag started
let moveOffset = null;         // Store {dr, dc} offset from top-left corner to mouse click

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

// Size both canvases
canvas.width = canvasWidth;
canvas.height = canvasHeight;
previewCanvas.width = canvasWidth;
previewCanvas.height = canvasHeight;

console.log(`Main and Preview canvas size set to ${canvasWidth}x${canvasHeight}`);

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

function clearPreviewCanvas() {
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
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

// --- Shape Pixel Calculation ---
function getLinePixels(r1, c1, r2, c2) {
    const pixels = [];
    let dx = Math.abs(c2 - c1);
    let dy = Math.abs(r2 - r1);
    let sx = (c1 < c2) ? 1 : -1;
    let sy = (r1 < r2) ? 1 : -1;
    let err = dx - dy;
    let currentCol = c1;
    let currentRow = r1;

    while (true) {
        if (currentRow >= 0 && currentRow < gridRows && currentCol >= 0 && currentCol < gridCols) {
             pixels.push([currentRow, currentCol]);
        }
        if ((currentCol === c2) && (currentRow === r2)) break;
        let e2 = 2 * err;
        if (e2 > -dy) { err -= dy; currentCol += sx; }
        if (e2 < dx) { err += dx; currentRow += sy; }
    }
    return pixels;
}

function getRectanglePixels(r1, c1, r2, c2) {
    const pixels = [];
    const minR = Math.min(r1, r2);
    const maxR = Math.max(r1, r2);
    const minC = Math.min(c1, c2);
    const maxC = Math.max(c1, c2);

    for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
            // Draw only the border
            if (r === minR || r === maxR || c === minC || c === maxC) {
                 if (r >= 0 && r < gridRows && c >= 0 && c < gridCols) {
                    pixels.push([r, c]);
                 }
            }
        }
    }
    return pixels;
}

function getCirclePixels(r1, c1, r2, c2) {
    // Approximate circle using distance from center to corner as radius
    const pixels = [];
    const centerX = (c1 + c2) / 2;
    const centerY = (r1 + r2) / 2;
    const radiusX = Math.abs(c2 - c1) / 2;
    const radiusY = Math.abs(r2 - r1) / 2;
    const radius = Math.sqrt(radiusX * radiusX + radiusY * radiusY);
    const centerGridC = Math.floor(centerX);
    const centerGridR = Math.floor(centerY);
    const radiusGrid = Math.ceil(radius);

    // Iterate bounding box around center
    for (let r = centerGridR - radiusGrid; r <= centerGridR + radiusGrid; r++) {
        for (let c = centerGridC - radiusGrid; c <= centerGridC + radiusGrid; c++) {
             if (r < 0 || r >= gridRows || c < 0 || c >= gridCols) continue;

            // Check distance for pixels near the circumference
            const dist = Math.sqrt(Math.pow(c - centerX, 2) + Math.pow(r - centerY, 2));
            // Check if pixel is close to the ideal radius (within 0.8 grid units, adjust for look)
            if (Math.abs(dist - radius) < 0.8) { // Threshold for thickness
                pixels.push([r, c]);
            }
        }
    }
    // A more accurate Midpoint Circle Algorithm could be used here for better results
    return pixels;
}

// Function to apply calculated pixels to the grid state
function applyPixelsToGrid(pixels, colorIndex) {
    let changed = false;
    pixels.forEach(([r, c]) => {
        if (gridState[r][c] !== colorIndex) {
            gridState[r][c] = colorIndex;
            changed = true;
        }
    });
    return changed;
}
// --- End Shape Pixel Calculation ---

// --- Selection Utilities ---
function isInsideRect(row, col, rect) {
    return rect && row >= rect.r1 && row <= rect.r2 && col >= rect.c1 && col <= rect.c2;
}

function copySelectionToBuffer() {
    if (!selectionRect) return false;

    const { r1, c1, r2, c2 } = selectionRect;
    const height = r2 - r1 + 1;
    const width = c2 - c1 + 1;
    const data = [];

    for (let r = 0; r < height; r++) {
        data[r] = [];
        for (let c = 0; c < width; c++) {
            const sourceRow = r1 + r;
            const sourceCol = c1 + c;
            // Check bounds just in case selection rect is somehow invalid
            if (sourceRow >= 0 && sourceRow < gridRows && sourceCol >= 0 && sourceCol < gridCols) {
                 data[r][c] = gridState[sourceRow][sourceCol];
            } else {
                 data[r][c] = defaultPixelColorIndex; // Fallback
            }
        }
    }

    selectionBuffer = { width, height, data };
    console.log(`Copied selection ${width}x${height} to buffer.`);
    return true;
}

function eraseGridArea(rect) {
    if (!rect) return false;
    const { r1, c1, r2, c2 } = rect;
    let changed = false;
    for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
            if (r >= 0 && r < gridRows && c >= 0 && c < gridCols) {
                if (gridState[r][c] !== erasePixelColorIndex) {
                    gridState[r][c] = erasePixelColorIndex;
                    changed = true;
                }
            }
        }
    }
     console.log(`Erased grid area R(${r1}-${r2}), C(${c1}-${c2})`);
     return changed;
}

function pasteBufferToGrid(targetTopRow, targetLeftCol) {
    if (!selectionBuffer) return false;

    const { width, height, data } = selectionBuffer;
    let changed = false;

    for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
            const targetRow = targetTopRow + r;
            const targetCol = targetLeftCol + c;

            if (targetRow >= 0 && targetRow < gridRows && targetCol >= 0 && targetCol < gridCols) {
                if (gridState[targetRow][targetCol] !== data[r][c]) {
                     gridState[targetRow][targetCol] = data[r][c];
                     changed = true;
                }
            }
        }
    }
    console.log(`Pasted buffer ${width}x${height} at (${targetTopRow}, ${targetLeftCol})`);
    return changed;
}
// --- End Selection Utilities ---

// --- Preview Drawing ---
function eraseAreaOnPreview(rect) {
    if (!rect) return;
    const { r1, c1, r2, c2 } = rect;
    previewCtx.fillStyle = palette[erasePixelColorIndex];
    for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
            if (r >= 0 && r < gridRows && c >= 0 && c < gridCols) {
                const x = spacing + c * (pixelSize + spacing);
                const y = spacing + r * (pixelSize + spacing);
                previewCtx.fillRect(x, y, pixelSize, pixelSize);
            }
        }
    }
}

function drawPreviewSelection(r1, c1, r2, c2) {
    // clearPreviewCanvas(); // REMOVED: Clearing is handled by caller

    const minR = Math.min(r1, r2);
    const maxR = Math.max(r1, r2);
    const minC = Math.min(c1, c2);
    const maxC = Math.max(c1, c2);

    // Calculate pixel coordinates for the rectangle corners
    const startX = spacing + minC * (pixelSize + spacing);
    const startY = spacing + minR * (pixelSize + spacing);
    const width = (maxC - minC + 1) * (pixelSize + spacing);
    const height = (maxR - minR + 1) * (pixelSize + spacing);

    // Draw a dashed rectangle (marching ants effect is more complex)
    previewCtx.strokeStyle = 'black';
    previewCtx.lineWidth = 1;
    previewCtx.setLineDash([4, 2]); // Dashed line pattern
    previewCtx.strokeRect(startX - spacing/2, startY - spacing/2, width, height);
    previewCtx.setLineDash([]); // Reset line dash
}

function drawBufferOnPreview(targetTopRow, targetLeftCol) {
    if (!selectionBuffer) return;
    const { width, height, data } = selectionBuffer;

    for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
            const pixelIndex = data[r][c];
            const color = palette[pixelIndex];
            const x = spacing + (targetLeftCol + c) * (pixelSize + spacing);
            const y = spacing + (targetTopRow + r) * (pixelSize + spacing);

            // Basic check to avoid drawing outside canvas bounds if buffer is moved partially off
             if (targetTopRow + r >= 0 && targetTopRow + r < gridRows && targetLeftCol + c >= 0 && targetLeftCol + c < gridCols) {
                 previewCtx.fillStyle = color;
                 previewCtx.fillRect(x, y, pixelSize, pixelSize);
             }
        }
    }
}

function drawPreviewShape(r1, c1, r2, c2, tool) {
    // clearPreviewCanvas(); // REMOVED: Clearing is handled by caller
    previewCtx.fillStyle = palette[selectedColorIndex];

    let pixels = [];
    if (tool === 'line') {
        pixels = getLinePixels(r1, c1, r2, c2);
    } else if (tool === 'rectangle') {
        pixels = getRectanglePixels(r1, c1, r2, c2);
    } else if (tool === 'circle') {
        pixels = getCirclePixels(r1, c1, r2, c2);
    }

    // Draw the pixels on the preview canvas
    pixels.forEach(([r, c]) => {
        const x = spacing + c * (pixelSize + spacing);
        const y = spacing + r * (pixelSize + spacing);
        previewCtx.fillRect(x, y, pixelSize, pixelSize);
    });
}
// --- End Preview Drawing ---

// Flag to track if any pixel was actually changed during a mousedown/drag operation
let changeOccurred = false;

canvas.addEventListener('mousedown', (event) => {
    changeOccurred = false;
    lastPixelCoords = null;
    const coords = getPixelCoords(event);
    if (!coords) return;

    const { row, col } = coords;
    shapeStartX = col;
    shapeStartY = row;
    isDrawingShape = false;
    isDefiningSelection = false;
    isMovingSelection = false; // Reset move flag

    // --- Tool Specific Logic ---
    if (currentTool === 'pencil') {
         isDrawingShape = false; // Pencil doesn't draw shapes
         // ... (existing pencil logic: shift+click and drag start)
         // ... (ensure history is saved here for pencil actions) ...
         if (shiftKeyPressed && lastClickCoords) {
            // Pencil Shift+Click Line
            isDragging = false;
            if (history.length >= MAX_HISTORY) { history.shift(); }
            history.push(deepCopyGrid(gridState));
            if (drawLineBetweenPixels(lastClickCoords.row, lastClickCoords.col, row, col, 'draw')) {
                changeOccurred = true;
            }
            if (!changeOccurred && history.length > 0) { history.pop(); }
            lastClickCoords = { row, col };
         } else {
            // Pencil Click/Drag Start
            isDragging = true;
            if (history.length >= MAX_HISTORY) { history.shift(); }
            history.push(deepCopyGrid(gridState));
            currentDragMode = (gridState[row][col] === selectedColorIndex) ? 'erase' : 'draw';
            if (handlePixelChange(row, col, currentDragMode)) {
                 changeOccurred = true;
            }
            lastPixelCoords = { row, col };
            lastClickCoords = { row, col };
        }
    } else if (currentTool === 'bucket') {
        isDrawingShape = false;
        isDragging = false;
        if (floodFill(row, col, selectedColorIndex)) {
            changeOccurred = true;
        }
        lastClickCoords = { row, col };
    } else if (['line', 'rectangle', 'circle'].includes(currentTool)) {
        isDrawingShape = true;
        isDragging = true; // Use isDragging to indicate shape drawing is active
         // Save state *before* shape drawing starts
         if (history.length >= MAX_HISTORY) { history.shift(); }
         history.push(deepCopyGrid(gridState));
         console.log(`Starting shape: ${currentTool}`);
         lastClickCoords = { row, col }; // Update last click
    } else if (currentTool === 'select') {
        if (selectionRect && isInsideRect(row, col, selectionRect)) {
            // --- Start Moving Selection --- 
            isMovingSelection = true;
            isDragging = true; // Use isDragging for move events
            moveStartCoords = { row, col };
            // Calculate offset from top-left corner of selection
            moveOffset = { dr: row - selectionRect.r1, dc: col - selectionRect.c1 };

            copySelectionToBuffer(); // Copy data for the move

            // Save state *before* move starts (for undo)
            if (history.length >= MAX_HISTORY) { history.shift(); }
            history.push(deepCopyGrid(gridState));
            console.log("Starting selection move.");
            // No change yet, changeOccurred = false
            // --- End Start Moving --- 
        } else {
             // --- Start Defining Selection --- 
            clearPreviewCanvas(); // Clear previous selection outline if any
            selectionRect = null; // Clear existing selection
            selectionBuffer = null; // Clear buffer if starting new selection
            isDefiningSelection = true;
            isDragging = true;
            console.log("Starting selection definition.");
            // --- End Start Defining --- 
        }
        lastClickCoords = { row, col };
    } else {
        console.warn(`Tool not implemented: ${currentTool}`);
        isDrawingShape = false;
        isDragging = false;
        lastClickCoords = { row, col };
    }
    // --- End Tool Specific Logic ---
});

canvas.addEventListener('mousemove', (event) => {
    if (isDragging) {
        const coords = getPixelCoords(event);
        if (!coords) return;
        const { row, col } = coords;

        if (currentTool === 'pencil') {
            // --- Pencil Drag Logic --- 
             if (lastPixelCoords && (coords.row !== lastPixelCoords.row || coords.col !== lastPixelCoords.col)) {
                if (drawLineBetweenPixels(lastPixelCoords.row, lastPixelCoords.col, row, col, currentDragMode)) {
                    changeOccurred = true;
                }
            } else if (!lastPixelCoords) {
                 // Safety net if mousedown didn't set lastPixelCoords
                 if (handlePixelChange(row, col, currentDragMode)){
                     changeOccurred = true;
                 }
            }
            lastPixelCoords = { row: row, col: col };
            // --- End Pencil Drag --- 
        } else if (isDrawingShape && ['line', 'rectangle', 'circle'].includes(currentTool)) {
            // --- Shape Preview Logic --- 
            clearPreviewCanvas(); // Clear before drawing shape preview
            drawPreviewShape(shapeStartY, shapeStartX, row, col, currentTool);
             // lastPixelCoords is not needed here, we use shapeStartX/Y and current coords
            // --- End Shape Preview --- 
        } else if (isDefiningSelection && currentTool === 'select') {
            // --- Selection Preview --- 
            clearPreviewCanvas(); // <<<< ADD THIS LINE BACK HERE
            drawPreviewSelection(shapeStartY, shapeStartX, row, col);
            // --- End Selection Preview --- 
        } else if (isMovingSelection && currentTool === 'select') {
             // --- Selection Move Preview --- 
             if (selectionBuffer && moveOffset && selectionRect) { // Ensure selectionRect exists
                const newTopLeftRow = row - moveOffset.dr;
                const newTopLeftCol = col - moveOffset.dc;

                clearPreviewCanvas();
                // Erase the *original* selection area on the preview first
                eraseAreaOnPreview(selectionRect);

                // Draw buffer content at new position
                drawBufferOnPreview(newTopLeftRow, newTopLeftCol);

                // Draw selection outline at new position
                const r2 = newTopLeftRow + selectionBuffer.height - 1;
                const c2 = newTopLeftCol + selectionBuffer.width - 1;
                drawPreviewSelection(newTopLeftRow, newTopLeftCol, r2, c2);
             }
             // --- End Move Preview --- 
        }
    }
});

canvas.addEventListener('mouseup', (event) => {
    if (isDragging) {
        let finalizeAction = false;
        let actionMadeChange = false; // Track if the finalized action modified gridState

        if (isDrawingShape && ['line', 'rectangle', 'circle'].includes(currentTool)) {
            // --- Finalize Shape Drawing --- 
            const coords = getPixelCoords(event); // Need end coords from event
            if (coords && shapeStartX !== null && shapeStartY !== null) {
                 const { row, col } = coords;
                 let pixels = [];
                 if (currentTool === 'line') {
                    pixels = getLinePixels(shapeStartY, shapeStartX, row, col);
                 } else if (currentTool === 'rectangle') {
                    pixels = getRectanglePixels(shapeStartY, shapeStartX, row, col);
                 } else if (currentTool === 'circle') {
                    pixels = getCirclePixels(shapeStartY, shapeStartX, row, col);
                 }

                 if (applyPixelsToGrid(pixels, selectedColorIndex)) {
                    changeOccurred = true; // Mark change
                    drawGrid(); // Redraw main canvas with the final shape
                    console.log(`Shape ${currentTool} finalized.`);
                 } else {
                     // If applyPixelsToGrid didn't change anything (e.g., single point shape?)
                     console.log("Shape resulted in no change.");
                     changeOccurred = false; // Ensure flag is false if no change
                 }
            }
            // --- End Finalize Shape --- 
             actionMadeChange = changeOccurred;
             finalizeAction = true; // A shape was potentially drawn
        } else if (isDefiningSelection && currentTool === 'select') {
            // --- Finalize Selection --- 
            const coords = getPixelCoords(event);
            if (coords && shapeStartX !== null && shapeStartY !== null) {
                 const { row, col } = coords;
                 // Ensure r1 <= r2 and c1 <= c2
                 const r1 = Math.min(shapeStartY, row);
                 const c1 = Math.min(shapeStartX, col);
                 const r2 = Math.max(shapeStartY, row);
                 const c2 = Math.max(shapeStartX, col);

                 // Ignore tiny selections (optional)
                 if (r1 === r2 && c1 === c2) {
                     console.log("Selection too small, cancelled.");
                     selectionRect = null;
                     clearPreviewCanvas();
                 } else {
                     selectionRect = { r1, c1, r2, c2 };
                     console.log(`Selection finalized: R(${r1}-${r2}), C(${c1}-${c2})`);
                     // Draw persistent selection outline
                     drawPreviewSelection(r1, c1, r2, c2);
                     // TODO: Copy data to buffer later
                 }
            } else {
                // Click without drag, or invalid coords?
                selectionRect = null;
                clearPreviewCanvas();
            }
            finalizeAction = true; // Selection action attempted
             // --- End Finalize Selection --- 
        } else if (isMovingSelection && currentTool === 'select') {
            // --- Finalize Selection Move --- 
            clearPreviewCanvas();
            const coords = getPixelCoords(event);
            if (coords && selectionBuffer && moveOffset) {
                 const { row, col } = coords;
                 const finalTopLeftRow = row - moveOffset.dr;
                 const finalTopLeftCol = col - moveOffset.dc;

                 // Erase the original area
                 const eraseChanged = eraseGridArea(selectionRect);
                 // Paste the buffer at the new location
                 const pasteChanged = pasteBufferToGrid(finalTopLeftRow, finalTopLeftCol);

                 if (eraseChanged || pasteChanged) {
                    actionMadeChange = true;
                    drawGrid(); // Redraw main canvas only if changes were made
                 }

                 // Update selectionRect to the new position
                 selectionRect = {
                    r1: finalTopLeftRow,
                    c1: finalTopLeftCol,
                    r2: finalTopLeftRow + selectionBuffer.height - 1,
                    c2: finalTopLeftCol + selectionBuffer.width - 1
                 };
                 // Redraw the persistent selection outline at the new position
                 drawPreviewSelection(selectionRect.r1, selectionRect.c1, selectionRect.r2, selectionRect.c2);
                 console.log(`Selection moved to R(${selectionRect.r1}-${selectionRect.r2}), C(${selectionRect.c1}-${selectionRect.c2})`);
            }
            finalizeAction = true;
            // --- End Finalize Move --- 
        } else if (currentTool === 'pencil') {
            actionMadeChange = changeOccurred;
            finalizeAction = true;
        } else if (currentTool === 'bucket') {
            // Bucket finalize logic might need checking if floodFill returned true
             actionMadeChange = changeOccurred; // Assuming changeOccurred was set by floodFill
             finalizeAction = true;
        }

        // --- General Drag/Shape/Selection End Cleanup --- 
        isDragging = false;
        isDrawingShape = false;
        isDefiningSelection = false;
        isMovingSelection = false; // Reset move flag
        shapeStartX = null;
        shapeStartY = null;
        lastPixelCoords = null;
        currentDragMode = null;
        moveStartCoords = null; // Reset move coords
        moveOffset = null;

        // History pop logic
        if (finalizeAction && !actionMadeChange && history.length > 0) {
             // If an action started (history pushed) but didn't change the grid,
             // pop the state saved at mousedown
             history.pop();
             console.log(`Action finalized with no change, removed saved state.`);
        }
        console.log("Action stopped (mouseup).");
        changeOccurred = false; // Reset for next action
    }
});

canvas.addEventListener('mouseleave', (event) => {
     clearPreviewCanvas();
    if (isDragging) {
        if (isMovingSelection) {
            console.log("Selection move cancelled (mouse left).");
            changeOccurred = false; // No change was finalized
            // IMPORTANT: Need to restore the original state from history here
            // because the buffer was copied but not pasted back.
             if (history.length > 0) {
                gridState = history.pop(); // Restore the state saved before move started
                drawGrid(); // Redraw the restored state
                 console.log(`Restored state from history (move cancelled). History size: ${history.length}`);
             } else {
                 console.warn("Cannot restore state on move cancel, history empty!");
             }
             // Redraw old selection outline if needed?
             if (selectionRect) {
                 drawPreviewSelection(selectionRect.r1, selectionRect.c1, selectionRect.r2, selectionRect.c2);
             }

        } else if (isDefiningSelection || isDrawingShape) {
             console.log("Action cancelled (mouse left).");
             changeOccurred = false;
             // Pop history if shape/selection definition started
             if (history.length > 0) {
                 // Should only pop if history was pushed for *this* action
                 // This logic assumes the last history item is always the relevant one
                 history.pop();
                 console.log(`Removed history state (action cancelled). History size: ${history.length}`);
             }
        }

        isDragging = false;
        isDrawingShape = false;
        isDefiningSelection = false;
        isMovingSelection = false; // Reset move flag
        shapeStartX = null;
        shapeStartY = null;
        lastPixelCoords = null;
        currentDragMode = null;
        moveStartCoords = null; // Reset move coords
        moveOffset = null;
        selectionBuffer = null; // Clear buffer on cancel

        // General history pop check (redundant? covered above)
        // if (!changeOccurred && history.length > 0) { history.pop(); ... }
        changeOccurred = false;
        console.log("Action stopped (mouse left canvas).");
    }
});

// --- Keyboard Listeners ---
document.addEventListener('keydown', (event) => {

    // --- Undo Logic (Check this FIRST, as it requires modifiers) ---
    const isUndo = (event.metaKey || event.ctrlKey) && event.key === 'z';
    if (isUndo) {
         event.preventDefault(); // Prevent browser's default undo behavior
         if (isDragging) return; // Don't allow undo while dragging/shaping
 
         if (history.length > 0) {
             gridState = history.pop(); // Restore the previous state
             drawGrid(); // Redraw the entire grid with the restored state
             clearPreviewCanvas(); // Clear any stale previews (like selection)
             console.log(`Undo executed. History size: ${history.length}`);
         } else {
             console.log("Nothing to undo.");
         }
         return; // Stop processing if undo was handled
    }
    // --- End Undo Logic ---

    // --- Copy/Cut/Paste Logic (Requires Modifiers) ---
    const isCopy = (event.metaKey || event.ctrlKey) && event.key === 'c';
    const isCut = (event.metaKey || event.ctrlKey) && event.key === 'x';
    const isPaste = (event.metaKey || event.ctrlKey) && event.key === 'v';

    if (isCopy && currentTool === 'select' && selectionRect) {
        event.preventDefault();
        if (copySelectionToBuffer()) {
            console.log("Selection copied to buffer.");
        } else {
            console.warn("Failed to copy selection.");
        }
        // Copy doesn't modify grid, no history push, no return needed unless we want to block other actions
    }

    if (isCut && currentTool === 'select' && selectionRect) {
        event.preventDefault();
        // Save state *before* cut
        if (history.length >= MAX_HISTORY) { history.shift(); }
        history.push(deepCopyGrid(gridState));
        console.log(`State saved (Cut). History size: ${history.length}`);

        if (copySelectionToBuffer()) {
            if (eraseGridArea(selectionRect)) {
                drawGrid(); // Redraw after erasing
                // Keep selection outline visible after cut
                clearPreviewCanvas(); // Clear the selection outline
                const cutRect = selectionRect; // Store temporarily for log
                selectionRect = null; // Selection is gone from original place
                console.log(`Selection cut R(${cutRect.r1}-${cutRect.r2}), C(${cutRect.c1}-${cutRect.c2}) to buffer.`);
            } else {
                 console.warn("Failed to erase area during cut.");
                 // If erase failed, pop the history state we just pushed
                 if (history.length > 0) { history.pop(); }
            }
        } else {
            console.warn("Failed to copy selection during cut.");
             // If copy failed, pop the history state we just pushed
             if (history.length > 0) { history.pop(); }
        }
        return; // Stop processing if cut was handled
    }

    if (isPaste && selectionBuffer) { // Paste can happen regardless of current tool
        event.preventDefault();
        // Determine paste location (using lastClickCoords for now)
        let targetRow, targetCol;
        if (lastClickCoords) {
            targetRow = lastClickCoords.row;
            targetCol = lastClickCoords.col;
        } else {
            // Default to top-left if no click recorded
            targetRow = 0;
            targetCol = 0;
        }

        // Save state *before* paste
        if (history.length >= MAX_HISTORY) { history.shift(); }
        history.push(deepCopyGrid(gridState));
        console.log(`State saved (Paste). History size: ${history.length}`);

        if (pasteBufferToGrid(targetRow, targetCol)) {
            // Update selectionRect to the newly pasted area
            selectionRect = {
                r1: targetRow,
                c1: targetCol,
                r2: targetRow + selectionBuffer.height - 1,
                c2: targetCol + selectionBuffer.width - 1
            };
            drawGrid(); // Redraw after pasting
            // Draw selection outline around the pasted area
            drawPreviewSelection(selectionRect.r1, selectionRect.c1, selectionRect.r2, selectionRect.c2);
            console.log("Pasted from buffer.");
        } else {
             console.warn("Paste did not change anything.");
              // If paste failed/made no change, pop history
              if (history.length > 0) { history.pop(); }
        }
        return; // Stop processing if paste was handled
    }
    // --- End Copy/Cut/Paste --- 

    // Ignore shortcuts if other modifiers are pressed (This check must be AFTER C/X/V checks)
    if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
    }

    // Don't trigger shortcuts if focus is on an input element
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
    }

    // --- Tool Selection Shortcuts (Lowercase only, no modifiers) ---
    if (!event.shiftKey) { // Check that Shift is NOT pressed
        if (event.key === 'g') {
            event.preventDefault();
            updateSelectedTool('tool-bucket');
            return; // Handled
        }
        if (event.key === 'b' || event.key === 'p') { // Keep both b/p for pencil
            event.preventDefault();
            updateSelectedTool('tool-pencil');
            return; // Handled
        }
        if (event.key === 'l') {
            event.preventDefault();
            updateSelectedTool('tool-line');
            return; // Handled
        }
        if (event.key === 'r') {
            event.preventDefault();
            updateSelectedTool('tool-rectangle');
            return; // Handled
        }
         if (event.key === 'c') {
            event.preventDefault();
            updateSelectedTool('tool-circle');
            return; // Handled
        }
         if (event.key === 's') {
            event.preventDefault();
            updateSelectedTool('tool-select');
            return; // Handled
        }
    }
    // --- End Tool Selection Shortcuts ---

    // --- Color Selection Shortcuts (1-9, no modifiers, no shift) ---
    if (!event.shiftKey) { // Check that Shift is NOT pressed
        const keyNum = parseInt(event.key, 10);
        if (!isNaN(keyNum) && keyNum >= 1 && keyNum <= 9) {
            const colorIndex = keyNum - 1; // Map 1-9 to index 0-8
            if (colorIndex >= 0 && colorIndex < palette.length) {
                event.preventDefault(); // Prevent typing the number if used as shortcut
                selectedColorIndex = colorIndex;
                updateSelectedSwatch(selectedColorIndex); // Update UI feedback
                console.log(`Color selected via key ${keyNum}: index ${colorIndex}`);
                return; // Handled
            }
        }
    }
    // --- End Color Selection Shortcuts ---

});

// Separate listener specifically for Shift key state used in drawing logic
document.addEventListener('keydown', (event) => {
    if (event.key === 'Shift') {
        shiftKeyPressed = true;
    }
});
document.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') {
        shiftKeyPressed = false;
    }
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