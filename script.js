const canvas = document.getElementById('mosaicCanvas');
const ctx = canvas.getContext('2d');

// --- Grid Configuration ---
const gridRows = 200;
const gridCols = 400;
const pixelSize = 7;
const spacing = 1;
const pixelColor = '#E0E0E0'; // Light gray
const backgroundColor = '#FFFFFF'; // White background to see spacing
// --- End Grid Configuration ---

// Calculate canvas size based on grid
const canvasWidth = spacing + gridCols * (pixelSize + spacing);
const canvasHeight = spacing + gridRows * (pixelSize + spacing);

canvas.width = canvasWidth;
canvas.height = canvasHeight;

// Set background color (optional, helps visualize spacing)
ctx.fillStyle = backgroundColor;
ctx.fillRect(0, 0, canvas.width, canvas.height);

console.log(`Canvas size set to ${canvasWidth}x${canvasHeight}`);

// --- Draw Grid ---
ctx.fillStyle = pixelColor;
for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
        const x = spacing + col * (pixelSize + spacing);
        const y = spacing + row * (pixelSize + spacing);
        ctx.fillRect(x, y, pixelSize, pixelSize);
    }
}
// --- End Draw Grid ---

console.log(`Drew a ${gridRows}x${gridCols} grid.`); 