// ============================================================================
// development tools: only in dev.html (npm run build:dev), never in index.html
// ============================================================================
// window.TT holds the hooks the automated tests in source/test drive (see devgame.js for the game's own)
const TT = window.TT = { frozen: -1, frames: 0 };
{
  const draw = render;
  render = () => {
    if (TT.frozen >= 0) F[TIME] = TT.frozen; // stills: the same instant of the animation every time
    TT.frames++;
    draw();
  };
  // hold the render resolution at `p` pixels (default: the full 2560x1440 budget) and the draw distance at 1
  TT.fix = (p = PIXMAX) => { TT.fixed = 1; pix = p; det = 1; dynT = -Infinity; resize(); return [W, H]; };
  TT.cam = (x, y, z, tx, ty, tz) => { lookAt(x, y, z, tx, ty, tz); };
  TT.dive = () => { ui(false); };
  TT.info = () => ({ w: W, h: H, lv: LV, gpu: F[GPU], t: F[TIME], cam: [F[CX], F[CY], F[CZ], F[YAW], F[PIT]] });
  TT.ready = true;
}
