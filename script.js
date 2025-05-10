const canvas = document.getElementById('mosaicCanvas');
const ctx = canvas.getContext('2d');
const previewCanvas = document.getElementById('previewCanvas');
const previewCtx = previewCanvas.getContext('2d');

// --- Grid Configuration ---
let gridRows = 200;
let gridCols = 400;
let pixelSize = 15;
let spacing = 1;
// const defaultColor = '#E0E0E0'; // Replaced by palette
// const activeColor = '#0000FF';   // Replaced by palette
const backgroundColor = '#FFFFFF'; // Canvas background, used for clearing
// --- End Grid Configuration ---

// --- Palette & State ---
let palette = [
    '#00008B', '#0000CD', '#4169E1', // Dark to Royal Blue
    '#6495ED', '#ADD8E6',            // Cornflower to Light Blue
    '#FFD700', '#EEE8AA',            // Gold, Pale Goldenrod
    '#FFFFFF', '#E0E0E0',            // White, Pale Gray
    '#FFFFFF' // Add 10th color placeholder (initially white, same as spacing)
];
const defaultPixelColorIndex = 8; // Index of default grid color (Pale Gray)
// const erasePixelColorIndex = 8;   // Index of color to use when "erasing" (Pale Gray) // REMOVED
let spacingColor = '#FFFFFF'; // NEW: Dedicated variable for spacing color

let selectedColorIndex = 0; // Default to the first color (Dark Blue)
let secondarySelectedColorIndex = 8; // NEW: Index for the secondary color, defaults to Pale Gray
let gridState = []; // 2D array to store pixel state (now stores pixel objects)
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

// --- Viewport/Panning State ---
let logicalCanvasWidth = 0; // Full width of the grid drawing area
let logicalCanvasHeight = 0; // Full height of the grid drawing area
// --- End Viewport/Panning State ---

// --- Panning State (Removing Space+Drag) ---
// let isPanModeActive = false; 
// let isPanning = false;       
// let panStart = { x: 0, y: 0 };     
// let scrollStart = { x: 0, y: 0 };  
// --- End Panning State ---

let canvasContainer = null; // Will be initialized in setup

// --- Utilities ---
function deepCopyGrid(grid) {
    // Simple deep copy for a 2D array of numbers/indexes
    // return grid.map(row => [...row]);
    // Deep copy for a 2D array of pixel objects
    return grid.map(row => row.map(pixel => ({ ...pixel })));
}

function createNewGridStateFromOld(oldData, oldRows, oldCols, newRows, newCols) {
    const newGrid = [];
    for (let r = 0; r < newRows; r++) {
        newGrid[r] = [];
        for (let c = 0; c < newCols; c++) {
            if (oldData && r < oldRows && c < oldCols) {
                // Ensure existing pixel data is copied as an object, or adapt if oldData is pre-object format
                if (typeof oldData[r][c] === 'object' && oldData[r][c] !== null) {
                    newGrid[r][c] = { ...oldData[r][c] };
                } else {
                    // If oldData was just an index, convert it to the new object structure
                    newGrid[r][c] = {
                        mainColorIndex: oldData[r][c], // Assuming old data was the color index
                        secondaryColorIndex: defaultPixelColorIndex,
                        fillStyle: 'solid'
                    };
                }
            } else {
                // newGrid[r][c] = defaultPixelColorIndex; // Initialize new pixel
                newGrid[r][c] = {
                    mainColorIndex: defaultPixelColorIndex,
                    secondaryColorIndex: defaultPixelColorIndex,
                    fillStyle: 'solid'
                };
            }
        }
    }
    return newGrid;
}
// --- End Utilities ---

// Calculate canvas size based on grid - These are now logical and handled internally
// let canvasWidth; // DELETE THIS LINE
// let canvasHeight; // DELETE THIS LINE

// Size both canvases - This is now done in reinitializeCanvasAndGrid
// canvas.width = canvasWidth;
// canvas.height = canvasHeight;
// previewCanvas.width = canvasWidth;
// previewCanvas.height = canvasHeight;

// console.log(`Main and Preview canvas size set to ${canvasWidth}x${canvasHeight}`); // Will be logged in reinitialize

// --- Initialization --- (Old function, to be removed)
/*
function initializeGridState() {
    gridState = []; 
    for (let r = 0; r < gridRows; r++) {
        gridState[r] = [];
        for (let c = 0; c < gridCols; c++) {
            gridState[r][c] = defaultPixelColorIndex; 
        }
    }
    console.log("Grid state initialized.");
}
*/
// --- End Initialization ---

// --- Drawing ---
function drawGrid() {
    if (!canvasContainer) return; // Should be initialized

    // Determine the visible portion of the logical canvas
    const viewScrollX = canvasContainer.scrollLeft;
    const viewScrollY = canvasContainer.scrollTop;
    const viewWidth = canvasContainer.clientWidth;
    const viewHeight = canvasContainer.clientHeight;

    // Fill the background of the entire logical canvas with spacingColor
    // This is still needed for the full canvas, browser clips it.
    ctx.fillStyle = spacingColor;
    ctx.fillRect(0, 0, logicalCanvasWidth, logicalCanvasHeight);

    // Calculate the range of rows and columns to draw
    const firstCol = Math.max(0, Math.floor((viewScrollX - spacing) / (pixelSize + spacing)) - 1); // -1 for buffer
    const lastCol = Math.min(gridCols - 1, Math.ceil((viewScrollX + viewWidth - spacing) / (pixelSize + spacing)) + 1); // +1 for buffer
    const firstRow = Math.max(0, Math.floor((viewScrollY - spacing) / (pixelSize + spacing)) - 1); // -1 for buffer
    const lastRow = Math.min(gridRows - 1, Math.ceil((viewScrollY + viewHeight - spacing) / (pixelSize + spacing)) + 1); // +1 for buffer

    for (let r = firstRow; r <= lastRow; r++) {
        for (let c = firstCol; c <= lastCol; c++) {
            const logicalX = spacing + c * (pixelSize + spacing);
            const logicalY = spacing + r * (pixelSize + spacing);

            // Optional: Additional check if pixel is strictly within visible rect (already covered by loop bounds usually)
            // if (logicalX + pixelSize < viewScrollX || logicalX > viewScrollX + viewWidth ||
            //     logicalY + pixelSize < viewScrollY || logicalY > viewScrollY + viewHeight) {
            //     continue;
            // }

            const pixel = gridState[r][c];
            // const colorIndex = gridState[r][c];
            // if (colorIndex >= 0 && colorIndex < 9) {
            //     ctx.fillStyle = palette[colorIndex] || palette[defaultPixelColorIndex];
            // } else {
            //     ctx.fillStyle = palette[defaultPixelColorIndex];
            // }

            // For now, always draw the mainColorIndex. Triangle logic will be added later.
            if (pixel && typeof pixel.mainColorIndex === 'number') {
                if (pixel.fillStyle === 'solid') {
                    if (pixel.mainColorIndex >= 0 && pixel.mainColorIndex < palette.length) { // Use palette.length for safety
                        ctx.fillStyle = palette[pixel.mainColorIndex];
                    } else {
                        ctx.fillStyle = palette[defaultPixelColorIndex];
                    }
                    ctx.fillRect(logicalX, logicalY, pixelSize, pixelSize);
                } else if (pixel.fillStyle && pixel.fillStyle.startsWith('triangle-')) {
                    // 1. Fill the entire pixel cell with its secondaryColorIndex.
                    if (pixel.secondaryColorIndex !== undefined && pixel.secondaryColorIndex < palette.length) {
                        ctx.fillStyle = palette[pixel.secondaryColorIndex];
                    } else {
                        ctx.fillStyle = palette[defaultPixelColorIndex]; // Fallback for safety
                    }
                    ctx.fillRect(logicalX, logicalY, pixelSize, pixelSize);

                    // 2. Then draw the triangle path with its mainColorIndex on top.
                    if (pixel.mainColorIndex >= 0 && pixel.mainColorIndex < palette.length) {
                        ctx.fillStyle = palette[pixel.mainColorIndex];
                    } else {
                        ctx.fillStyle = palette[defaultPixelColorIndex]; // Fallback for safety
                    }
                    ctx.beginPath();
                    if (pixel.fillStyle === 'triangle-tl') { // Top-left corner
                        ctx.moveTo(logicalX, logicalY); // Top-left
                        ctx.lineTo(logicalX + pixelSize, logicalY); // Top-right
                        ctx.lineTo(logicalX, logicalY + pixelSize); // Bottom-left
                    } else if (pixel.fillStyle === 'triangle-tr') { // Top-right corner
                        ctx.moveTo(logicalX, logicalY); // Top-left
                        ctx.lineTo(logicalX + pixelSize, logicalY); // Top-right
                        ctx.lineTo(logicalX + pixelSize, logicalY + pixelSize); // Bottom-right
                    } else if (pixel.fillStyle === 'triangle-bl') { // Bottom-left corner
                        ctx.moveTo(logicalX, logicalY); // Top-left
                        ctx.lineTo(logicalX, logicalY + pixelSize); // Bottom-left
                        ctx.lineTo(logicalX + pixelSize, logicalY + pixelSize); // Bottom-right
                    } else if (pixel.fillStyle === 'triangle-br') { // Bottom-right corner
                        ctx.moveTo(logicalX + pixelSize, logicalY); // Top-right
                        ctx.lineTo(logicalX + pixelSize, logicalY + pixelSize); // Bottom-right
                        ctx.lineTo(logicalX, logicalY + pixelSize); // Bottom-left
                    }
                    ctx.closePath();
                    ctx.fill();
                } else {
                    // Fallback for unknown fillStyle or malformed pixel data
                    ctx.fillStyle = palette[defaultPixelColorIndex];
                    ctx.fillRect(logicalX, logicalY, pixelSize, pixelSize);
                }
            } else {
                 // Fallback if pixel data is malformed
                ctx.fillStyle = palette[defaultPixelColorIndex];
                ctx.fillRect(logicalX, logicalY, pixelSize, pixelSize);
            }
        }
    }
    // console.log(`Drew grid for visible rows: ${firstRow}-${lastRow}, cols: ${firstCol}-${lastCol}`);
}

function clearPreviewCanvas() {
    previewCtx.clearRect(0, 0, logicalCanvasWidth, logicalCanvasHeight); // Clear entire logical preview canvas
}
// --- End Drawing ---

// --- Interaction ---
function getPixelCoords(event) {
    const rect = canvas.getBoundingClientRect(); // rect of the large, scrollable canvas

    // canvasX/Y are click coordinates relative to the top-left corner of the *entire logical canvas*
    // This is because rect.left/top are the coordinates of the visible part of the canvas relative to the viewport,
    // and event.clientX/Y are click coordinates relative to the viewport.
    // The difference gives the click position from the top-left of the (potentially scrolled) canvas element.
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;

    // Calculate column, snapping clicks in initial leading spacing to column 0
    let col = Math.floor((canvasX - spacing) / (pixelSize + spacing));
    if (spacing > 0 && canvasX >= 0 && canvasX < spacing && col === -1) {
        col = 0;
    }

    // Calculate row, snapping clicks in initial leading spacing to row 0
    let row = Math.floor((canvasY - spacing) / (pixelSize + spacing));
    if (spacing > 0 && canvasY >= 0 && canvasY < spacing && row === -1) {
        row = 0;
    }

    if (row >= 0 && row < gridRows && col >= 0 && col < gridCols) {
        let quadrant = null; // Default to null (solid fill or click on spacing/center line)

        // pixelInternalX/Y are coordinates within the "pixel+spacing" block, from 0 up to pixelSize+spacing-1
        const pixelInternalXInBlock = (canvasX - spacing) % (pixelSize + spacing);
        const pixelInternalYInBlock = (canvasY - spacing) % (pixelSize + spacing);

        // Only proceed with quadrant logic if click is ON THE PIXEL part of the block
        if (pixelInternalXInBlock < pixelSize && pixelInternalYInBlock < pixelSize) {
            const pixelInternalX = pixelInternalXInBlock; // Actual coordinate within the pixel (0 to pixelSize-1)
            const pixelInternalY = pixelInternalYInBlock; // Actual coordinate within the pixel (0 to pixelSize-1)

            if (pixelSize > 1) { // Only determine quadrant if pixel is larger than 1x1
                const halfPixelSize = pixelSize / 2;
                const isOddSize = pixelSize % 2 !== 0;

                if (isOddSize) {
                    const centerIndex = Math.floor(pixelSize / 2); // e.g., for size 3, center is 1 (0-indexed)
                    
                    // Tie-breaking logic for Half-Pixel tool when on center lines of odd-sized pixels
                    const xIsOnCenterLine = Math.abs(pixelInternalX - centerIndex) < 0.00001; // Using a small epsilon
                    const yIsOnCenterLine = Math.abs(pixelInternalY - centerIndex) < 0.00001;

                    if (xIsOnCenterLine && yIsOnCenterLine) { // Exact center
                        quadrant = 'tl'; // Tie-break to top-left
                    } else if (xIsOnCenterLine) { // On vertical center line
                        quadrant = (pixelInternalY < centerIndex) ? 'tl' : 'bl'; // Tie-break to left
                    } else if (yIsOnCenterLine) { // On horizontal center line
                        quadrant = (pixelInternalX < centerIndex) ? 'tl' : 'tr'; // Tie-break to top
                    } else { // Not on a center line, standard quadrant determination
                        if (pixelInternalX < centerIndex && pixelInternalY < centerIndex) quadrant = 'tl';
                        else if (pixelInternalX > centerIndex && pixelInternalY < centerIndex) quadrant = 'tr';
                        else if (pixelInternalX < centerIndex && pixelInternalY > centerIndex) quadrant = 'bl';
                        else if (pixelInternalX > centerIndex && pixelInternalY > centerIndex) quadrant = 'br';
                    }
                } else { // Even size (no center line issue for tie-breaking, standard logic)
                    if (pixelInternalX < halfPixelSize && pixelInternalY < halfPixelSize) {
                        quadrant = 'tl';
                    } else if (pixelInternalX >= halfPixelSize && pixelInternalY < halfPixelSize) {
                        quadrant = 'tr';
                    } else if (pixelInternalX < halfPixelSize && pixelInternalY >= halfPixelSize) {
                        quadrant = 'bl';
                    } else if (pixelInternalX >= halfPixelSize && pixelInternalY >= halfPixelSize) {
                        quadrant = 'br';
                    }
                }
            }
            // If pixelSize is 1, quadrant remains null (results in solid fill)
        }
        // If click was on spacing part of the block, quadrant also remains null

        return { row, col, quadrant };
    }
    return null; // Click is outside the grid boundaries
}

function handlePixelChange(row, col, mode, quadrant = null) { // Quadrant is still passed for potential use by Half-pixel tool
    const currentPixel = gridState[row][col];
    let changed = false;
    // Determine target color based on mode
    let targetColorIndex;
    if (mode === 'draw_primary') {
        targetColorIndex = selectedColorIndex;
    } else if (mode === 'draw_secondary') {
        targetColorIndex = secondarySelectedColorIndex;
    } else { // Fallback or other modes (e.g., a dedicated 'erase' mode if we add it later)
        targetColorIndex = selectedColorIndex; // Default to primary for safety
    }

    // Revised logic: This function will be expanded for the Half-pixel tool.
    // For now, it primarily handles solid fills. Pencil tool will always pass quadrant = null.
    // Tools (bucket, shapes) don't use quadrant and will result in solid.

    // Default to solid fill for all tools unless specific Half-pixel logic (to be added) applies.
    if (currentTool === 'tool-halfpixel' && quadrant && mode === 'draw') {
        const clickedQuadrantStyle = `triangle-${quadrant}`;
        const newMainColor = selectedColorIndex;

        const oldFillStyle = currentPixel.fillStyle;
        const oldMainColor = currentPixel.mainColorIndex;
        const oldSecondaryColor = currentPixel.secondaryColorIndex;

        if (oldFillStyle === 'solid') {
            if (oldMainColor === newMainColor) { // Solid color is already the selected color
                return false; // No change
            }
            // Applying a triangle to a solid pixel
            gridState[row][col] = {
                mainColorIndex: newMainColor,
                secondaryColorIndex: oldMainColor,  // Original solid color becomes secondary
                fillStyle: clickedQuadrantStyle
            };
            changed = true;
        } else if (oldFillStyle.startsWith('triangle-')) {
            // Pixel is already a triangle.
            const oppositeQuadrantOfOldStyle = getOppositeQuadrant(oldFillStyle);

            // No-change checks:
            if (clickedQuadrantStyle === oldFillStyle && newMainColor === oldMainColor) {
                return false; // Clicked same half, new color is same as old main color.
            }
            if (clickedQuadrantStyle === oppositeQuadrantOfOldStyle && newMainColor === oldSecondaryColor) {
                return false; // Clicked other half, new color is same as old secondary color.
            }

            let finalMainColor = newMainColor;
            let finalSecondaryColor;
            let finalFillStyle = clickedQuadrantStyle;

            if (clickedQuadrantStyle === oldFillStyle) {
                // Case 1: Clicked quadrant corresponds to the half of the primary color.
                // "replace primary with new color, keep secondary"
                finalSecondaryColor = oldSecondaryColor;
            } else if (clickedQuadrantStyle === oppositeQuadrantOfOldStyle) {
                // Case 2: Clicked quadrant corresponds to the half of the secondary color.
                // "replace secondary with new color as primary, turn former primary into secondary color"
                finalSecondaryColor = oldMainColor; 
            } else {
                // Case 3: Clicked one of the other two (adjacent) quadrants.
                // "apply triangle with new color as primary, keep former primary as new secondary"
                finalSecondaryColor = oldMainColor;
            }
            
            gridState[row][col] = {
                mainColorIndex: finalMainColor,
                secondaryColorIndex: finalSecondaryColor,
                fillStyle: finalFillStyle
            };
            changed = true;
        } else {
            // Current pixel is in an unknown state (should not happen ideally if initialized properly)
            // Or, this case could be hit if trying to apply to a non-solid, non-triangle (e.g. future patterns)
            // For now, treat as applying to a default background.
            gridState[row][col] = {
                mainColorIndex: newMainColor,
                secondaryColorIndex: defaultPixelColorIndex, 
                fillStyle: clickedQuadrantStyle
            };
            changed = true;
        }
    } else { // This case covers Pencil (quadrant = null), Bucket, Shapes, Erase for Half-pixel, etc.
        // For general solid fill, 'targetColorIndex' is already correctly set based on primary/secondary mode.
        // The half-pixel erase special case needs to ensure it uses an appropriate erase color.
        // For now, 'erase' for half-pixel means making it solid with the 'secondarySelectedColorIndex'.
        // This could be made more distinct if 'erase' should always go to defaultPixelColorIndex.
        const effectiveTargetColor = (currentTool === 'tool-halfpixel' && mode === 'erase') // 'erase' mode is specific here
                                      ? secondarySelectedColorIndex // Half-pixel erase becomes secondary color solid
                                      : targetColorIndex; // Use the mode-derived targetColorIndex
        let oldMainColor = currentPixel.mainColorIndex;
        let oldFillStyle = currentPixel.fillStyle;

        if (oldFillStyle !== 'solid' || oldMainColor !== effectiveTargetColor) {
            gridState[row][col] = {
                mainColorIndex: effectiveTargetColor,
                secondaryColorIndex: (oldFillStyle === 'solid' && oldMainColor !== effectiveTargetColor) 
                                     ? oldMainColor 
                                     : (oldFillStyle.startsWith('triangle-') ? currentPixel.secondaryColorIndex : defaultPixelColorIndex),
                fillStyle: 'solid'
            };
            changed = true;
        }
    }

    if (changed) {
        // Draw the single updated pixel immediately on the main canvas
        const logicalX = spacing + col * (pixelSize + spacing);
        const logicalY = spacing + row * (pixelSize + spacing);
        const pixelToDraw = gridState[row][col];

        if (pixelToDraw.fillStyle === 'solid') {
            // For solid pixels, just fill with their main color.
            // The overall canvas background (spacingColor) handles the rest.
            ctx.fillStyle = palette[pixelToDraw.mainColorIndex];
            ctx.fillRect(logicalX, logicalY, pixelSize, pixelSize);
        } else if (pixelToDraw.fillStyle.startsWith('triangle-')) {
            // For triangle pixels:
            // 1. Fill the entire pixel cell with its secondaryColorIndex (original solid color).
            if (pixelToDraw.secondaryColorIndex !== undefined && pixelToDraw.secondaryColorIndex < palette.length) {
                ctx.fillStyle = palette[pixelToDraw.secondaryColorIndex];
            } else {
                ctx.fillStyle = palette[defaultPixelColorIndex]; // Fallback for safety
            }
            ctx.fillRect(logicalX, logicalY, pixelSize, pixelSize);

            // 2. Then draw the triangle path with its mainColorIndex on top.
            ctx.fillStyle = palette[pixelToDraw.mainColorIndex];
            ctx.beginPath();
            if (pixelToDraw.fillStyle === 'triangle-tl') { // Top-left corner
                ctx.moveTo(logicalX, logicalY); // Top-left
                ctx.lineTo(logicalX + pixelSize, logicalY); // Top-right
                ctx.lineTo(logicalX, logicalY + pixelSize); // Bottom-left
            } else if (pixelToDraw.fillStyle === 'triangle-tr') { // Top-right corner
                ctx.moveTo(logicalX, logicalY); // Top-left
                ctx.lineTo(logicalX + pixelSize, logicalY); // Top-right
                ctx.lineTo(logicalX + pixelSize, logicalY + pixelSize); // Bottom-right
            } else if (pixelToDraw.fillStyle === 'triangle-bl') { // Bottom-left corner
                ctx.moveTo(logicalX, logicalY); // Top-left
                ctx.lineTo(logicalX, logicalY + pixelSize); // Bottom-left
                ctx.lineTo(logicalX + pixelSize, logicalY + pixelSize); // Bottom-right
            } else if (pixelToDraw.fillStyle === 'triangle-br') { // Bottom-right corner
                ctx.moveTo(logicalX + pixelSize, logicalY); // Top-right
                ctx.lineTo(logicalX + pixelSize, logicalY + pixelSize); // Bottom-right
                ctx.lineTo(logicalX, logicalY + pixelSize); // Bottom-left
            }
            ctx.closePath();
            ctx.fill();
        }
        return true;
    }
    return false;
}

function getOppositeQuadrant(fillStyle) {
    if (!fillStyle || !fillStyle.startsWith('triangle-')) return null; // Invalid input
    const quadrant = fillStyle.split('-')[1];
    switch (quadrant) {
        case 'tl': return 'triangle-br';
        case 'br': return 'triangle-tl';
        case 'tr': return 'triangle-bl';
        case 'bl': return 'triangle-tr';
        default: return null; // Should not happen with valid input
    }
}

// --- Line Drawing Utility ---
function drawLineBetweenPixels(r1, c1, r2, c2, mode) { // mode can be 'draw_primary' or 'draw_secondary'
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
        // Pass the 'mode' directly to handlePixelChange, which will select the correct color.
        // Quadrant is null for line drawing, ensuring solid pixels.
        if (handlePixelChange(currentRow, currentCol, mode, null /* force solid */)) {
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
function floodFill(startRow, startCol, fillColorIndex) { // fillColorIndex is now passed directly
    const startPixel = gridState[startRow][startCol];
    // const startColorIndex = gridState[startRow][startCol]; // Old

    // For now, flood fill only works on solid pixels of the matching mainColorIndex
    if (startPixel.fillStyle !== 'solid' || startPixel.mainColorIndex === fillColorIndex) {
        console.log("Fill condition not met (not solid or same color), skipping fill.");
        return false; // No change needed
    }
    const startMainColorIndex = startPixel.mainColorIndex;


    // Save state before filling for undo
    if (history.length >= MAX_HISTORY) {
        history.shift();
    }
    history.push(deepCopyGrid(gridState));
    console.log(`State saved (Flood Fill). History size: ${history.length}`);

    const queue = [[startRow, startCol]]; // Queue of [row, col] pairs
    let iterations = 0; // Safety break
    const maxIterations = gridRows * gridCols * 10; // Generous limit

    let pixelsChanged = 0;

    while (queue.length > 0) {
        if (iterations++ > maxIterations) {
            console.error("Flood fill iteration limit reached!");
            break;
        }

        const [row, col] = queue.shift();

        // Bounds check and color check before processing
        if (row < 0 || row >= gridRows || col < 0 || col >= gridCols ||
            gridState[row][col].fillStyle !== 'solid' || gridState[row][col].mainColorIndex !== startMainColorIndex) {
            continue;
        }

        // Change color and mark as processed (by changing color)
        // gridState[row][col] = fillColorIndex;
        gridState[row][col] = {
            mainColorIndex: fillColorIndex,
            secondaryColorIndex: defaultPixelColorIndex,
            fillStyle: 'solid'
        };
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
function applyPixelsToGrid(pixels, colorIndex) { // colorIndex is passed directly
    let changed = false;
    pixels.forEach(([r, c]) => {
        // if (gridState[r][c] !== colorIndex) {
        //     gridState[r][c] = colorIndex;
        //     changed = true;
        // }
        const currentPixel = gridState[r][c];
        if (currentPixel.fillStyle !== 'solid' || currentPixel.mainColorIndex !== colorIndex) {
            gridState[r][c] = {
                mainColorIndex: colorIndex,
                secondaryColorIndex: defaultPixelColorIndex,
                fillStyle: 'solid'
            };
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
                 data[r][c] = { ...gridState[sourceRow][sourceCol] }; // Copy the pixel object
            } else {
                 data[r][c] = {
                     mainColorIndex: defaultPixelColorIndex,
                     secondaryColorIndex: defaultPixelColorIndex,
                     fillStyle: 'solid'
                 }; // Fallback
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
                // Erasing an area makes it solid with the defaultPixelColorIndex (Pale Gray)
                if (gridState[r][c].fillStyle !== 'solid' || gridState[r][c].mainColorIndex !== defaultPixelColorIndex) {
                    gridState[r][c] = {
                        mainColorIndex: defaultPixelColorIndex,
                        secondaryColorIndex: defaultPixelColorIndex, // Reset secondary as well
                        fillStyle: 'solid'
                    };
                    changed = true;
                }
            }
        }
    }
     console.log(`Erased grid area R(${r1}-${r2}), C(${c1}-${c2}) with default color.`);
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
            const sourcePixel = data[r][c]; // This is a pixel object from the buffer

            if (targetRow >= 0 && targetRow < gridRows && targetCol >= 0 && targetCol < gridCols) {
                // if (gridState[targetRow][targetCol] !== data[r][c]) {
                //      gridState[targetRow][targetCol] = data[r][c];
                //      changed = true;
                // }
                const currentTargetPixel = gridState[targetRow][targetCol];
                // Compare objects - for now, a simple mainColorIndex and fillStyle check is enough.
                // Later, this might need a more robust comparison if secondaryColorIndex becomes important.
                if (currentTargetPixel.fillStyle !== sourcePixel.fillStyle ||
                    currentTargetPixel.mainColorIndex !== sourcePixel.mainColorIndex ||
                    (sourcePixel.fillStyle !== 'solid' && currentTargetPixel.secondaryColorIndex !== sourcePixel.secondaryColorIndex) ) {
                     gridState[targetRow][targetCol] = { ...sourcePixel }; // Paste the copied pixel object
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
    if (!rect || !canvasContainer) return;
    const { r1, c1, r2, c2 } = rect;

    const viewScrollX = canvasContainer.scrollLeft;
    const viewScrollY = canvasContainer.scrollTop;
    const viewWidth = canvasContainer.clientWidth;
    const viewHeight = canvasContainer.clientHeight;

    // Preview erase should reflect the defaultPixelColorIndex, same as eraseGridArea
    previewCtx.fillStyle = palette[defaultPixelColorIndex];
    for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
            if (r >= 0 && r < gridRows && c >= 0 && c < gridCols) {
                const logicalX = spacing + c * (pixelSize + spacing);
                const logicalY = spacing + r * (pixelSize + spacing);

                if (logicalX + pixelSize > viewScrollX && logicalX < viewScrollX + viewWidth &&
                    logicalY + pixelSize > viewScrollY && logicalY < viewScrollY + viewHeight) {
                    previewCtx.fillRect(logicalX, logicalY, pixelSize, pixelSize);
                }
            }
        }
    }
}

function drawPreviewSelection(r1, c1, r2, c2) {
    const minR = Math.min(r1, r2);
    const maxR = Math.max(r1, r2);
    const minC = Math.min(c1, c2);
    const maxC = Math.max(c1, c2);

    const logicalStartX = spacing + minC * (pixelSize + spacing);
    const logicalStartY = spacing + minR * (pixelSize + spacing);
    const logicalWidth = (maxC - minC + 1) * (pixelSize + spacing); 
    const logicalHeight = (maxR - minR + 1) * (pixelSize + spacing);

    previewCtx.strokeStyle = 'black';
    previewCtx.lineWidth = 1;
    previewCtx.setLineDash([4, 2]);
    previewCtx.strokeRect(logicalStartX - spacing/2, logicalStartY - spacing/2, logicalWidth, logicalHeight);
    previewCtx.setLineDash([]);
}

function drawBufferOnPreview(targetTopRow, targetLeftCol) {
    if (!selectionBuffer || !canvasContainer) return;
    const { width, height, data } = selectionBuffer;

    const viewScrollX = canvasContainer.scrollLeft;
    const viewScrollY = canvasContainer.scrollTop;
    const viewWidth = canvasContainer.clientWidth;
    const viewHeight = canvasContainer.clientHeight;

    for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
            const pixelIndex = data[r][c];
            const color = palette[pixelIndex];
            const logicalX = spacing + (targetLeftCol + c) * (pixelSize + spacing);
            const logicalY = spacing + (targetTopRow + r) * (pixelSize + spacing);

            if (targetTopRow + r >= 0 && targetTopRow + r < gridRows && 
                targetLeftCol + c >= 0 && targetLeftCol + c < gridCols) {
                
                if (logicalX + pixelSize > viewScrollX && logicalX < viewScrollX + viewWidth &&
                    logicalY + pixelSize > viewScrollY && logicalY < viewScrollY + viewHeight) {
                    previewCtx.fillStyle = color;
                    previewCtx.fillRect(logicalX, logicalY, pixelSize, pixelSize);
                }
            }
        }
    }
}

function drawPreviewShape(r1, c1, r2, c2, tool) {
    if (!canvasContainer) return;
    // previewCtx.fillStyle is now set by the caller (mousemove for shapes)
    // previewCtx.fillStyle = palette[selectedColorIndex]; // OLD
    let pixelsToPreview = [];
    if (tool === 'tool-line') pixelsToPreview = getLinePixels(r1, c1, r2, c2);
    else if (tool === 'tool-rectangle') pixelsToPreview = getRectanglePixels(r1, c1, r2, c2);
    else if (tool === 'tool-circle') pixelsToPreview = getCirclePixels(r1, c1, r2, c2);

    const viewScrollX = canvasContainer.scrollLeft;
    const viewScrollY = canvasContainer.scrollTop;
    const viewWidth = canvasContainer.clientWidth;
    const viewHeight = canvasContainer.clientHeight;

    pixelsToPreview.forEach(([r_coord, c_coord]) => {
        const logicalX = spacing + c_coord * (pixelSize + spacing);
        const logicalY = spacing + r_coord * (pixelSize + spacing);
        
        if (logicalX + pixelSize > viewScrollX && logicalX < viewScrollX + viewWidth &&
            logicalY + pixelSize > viewScrollY && logicalY < viewScrollY + viewHeight) {
            previewCtx.fillRect(logicalX, logicalY, pixelSize, pixelSize);
        }
    });
}
// --- End Preview Drawing ---

// Flag to track if any pixel was actually changed during a mousedown/drag operation
let changeOccurred = false;

canvas.addEventListener('mousedown', (event) => {
    const coords = getPixelCoords(event);
    changeOccurred = false;
    lastPixelCoords = null;
    if (!coords && !isDrawingShape && !isDefiningSelection && !isMovingSelection) {
        return;
    }

    if (coords) {
        shapeStartX = coords.col;
        shapeStartY = coords.row;
    } else {
        shapeStartX = null;
        shapeStartY = null;
    }

    isDrawingShape = false;
    isDefiningSelection = false;
    isMovingSelection = false;

    // Determine draw mode based on mouse button
    const isRightClick = event.button === 2;
    currentDragMode = isRightClick ? 'draw_secondary' : 'draw_primary';
    if (isRightClick) {
        event.preventDefault(); // Prevent context menu on canvas right-click
    }


    // --- Tool Specific Logic ---
    if (currentTool === 'tool-pencil') {
         isDrawingShape = false;
         if (shiftKeyPressed && lastClickCoords && coords) {
            isDragging = false;
            if (history.length >= MAX_HISTORY) { history.shift(); }
            history.push(deepCopyGrid(gridState));
            // drawLineBetweenPixels now uses currentDragMode (primary/secondary)
            if (drawLineBetweenPixels(lastClickCoords.row, lastClickCoords.col, coords.row, coords.col, currentDragMode)) {
                changeOccurred = true;
            }
            if (!changeOccurred && history.length > 0) { history.pop(); }
            lastClickCoords = { row: coords.row, col: coords.col, quadrant: coords.quadrant };
         } else if (coords) {
            isDragging = true;
            if (history.length >= MAX_HISTORY) { history.shift(); }
            history.push(deepCopyGrid(gridState));
            // handlePixelChange uses currentDragMode (primary/secondary)
            if (handlePixelChange(coords.row, coords.col, currentDragMode, null )) {
                 changeOccurred = true;
            }
            lastPixelCoords = { row: coords.row, col: coords.col, quadrant: coords.quadrant };
            lastClickCoords = { row: coords.row, col: coords.col, quadrant: coords.quadrant };
        }
    } else if (currentTool === 'tool-bucket') {
        isDrawingShape = false;
        isDragging = false;
        const fillColorForBucket = isRightClick ? secondarySelectedColorIndex : selectedColorIndex;
        if (floodFill(coords.row, coords.col, fillColorForBucket)) {
            changeOccurred = true;
        }
        lastClickCoords = { row: coords.row, col: coords.col, quadrant: coords.quadrant };
    } else if (currentTool === 'tool-halfpixel') {
        if (coords && coords.quadrant) {
            isDragging = true;
            // currentDragMode is already set to primary or secondary
            if (history.length >= MAX_HISTORY) { history.shift(); }
            history.push(deepCopyGrid(gridState));
            if (handlePixelChange(coords.row, coords.col, currentDragMode, coords.quadrant)) {
                changeOccurred = true;
            }
            lastPixelCoords = { row: coords.row, col: coords.col, quadrant: coords.quadrant };
            lastClickCoords = { row: coords.row, col: coords.col, quadrant: coords.quadrant };
        } else {
            isDragging = false;
        }
    } else if (['tool-line', 'tool-rectangle', 'tool-circle'].includes(currentTool)) {
        isDrawingShape = true;
        isDragging = true; 
         if (history.length >= MAX_HISTORY) { history.shift(); }
         history.push(deepCopyGrid(gridState));
         console.log(`Starting shape: ${currentTool} with ${currentDragMode}`);
         lastClickCoords = { row: coords.row, col: coords.col, quadrant: coords.quadrant };
    } else if (currentTool === 'tool-select') {
        if (selectionRect && isInsideRect(coords.row, coords.col, selectionRect)) {
            // --- Start Moving Selection --- 
            isMovingSelection = true;
            isDragging = true; // Use isDragging for move events
            moveStartCoords = { row: coords.row, col: coords.col };
            // Calculate offset from top-left corner of selection
            moveOffset = { dr: coords.row - selectionRect.r1, dc: coords.col - selectionRect.c1 };

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
        lastClickCoords = { row: coords.row, col: coords.col, quadrant: coords.quadrant };
    } else {
        console.warn(`Mousedown: Tool not implemented or unrecognized: ${currentTool}`);
        isDrawingShape = false;
        isDragging = false;
        if(coords) { // Set lastClickCoords even for unimplemented tools if coords exist
            lastClickCoords = { row: coords.row, col: coords.col, quadrant: coords.quadrant };
        } else {
            lastClickCoords = null;
        }
    }
    // --- End Tool Specific Logic ---
});

// Prevent context menu on canvas right-click to allow secondary color usage
canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
});

canvas.addEventListener('mousemove', (event) => {
    if (isDragging) {
        const coords = getPixelCoords(event);
        if (!coords) return;
        const { row, col, quadrant } = coords;

        if (currentTool === 'tool-pencil') {
            const lastRow = lastPixelCoords.row;
            const lastCol = lastPixelCoords.col;

            if (row !== lastRow || col !== lastCol) {
                // drawLineBetweenPixels uses currentDragMode (set on mousedown)
                if (drawLineBetweenPixels(lastRow, lastCol, row, col, currentDragMode)) {
                    changeOccurred = true;
                }
            } else {
                 // Still within the SAME pixel cell
                 // For pencil, only the first click (mousedown) or crossing into a new cell changes pixel.
                 // Dragging within the same cell with pencil (solid mode) doesn't re-apply.
            }
            lastPixelCoords = { row, col, quadrant };
        } else if (isDrawingShape && ['tool-line', 'tool-rectangle', 'tool-circle'].includes(currentTool)) {
            clearPreviewCanvas();
            // Preview should also reflect primary/secondary color choice
            const previewColorForShape = currentDragMode === 'draw_secondary' ? secondarySelectedColorIndex : selectedColorIndex;
            // Temporarily set previewCtx.fillStyle for drawPreviewShape
            const originalFillStyle = previewCtx.fillStyle; // Save it
            previewCtx.fillStyle = palette[previewColorForShape];
            drawPreviewShape(shapeStartY, shapeStartX, row, col, currentTool);
            previewCtx.fillStyle = originalFillStyle; // Restore it
        } else if (isDefiningSelection && currentTool === 'tool-select') {
            // --- Selection Preview --- 
            clearPreviewCanvas(); // <<<< ADD THIS LINE BACK HERE
            drawPreviewSelection(shapeStartY, shapeStartX, row, col);
            // --- End Selection Preview --- 
        } else if (isMovingSelection && currentTool === 'tool-select') {
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
        } else if (currentTool === 'tool-halfpixel') {
            if (coords && coords.quadrant) { // Ensure new coords and quadrant are valid
                // Only act if pixel or quadrant changes. Half-pixel tool affects one pixel at a time.
                if (coords.row !== lastPixelCoords.row || 
                    coords.col !== lastPixelCoords.col || 
                    coords.quadrant !== lastPixelCoords.quadrant) {
                    
                    // Call handlePixelChange for the new pixel/quadrant.
                    // History was pushed on mousedown. Each step modifies that state.
                    if (handlePixelChange(coords.row, coords.col, 'draw', coords.quadrant)) {
                        changeOccurred = true; // A change was made in this step
                    } else {
                        // Even if this specific step didn't change the pixel (e.g. target same as current state for this new pixel/quadrant),
                        // if an earlier step in this drag sequence *did* make a change, we want to keep changeOccurred true.
                        // changeOccurred remains as it was if this step made no change.
                    }
                }
                lastPixelCoords = { row: coords.row, col: coords.col, quadrant: coords.quadrant };
            }
        }
    }
});

canvas.addEventListener('mouseup', (event) => {
    if (isDragging) {
        let finalizeAction = false;
        let actionMadeChange = false; // Track if the finalized action modified gridState

        if (isDrawingShape && ['tool-line', 'tool-rectangle', 'tool-circle'].includes(currentTool)) {
            // --- Finalize Shape Drawing --- 
            const coords = getPixelCoords(event); // Need end coords from event
            if (coords && shapeStartX !== null && shapeStartY !== null) {
                 const { row, col } = coords;
                 let pixels = [];
                 if (currentTool === 'tool-line') {
                    pixels = getLinePixels(shapeStartY, shapeStartX, row, col);
                 } else if (currentTool === 'tool-rectangle') {
                    pixels = getRectanglePixels(shapeStartY, shapeStartX, row, col);
                 } else if (currentTool === 'tool-circle') {
                    pixels = getCirclePixels(shapeStartY, shapeStartX, row, col);
                 }

                 const colorForShape = currentDragMode === 'draw_secondary' ? secondarySelectedColorIndex : selectedColorIndex;
                 if (applyPixelsToGrid(pixels, colorForShape)) {
                    changeOccurred = true; // Mark change
                    drawGrid(); // Redraw main canvas with the final shape
                    console.log(`Shape ${currentTool} finalized with ${currentDragMode}.`);
                 } else {
                     // If applyPixelsToGrid didn't change anything (e.g., single point shape?)
                     console.log("Shape resulted in no change.");
                     changeOccurred = false; // Ensure flag is false if no change
                 }
            }
            // --- End Finalize Shape --- 
             actionMadeChange = changeOccurred;
             finalizeAction = true; // A shape was potentially drawn
        } else if (isDefiningSelection && currentTool === 'tool-select') {
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
        } else if (isMovingSelection && currentTool === 'tool-select') {
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
        } else if (currentTool === 'tool-pencil') {
            actionMadeChange = changeOccurred;
            finalizeAction = true;
        } else if (currentTool === 'tool-bucket') {
            // Bucket finalize logic might need checking if floodFill returned true
             actionMadeChange = changeOccurred; // Assuming changeOccurred was set by floodFill
             finalizeAction = true;
        } else if (currentTool === 'tool-halfpixel') {
            // For half-pixel, the action is considered finalized if dragging occurred.
            // changeOccurred reflects if any pixel state actually changed during the mousedown/drag sequence.
            actionMadeChange = changeOccurred;
            finalizeAction = true; // A half-pixel interaction was attempted.
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
    if (isDragging) { // This is for tool drags, not panning drag
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
         event.preventDefault(); // Prevent browser's default undo behavior (e.g., for focused inputs)
         
         // If an input field is focused, blur it to ensure our undo takes full control
         if (document.activeElement && 
             (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
             document.activeElement.blur();
         }

         if (isDragging) return; 
 
         if (history.length > 0) {
             const previousState = history.pop(); 

             // Check if this state includes full grid configuration
             if (previousState.config) {
                 console.log("Undo: Restoring previous grid configuration.");
                 gridState = previousState.grid; 

                 gridRows = previousState.config.rows;
                 gridCols = previousState.config.cols;
                 pixelSize = previousState.config.pixelSize;
                 spacing = previousState.config.spacing;

                 // Update UI input fields (ensure these elements exist)
                 const psInput = document.getElementById('pixelSizeInput');
                 if (psInput) psInput.value = pixelSize;
                 const spInput = document.getElementById('spacingInput');
                 if (spInput) spInput.value = spacing;
                 const grInput = document.getElementById('gridRowsInput');
                 if (grInput) grInput.value = gridRows;
                 const gcInput = document.getElementById('gridColsInput');
                 if (gcInput) gcInput.value = gridCols;

                 if (previousState.pal) {
                     palette = previousState.pal;
                     palette.forEach((color, index) => {
                         if (index < 9) {
                             const swatch = document.getElementById(`color-${index}`);
                             if (swatch) swatch.style.backgroundColor = color;
                         }
                     });
                 }
                 if (typeof previousState.spacingColor !== 'undefined') {
                     spacingColor = previousState.spacingColor;
                     const spacingSwatch = document.getElementById('color-9');
                     if (spacingSwatch) spacingSwatch.style.backgroundColor = spacingColor;
                 }

                 console.log("[UNDO_CONFIG] Globals restored. pixelSize:", pixelSize, "gridRows:", gridRows);
                 console.log("[UNDO_CONFIG] gridState[0][0] should be from previousState:", gridState[0] && gridState[0][0] ? gridState[0][0].mainColorIndex : 'N/A');
                 console.log("[UNDO_CONFIG] previousState.config.pixelSize:", previousState.config.pixelSize, "previousState.config.rows:", previousState.config.rows);

                 reinitializeCanvasAndGrid(deepCopyGrid(gridState), previousState.config);

             } else {
                 // Standard undo for drawing actions, direct palette changes, or direct spacing color changes
                 console.log("Undo: Restoring previous drawing/palette/spacing state.");

                 if (Array.isArray(previousState)) {
                     // This was a simple drawing action, previousState is the grid itself
                     gridState = previousState; 
                 } else if (previousState.grid) {
                     // This was a palette or spacing color change, or another complex state
                     gridState = previousState.grid; // Restore grid
                     if (previousState.pal) {
                         palette = previousState.pal;
                         palette.forEach((color, index) => {
                             if (index < 9) {
                                 const swatch = document.getElementById(`color-${index}`);
                                 if (swatch) swatch.style.backgroundColor = color;
                             }
                         });
                         console.log("Restored palette state.");
                     }
                     // Use previousState.spacingColor consistent with how config history saves it
                     if (typeof previousState.spacingColor !== 'undefined') { 
                         spacingColor = previousState.spacingColor;
                         const spacingSwatch = document.getElementById('color-9');
                         if (spacingSwatch) spacingSwatch.style.backgroundColor = spacingColor;
                         console.log("Restored spacing color state.");
                     } else if (typeof previousState.spacing !== 'undefined') { // Fallback for older history items
                         spacingColor = previousState.spacing;
                         const spacingSwatch = document.getElementById('color-9');
                         if (spacingSwatch) spacingSwatch.style.backgroundColor = spacingColor;
                         console.log("Restored spacing color state (using fallback .spacing).");
                     }
                 } else {
                     // Should not happen if history is pushed correctly, but as a fallback:
                     console.warn("Undo: Encountered unknown history state type.");
                     // Potentially try to restore gridState if previousState itself seems like a grid
                     // For now, do nothing more to avoid errors.
                 }
                 drawGrid(); // Redraw the main canvas for non-config changes
             }
             clearPreviewCanvas();
             if (selectionRect) {
                 drawPreviewSelection(selectionRect.r1, selectionRect.c1, selectionRect.r2, selectionRect.c2);
             }
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

    if (isCopy && currentTool === 'tool-select' && selectionRect) {
        event.preventDefault();
        if (copySelectionToBuffer()) {
            console.log("Selection copied to buffer.");
        } else {
            console.warn("Failed to copy selection.");
        }
        // Copy doesn't modify grid, no history push, no return needed unless we want to block other actions
    }

    if (isCut && currentTool === 'tool-select' && selectionRect) {
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
        if (event.key === 't') { // New shortcut for Half-pixel tool
            event.preventDefault();
            updateSelectedTool('tool-halfpixel');
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

    // --- Shift Key State ---
    if (event.key === 'Shift') {
        shiftKeyPressed = true;
    }
    // --- End Shift Key State ---
});

document.addEventListener('keyup', (event) => {
    // --- Shift Key State ---
    if (event.key === 'Shift') {
        shiftKeyPressed = false;
    }
    // --- End Shift Key State ---
});

// --- Window Blur Event ---
window.addEventListener('blur', () => {
    shiftKeyPressed = false;
});

// Function to determine appropriate cursor (KEEPING)
function determineCursorForCurrentTool() {
    if (currentTool === 'tool-pencil' || currentTool === 'tool-line' || currentTool === 'tool-rectangle' || currentTool === 'tool-circle') { // UPDATED
        return 'crosshair';
    }
    // Add other tools if they need specific cursors, e.g.:
    // if (currentTool === 'tool-bucket') return 'url(bucket.cur), default'; 
    // if (currentTool === 'tool-select') return 'default'; // Or 'move' if over selection
    return 'default'; // Default cursor
}

// --- End Keyboard Listeners ---

// --- UI Interaction (Options Panel) ---
// Need access to updateSelectedSwatch/Tool, so declare them outside if possible or pass reference
// For simplicity, keep them nested for now, but ensure setupOptionsPanel is called first.
let updateSelectedSwatch = () => {}; // Placeholder
let updateSelectedTool = () => {};   // Placeholder
let updateSecondarySwatchVisuals = () => {}; // Placeholder for secondary color visuals

let activeColorPickerIndex = -1; // Track which swatch is being edited
let currentPickerInstance = null; // Hold the current picker instance

function setupOptionsPanel() {
    const toolButtons = document.querySelectorAll('.tool-options button');
    const colorSwatches = document.querySelectorAll('.color-options .color-swatch:not(#color-9)'); // Select palette swatches 0-8
    const spacingSwatchElement = document.getElementById('color-9'); // Get spacing swatch directly
    const toolSpecificOptionsPanel = document.getElementById('tool-specific-options-panel');
    const pencilOptionsDiv = document.getElementById('pencil-options');
    // const triangleModeCheckbox = document.getElementById('triangleModeCheckbox'); // Reference REMOVED

    // Initialization of isTriangleModeEnabled REMOVED

    updateSelectedSwatch = (newIndex) => {
        // Remove selected class from previously selected swatch
        const oldSelected = document.querySelector('.color-options .color-swatch.selected');
        if (oldSelected) {
            oldSelected.classList.remove('selected');
        }
        // Add selected class to the new swatch
        const newSelectedSwatch = document.getElementById(`color-${newIndex}`);
        if (newSelectedSwatch) {
            newSelectedSwatch.classList.add('selected');
        }
        // console.log(`Color ${newIndex} (${palette[newIndex]}) selected.`); // Log moved to keydown/click handlers
    };

    updateSecondarySwatchVisuals = (newIndex) => {
        // Remove secondary-selected class from all swatches
        document.querySelectorAll('.color-options .color-swatch.secondary-selected').forEach(s => {
            s.classList.remove('secondary-selected');
        });
        // Add secondary-selected class to the new secondary swatch
        const newSecondarySelectedSwatch = document.getElementById(`color-${newIndex}`);
        if (newSecondarySelectedSwatch) {
            newSecondarySelectedSwatch.classList.add('secondary-selected');
        }
    };

    updateSelectedTool = (newToolId) => {
        // Remove selected class from all tool buttons
        toolButtons.forEach(btn => btn.classList.remove('selected'));
        // Add selected class to the clicked button
        const selectedButton = document.getElementById(newToolId);
        if (selectedButton) {
            selectedButton.classList.add('selected');
        }
        currentTool = newToolId; // Store the full ID, don't replace 'tool-'
        console.log(`Tool selected: ${currentTool}`);

        // Show/hide pencil-specific options
        if (toolSpecificOptionsPanel && pencilOptionsDiv) {
            if (currentTool === 'pencil') {
                toolSpecificOptionsPanel.style.display = 'block';
                pencilOptionsDiv.style.display = 'block';
            } else {
                // Hide pencil options if another tool is selected
                pencilOptionsDiv.style.display = 'none';
                // Hide the whole panel if no tool has specific options visible
                // For now, only pencil has options, so we can hide the parent panel directly.
                // If other tools get options, this logic needs to be more nuanced.
                toolSpecificOptionsPanel.style.display = 'none';
            }
        }

        // Update canvas cursor based on the new tool (removed isPanModeActive check)
        canvas.style.cursor = determineCursorForCurrentTool();
    };

    toolButtons.forEach(button => {
        button.addEventListener('click', () => {
            updateSelectedTool(button.id);
        });
    });

    // Setup palette color swatches (0-8)
    colorSwatches.forEach((swatch, index) => {
        // This loop now correctly handles index 0-8 for the palette
        swatch.style.backgroundColor = palette[index];

        const openPickerHandler = (event) => {
            event.preventDefault(); // ADDED: Attempt to prevent default dblclick text selection
            const indexToEdit = index; 
            activeColorPickerIndex = indexToEdit;
            
            const paletteStateAtPickerOpen = [...palette]; 
            const originalColorOfThisSwatch = palette[indexToEdit]; 
            let pickerWasFinalized = false;

            console.log(`Opening picker for palette index ${indexToEdit}, color ${originalColorOfThisSwatch}`);
            if (currentPickerInstance) { currentPickerInstance.destroy(); } 
            currentPickerInstance = new Picker({
               parent: swatch, popup: 'top', color: originalColorOfThisSwatch,
               alpha: false, editor: true, editorFormat: 'hex',
               onChange: function(newColor) {
                   const hexColor = newColor.hex.substring(0, 7);
                   if (indexToEdit < 0 || indexToEdit >= 9) { return; } 

                   palette[indexToEdit] = hexColor;
                   const editedSwatch = document.getElementById(`color-${indexToEdit}`);
                   if (editedSwatch) {
                        editedSwatch.style.backgroundColor = hexColor;
                        editedSwatch.title = hexColor;
                   }
                   drawGrid(); 
               },
               onDone: function(newColor) {
                    pickerWasFinalized = true;
                    const finalHexColor = newColor.hex.substring(0, 7);
                    if (indexToEdit < 0 || indexToEdit >= 9) { return; } 

                    palette[indexToEdit] = finalHexColor; 
                    const editedSwatch = document.getElementById(`color-${indexToEdit}`);
                    if (editedSwatch) {
                         editedSwatch.style.backgroundColor = finalHexColor;
                         editedSwatch.title = finalHexColor;
                    }

                    if (originalColorOfThisSwatch !== finalHexColor) {
                        if (history.length >= MAX_HISTORY) { history.shift(); }
                        history.push({ 
                            grid: deepCopyGrid(gridState), 
                            pal: paletteStateAtPickerOpen, 
                            spacingColor: spacingColor 
                        }); 
                        console.log(`State saved (Palette Change for index ${indexToEdit}). History size: ${history.length}`);
                    }
                    drawGrid(); 
               },
               onClose: function() { 
                    if (!pickerWasFinalized) {
                        palette[indexToEdit] = originalColorOfThisSwatch;
                        const editedSwatch = document.getElementById(`color-${indexToEdit}`);
                        if (editedSwatch) {
                             editedSwatch.style.backgroundColor = originalColorOfThisSwatch;
                             editedSwatch.title = originalColorOfThisSwatch;
                        }
                        drawGrid(); 
                    }
                    console.log(`Picker closed (Palette Index ${indexToEdit}). Finalized: ${pickerWasFinalized}`);
                    currentPickerInstance = null;
                    activeColorPickerIndex = -1;
               }
            });
            currentPickerInstance.show();
        };

        // Single click to select primary color
        swatch.addEventListener('click', () => {
            selectedColorIndex = index;
            updateSelectedSwatch(index);
            console.log(`Primary color selected via click: index ${index}`);
        });

        // Right-click to select secondary color
        swatch.addEventListener('contextmenu', (event) => {
            event.preventDefault(); // Prevent browser context menu
            secondarySelectedColorIndex = index;
            updateSecondarySwatchVisuals(index);
            console.log(`Secondary color selected via right-click: index ${index}`);
        });
        
        // Double-click to open picker (replacing the old right-click behavior for picker)
        swatch.addEventListener('dblclick', openPickerHandler);
    });

    // --- Refactored Spacing Color Picker Logic ---
    function openSpacingColorPicker(event) {
        event.preventDefault(); 
        if (currentPickerInstance) { currentPickerInstance.destroy(); }
        activeColorPickerIndex = 9;
        
        const originalSpacingColorValue = spacingColor; 
        let pickerWasFinalized = false;

        console.log(`Opening picker for Spacing Color, current: ${originalSpacingColorValue}`);
        currentPickerInstance = new Picker({
            parent: spacingSwatchElement, 
            popup: 'top',
            color: originalSpacingColorValue,
            alpha: false, editor: true, editorFormat: 'hex',
            onChange: function(newColor) {
                const hexColor = newColor.hex.substring(0, 7);
                spacingColor = hexColor;
                spacingSwatchElement.style.backgroundColor = hexColor;
                spacingSwatchElement.title = `Background/Spacing Color (${hexColor})`;
                drawGrid(); 
            },
            onDone: function(newColor) {
                pickerWasFinalized = true;
                const finalHexColor = newColor.hex.substring(0, 7);
                spacingColor = finalHexColor; 
                spacingSwatchElement.style.backgroundColor = finalHexColor;
                spacingSwatchElement.title = `Background/Spacing Color (${finalHexColor})`;
                if (originalSpacingColorValue !== finalHexColor) {
                    if (history.length >= MAX_HISTORY) { history.shift(); }
                    history.push({ 
                        grid: deepCopyGrid(gridState), 
                        pal: [...palette], 
                        spacingColor: originalSpacingColorValue 
                    });
                    console.log(`State saved (Spacing Color Change). History size: ${history.length}`);
                }
                drawGrid(); 
            },
            onClose: function() {
                 if (!pickerWasFinalized) {
                     spacingColor = originalSpacingColorValue;
                     spacingSwatchElement.style.backgroundColor = originalSpacingColorValue;
                     spacingSwatchElement.title = `Background/Spacing Color (${originalSpacingColorValue})`;
                     drawGrid(); 
                 }
                 console.log(`Picker closed (Spacing Color). Finalized: ${pickerWasFinalized}`);
                 currentPickerInstance = null;
                 activeColorPickerIndex = -1;
            }
        });
        currentPickerInstance.show();
    }
    // --- End Refactored Spacing Color Picker Logic ---

    // Setup Spacing Color Swatch (formerly color-9 in the loop)
    if (spacingSwatchElement) {
        spacingSwatchElement.style.backgroundColor = spacingColor;
        // Right-click or Double-click to open picker for spacing color
        spacingSwatchElement.addEventListener('contextmenu', openSpacingColorPicker);
        spacingSwatchElement.addEventListener('dblclick', openSpacingColorPicker);
    } else {
        console.warn("#color-9 (spacing swatch) not found in its new location.");
    }

    // Set initial selections for tool and color (already done earlier, this is fine)
    updateSelectedSwatch(selectedColorIndex);
    updateSelectedTool(`tool-${currentTool}`);
    updateSecondarySwatchVisuals(secondarySelectedColorIndex); // Initialize secondary swatch visual

    // Populate initial values and add direct listeners for grid config inputs
    const pixelSizeInput = document.getElementById('pixelSizeInput');
    const spacingInput = document.getElementById('spacingInput');
    const gridRowsInput = document.getElementById('gridRowsInput');
    const gridColsInput = document.getElementById('gridColsInput');

    if (pixelSizeInput) {
        pixelSizeInput.value = pixelSize;
        pixelSizeInput.addEventListener('change', updateGridConfiguration);
    }
    if (spacingInput) {
        spacingInput.value = spacing;
        spacingInput.addEventListener('change', updateGridConfiguration);
    }
    if (gridRowsInput) {
        gridRowsInput.value = gridRows;
        gridRowsInput.addEventListener('change', updateGridConfiguration);
    }
    if (gridColsInput) {
        gridColsInput.value = gridCols;
        gridColsInput.addEventListener('change', updateGridConfiguration);
    }

    // Add scroll listener to the canvas container for redraws
    if (!canvasContainer) { // Ensure canvasContainer is available
        canvasContainer = document.getElementById('canvas-container');
    }
    if (canvasContainer) {
        canvasContainer.addEventListener('scroll', () => {
            drawGrid(); 
            clearPreviewCanvas();
            
            // Redraw active previews based on current state
            // Mousemove handler is responsible for previews during active drawing/selection.
            // Only redraw static selectionRect here if no active operation is occurring.
            if (selectionRect && !isDrawingShape && !isDefiningSelection && !isMovingSelection) {
                 drawPreviewSelection(selectionRect.r1, selectionRect.c1, selectionRect.r2, selectionRect.c2);
            }
        });

        // Add wheel event listener for smooth omnidirectional scrolling
        canvasContainer.addEventListener('wheel', (event) => {
            // Don't interfere if a color picker or other modal is active and might use wheel scroll
            if (currentPickerInstance) {
                return;
            }

            // Prevent default browser scroll handling for the container
            event.preventDefault();

            // Update scroll position directly
            // Adjust sensitivity if needed by multiplying deltaX/Y by a factor
            const scrollFactor = 1; // Adjust if scrolling feels too fast or too slow
            canvasContainer.scrollLeft += event.deltaX * scrollFactor;
            canvasContainer.scrollTop += event.deltaY * scrollFactor;

            // Our existing 'scroll' event listener on canvasContainer will handle redraws
            // No need to call drawGrid() here directly, as changing scrollLeft/Top fires the 'scroll' event.
        }, { passive: false }); // passive: false is needed to allow preventDefault

    } else {
        console.error("#canvas-container not found, scroll listener not added.");
    }
}
// --- End UI Interaction ---

// --- Initial Setup ---
// initializeGridState(); // Now done by reinitializeCanvasAndGrid
// drawGrid(); // Now done by reinitializeCanvasAndGrid
setupOptionsPanel(); // Initialize the options panel listeners and UI
reinitializeCanvasAndGrid(); // NEW: Perform initial canvas and grid setup
// console.log(`Drew initial ${gridRows}x${gridCols} grid.`); // Logged by reinitializeCanvasAndGrid
// --- End Initial Setup ---

// --- Grid Configuration Update ---
function reinitializeCanvasAndGrid(oldGridData, oldConfig) {
    if (!canvasContainer) {
        canvasContainer = document.getElementById('canvas-container');
        if (!canvasContainer) {
            console.error("Canvas container not found!");
            return;
        }
    }

    if (!oldGridData || !oldConfig) {
        gridState = createNewGridStateFromOld(null, 0, 0, gridRows, gridCols);
    } else {
        if (gridRows !== oldConfig.rows || gridCols !== oldConfig.cols) {
            gridState = createNewGridStateFromOld(oldGridData, oldConfig.rows, oldConfig.cols, gridRows, gridCols);
        } else {
            // Dimensions are the same, pixel/spacing changed.
            // gridState should be oldGridData if it was passed correctly as a deep copy.
            // If updateGridConfiguration passes a deepCopy of current gridState as oldGridData,
            // and then updates globals, and THEN calls reinitialize, then gridState is already correct.
            // Let's ensure gridState IS the oldGridData if dimensions haven't changed.
            gridState = oldGridData; // oldGridData is already a deep copy from the caller
        }
    }

    logicalCanvasWidth = spacing + gridCols * (pixelSize + spacing);
    logicalCanvasHeight = spacing + gridRows * (pixelSize + spacing);

    canvas.width = logicalCanvasWidth;
    canvas.height = logicalCanvasHeight;
    previewCanvas.width = logicalCanvasWidth;
    previewCanvas.height = logicalCanvasHeight;

    // Only reset scroll if the logical size might have changed affecting scroll extents.
    // This happens if rows, cols, pixelSize or spacing change.
    // We can simplify: always reset scroll on reinitialize for now.
    if (canvasContainer) {
        canvasContainer.scrollLeft = 0;
        canvasContainer.scrollTop = 0;
    }

    console.log(`Canvases re-initialized. Logical: ${logicalCanvasWidth}x${logicalCanvasHeight}. Grid: ${gridRows}x${gridCols}, Px: ${pixelSize}, Sp: ${spacing}`);

    drawGrid();

    // If a config change happened that invalidates selection, the caller (updateGridConfiguration) should clear it.
    // For example, if gridRows/gridCols changed.
    if (oldConfig && (gridRows !== oldConfig.rows || gridCols !== oldConfig.cols)){
        selectionRect = null;
        selectionBuffer = null;
        clearPreviewCanvas(); // Clear selection preview
        console.log("Grid dimensions changed, selection cleared.");
    }
}

function updateGridConfiguration() {
    const newPixelSize = parseInt(document.getElementById('pixelSizeInput').value, 10);
    const newSpacingSize = parseInt(document.getElementById('spacingInput').value, 10);
    const newGridRows = parseInt(document.getElementById('gridRowsInput').value, 10);
    const newGridCols = parseInt(document.getElementById('gridColsInput').value, 10);

    // Validation (user updated limits, ensure these are reflected)
    if (isNaN(newPixelSize) || newPixelSize < 1 || newPixelSize > 15) { alert("Pixel Size must be between 1 and 15."); return; }
    if (isNaN(newSpacingSize) || newSpacingSize < 0 || newSpacingSize > 5) { alert("Spacing Size must be between 0 and 5."); return; }
    if (isNaN(newGridRows) || newGridRows < 10 || newGridRows > 500) { alert("Grid Rows must be between 10 and 500."); return; }
    if (isNaN(newGridCols) || newGridCols < 10 || newGridCols > 800) { alert("Grid Columns must be between 10 and 800."); return; }

    if (newPixelSize === pixelSize && newSpacingSize === spacing && newGridRows === gridRows && newGridCols === gridCols) {
        console.log("No grid configuration changes detected.");
        return;
    }

    console.log("Saving current state for undo (grid config change)...");
    // Save current grid AND its configuration BEFORE changing globals
    if (history.length >= MAX_HISTORY) {
        history.shift();
    }
    history.push({
        grid: deepCopyGrid(gridState),
        config: {
            rows: gridRows,
            cols: gridCols,
            pixelSize: pixelSize,
            spacing: spacing
        },
        // Also include palette and spacingColor for completeness if other history items do
        pal: [...palette], // Make sure this is a copy if palette can be mutated
        spacingColor: spacingColor
    });
    console.log(`State saved (Config Change). History size: ${history.length}`);

    const oldGridDataForReinit = deepCopyGrid(gridState); // This is the state BEFORE globals change
    const oldConfigForReinit = { rows: gridRows, cols: gridCols, pixelSize: pixelSize, spacing: spacing };

    // Update global variables
    pixelSize = newPixelSize;
    spacing = newSpacingSize;
    gridRows = newGridRows;
    gridCols = newGridCols;

    // Pass the state *before* global update, and its config, to reinitialize.
    // reinitializeCanvasAndGrid will handle creating the new gridState based on this.
    reinitializeCanvasAndGrid(oldGridDataForReinit, oldConfigForReinit);
} 