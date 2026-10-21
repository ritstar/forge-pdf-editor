import { degrees } from '@cantoo/pdf-lib';

// Maps "visual" coordinates (what the user sees: origin top-left of the displayed page, in
// points) to PDF user space, accounting for the page's /Rotate and CropBox offset. Viewers
// render the CropBox rotated, so ignoring either puts overlays in the wrong place.
export function getPageFrame(page) {
  const crop = page.getCropBox();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  const quarterTurn = rotation === 90 || rotation === 270;
  return {
    rotation,
    crop,
    width: quarterTurn ? crop.height : crop.width,
    height: quarterTurn ? crop.width : crop.height,
  };
}

export function visualToPdf(frame, u, v) {
  const { crop, rotation } = frame;
  let x;
  let y;
  switch (rotation) {
    case 90:
      x = v;
      y = u;
      break;
    case 180:
      x = crop.width - u;
      y = v;
      break;
    case 270:
      x = crop.width - v;
      y = crop.height - u;
      break;
    default:
      x = u;
      y = crop.height - v;
  }
  return { x: crop.x + x, y: crop.y + y };
}

// Options for drawImage/drawText so content anchored at visual (u, v) — the bottom-left of the
// drawn box as the user sees it — appears upright on a rotated page.
export function placeAt(frame, u, v) {
  return { ...visualToPdf(frame, u, v), rotate: degrees(frame.rotation) };
}
