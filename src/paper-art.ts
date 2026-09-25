// Raster presentation assets. No simulation state or gameplay RNG belongs here.
export const ART_FILES = {
  body: 'mage-body-v1.png', cape: 'mage-cape-v1.png',
  background: 'mountains-far-v1.png', paper: 'folded-paper-v1.png',
  middle: 'castle-middle-v1.png', foliage: 'foliage-front-v1.png',
  mountains: 'mountains-occlusion-v1.png',
  rock: 'cliff-rock-v1.png', moss: 'moss-edge-v1.png',
  hazards: 'hazards-v1.png', plants: 'platform-plants-v1.png', clouds: 'cloud-band-v1.png',
} as const;
type ArtName = keyof typeof ART_FILES;
export const SCROLL_RATES = { far: .045, middle: .2, foreground: 1.12 } as const;
export function scrollOffset(distance: number, scale: number, layer: keyof typeof SCROLL_RATES) {
  return distance * scale * SCROLL_RATES[layer];
}
export function foregroundTop(height: number) { return height * .84; }
export function platformDepth(y: number, scale: number, upper: boolean, viewportHeight: number) {
  return upper ? scale * 1.35 : Math.max(scale * 5.7, (viewportHeight - y + scale) / .65);
}
export class PaperArt {
  readonly images: Partial<Record<ArtName, HTMLImageElement>> = {};
  readonly ready: Promise<boolean>;
  readonly total = Object.keys(ART_FILES).length;
  settled = 0;
  loaded = 0;
  constructor() {
    this.ready = Promise.all((Object.keys(ART_FILES) as ArtName[]).map(name => new Promise<boolean>(resolve => {
      if (typeof Image === 'undefined') { this.settled++; resolve(false); return; }
      const img = new Image();
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return; settled = true; clearTimeout(timer);
        img.onload = null; img.onerror = null;
        if (ok) { this.images[name] = img; this.loaded++; }
        this.settled++;
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), 12000);
      img.onload = () => {
        if (!img.naturalWidth) { finish(false); return; }
        // Decode before revealing the scene, not on its first visible frame.
        if (typeof img.decode === 'function') void img.decode().then(() => finish(true), () => finish(false));
        else finish(true);
      };
      img.onerror = () => finish(false);
      img.src = `${import.meta.env.BASE_URL}art/${ART_FILES[name]}`;
    }))).then(results => results.every(Boolean));
  }
  background(c: CanvasRenderingContext2D, w: number, h: number, distance: number, scale = Math.min(h / 12, w / 23)) {
    const img = this.images.background; if (!img) return false;
    // Independent mountain panorama: no architecture baked into this layer.
    const farWidth = h * img.naturalWidth / img.naturalHeight;
    this.scrollTiles(c, w, farWidth, scrollOffset(distance, scale, 'far'), () => {
      c.drawImage(img, 0, 0, farWidth + .5, h);
    });
    // One stationary moon; it is deliberately absent from the repeating panorama.
    // Without the transparent mountain layer, omit the moon rather than drawing it over peaks.
    const mountains = this.images.mountains;
    if (mountains) {
    const moonX = w * .78, moonY = h * .25, radius = Math.min(58, w * .075);
    c.save(); c.beginPath(); c.arc(moonX, moonY, radius, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#d8d8b3'; c.fillRect(moonX - radius, moonY - radius, radius * 2, radius * 2);
    if (this.images.paper) {
      c.globalAlpha = .27; c.filter = 'grayscale(1) brightness(2)';
      c.drawImage(this.images.paper, moonX - radius, moonY - radius, radius * 2, radius * 2);
    }
    c.restore();
    // Clouds cross the moon, but remain behind the mountain skyline. Run distance
    // drives drift so pause and reduced-motion keep the entire backdrop still.
    const clouds = this.images.clouds;
    if (clouds) {
      const cloudWidth = h * 1.1, cloudHeight = h * .19;
      this.scrollTiles(c, w, cloudWidth, distance * scale * .075 + cloudWidth * .45, () => {
        c.globalAlpha = .68;
        c.drawImage(clouds, 0, h * .23, cloudWidth, cloudHeight);
      });
    }
    // Same framing, mirrored tiles and travel as the far panorama: no sliding occlusion edges.
    this.scrollTiles(c, w, farWidth, scrollOffset(distance, scale, 'far'), () => {
      c.drawImage(mountains, 0, 0, farWidth + .5, h);
    });
    }
    c.fillStyle = '#16302c44'; c.fillRect(0, 0, w, h);
    // Transparent towers/arches reveal mountains moving behind them.
    const middle = this.images.middle;
    if (middle) {
      const midHeight = h * .78, midWidth = midHeight * middle.naturalWidth / middle.naturalHeight;
      this.scrollTiles(c, w, midWidth, scrollOffset(distance, scale, 'middle'), () => {
        c.globalAlpha = .84;
        c.drawImage(middle, 0, h * .22, midWidth + .5, midHeight);
      });
    }
    const veil = c.createLinearGradient(0, 0, 0, h);
    veil.addColorStop(0, '#07100e88'); veil.addColorStop(.45, '#0b161026'); veil.addColorStop(1, '#09151066');
    c.fillStyle = veil; c.fillRect(0, 0, w, h);
    return true;
  }
  private scrollTiles(c: CanvasRenderingContext2D, viewportWidth: number, tileWidth: number, travel: number, draw: () => void) {
    const first = Math.floor(travel / tileWidth), offset = travel - first * tileWidth;
    for (let i = 0; i < Math.ceil(viewportWidth / tileWidth) + 1; i++) {
      c.save(); c.translate(i * tileWidth - offset, 0);
      if ((first + i) % 2) { c.translate(tileWidth, 0); c.scale(-1, 1); }
      draw(); c.restore();
    }
  }
  foreground(c: CanvasRenderingContext2D, w: number, h: number, distance: number, scale: number, time: number) {
    const top = foregroundTop(h), depth = h - top;
    const span = Math.max(180, Math.min(300, w * .28));
    const travel = scrollOffset(distance, scale, 'foreground');
    const first = Math.floor(travel / span), offset = travel - first * span;
    // Clip all foliage below the action corridor; DOM HUD is above this canvas.
    c.save(); c.beginPath(); c.rect(0, top, w, depth); c.clip();
    const foliage = this.images.foliage;
    if (foliage) {
      const imageHeight = depth * 1.18;
      const imageWidth = imageHeight * foliage.naturalWidth / foliage.naturalHeight;
      this.scrollTiles(c, w, imageWidth, travel, () => {
        c.globalAlpha = .85;
        c.drawImage(foliage, 0, h - imageHeight + 14, imageWidth + .5, imageHeight);
      });
      c.restore(); return;
    }
    for (let i = -1; i <= Math.ceil(w / span); i++) {
      const index = first + i;
      c.save(); c.translate(i * span - offset + span * .5, h + 12);
      const size = depth * (.8 + Math.abs(Math.sin(index * 2.71)) * .25);
      for (let leaf = 0; leaf < 7; leaf++) {
        c.save(); c.rotate((leaf - 3) * .27 + Math.sin(time * 1.3 + index) * .014);
        const length = size * (.6 + .4 * Math.abs(Math.sin(leaf * 2.1 + index)));
        const breadth = length * .24;
        c.beginPath(); c.moveTo(0, 0); c.lineTo(-breadth, -length * .45);
        c.lineTo(-breadth * .55, -length * .8); c.lineTo(0, -length);
        c.lineTo(breadth * .7, -length * .62); c.lineTo(breadth, -length * .3); c.closePath();
        c.fillStyle = '#0a1913'; c.fill();
        c.save(); c.clip(); this.grain(c, -breadth, -length, breadth * 2, length); c.restore();
        c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -length); c.lineTo(breadth * .7, -length * .62); c.lineTo(breadth, -length * .3); c.closePath();
        c.fillStyle = '#28402b99'; c.fill();
        c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -length); c.strokeStyle = '#63805255'; c.lineWidth = .7; c.stroke();
        c.restore();
      }
      c.restore();
    }
    c.restore();
  }
  platform(c: CanvasRenderingContext2D, x: number, right: number, y: number, s: number, upper: boolean, viewportWidth: number, viewportHeight = 0) {
    const img = this.images.rock ?? this.images.paper; if (!img) return false;
    // Even the shortest polygon edge (.65 of depth) must reach below the frame.
    const depth = platformDepth(y, s, upper, viewportHeight);
    c.save(); c.beginPath();
    c.moveTo(x, y); c.lineTo(right, y); c.lineTo(right, y + depth * .8);
    c.lineTo(right - Math.min(s * .65, (right - x) * .1), y + depth);
    c.lineTo(x + s * .3, y + depth * .93); c.lineTo(x, y + depth * .65); c.closePath(); c.clip();
    const tile = s * 9;
    const first = Math.max(0, Math.floor(-x / tile));
    for (let col = first; x + col * tile < Math.min(right, viewportWidth); col++) {
      for (let row = 0; row < Math.ceil(depth / tile); row++) {
        c.save(); c.translate(x + col * tile, y + row * tile);
        if (col % 2) { c.translate(tile, 0); c.scale(-1, 1); }
        if (row % 2) { c.translate(0, tile); c.scale(1, -1); }
        c.drawImage(img, 0, 0, tile + .5, tile + .5); c.restore();
      }
    }
    const shadow = c.createLinearGradient(0, y, 0, y + depth);
    shadow.addColorStop(0, '#07130a00'); shadow.addColorStop(1, '#07130ac9');
    c.fillStyle = shadow; c.fillRect(x, y, right - x, depth); c.restore();
    const moss = this.images.moss;
    if (moss) {
      // Source top surface is at 31% of the atlas. Anchor it exactly to the
      // collision plane; torn moss hangs BELOW, never disguising a gap.
      c.save(); c.beginPath(); c.rect(x, y - 1, right - x, s * .85); c.clip();
      const span = s * 9;
      const start = Math.max(0, Math.floor(-x / span));
      for (let i = start; x + i * span < Math.min(right, viewportWidth); i++) {
        c.save(); c.translate(x + i * span, y);
        if (i % 2) { c.translate(span, 0); c.scale(-1, 1); }
        c.drawImage(moss, 0, moss.naturalHeight * .305, moss.naturalWidth, moss.naturalHeight * .47,
          0, -1, span + .5, s * .85);
        c.restore();
      }
      c.restore(); return true;
    }
    // Torn paper lip never moves the flat collision/landing edge.
    c.beginPath(); c.moveTo(x, y); c.lineTo(right, y);
    for (let xx = right; xx > x; xx -= s * .32) {
      const n = Math.abs(Math.sin((xx - x) * 1.3));
      c.lineTo(xx, y + s * (.09 + n * .13));
    }
    c.lineTo(x, y); c.closePath(); c.fillStyle = upper ? '#d3d99e' : '#a5b86c'; c.fill();
    c.beginPath(); c.moveTo(x, y); c.lineTo(right, y); c.lineWidth = 1.5; c.strokeStyle = '#dfedaa'; c.stroke();
    return true;
  }
  hazard(c: CanvasRenderingContext2D, x: number, y: number, s: number, ceiling: boolean) {
    const img = this.images.hazards; if (!img) return false;
    // Normalized atlas rectangles exclude transparent padding. Preserve the
    // existing obstacle envelope; downward teeth end at the old roof underside.
    const box = ceiling ? [.518, .270, .453, .462] : [.042, .340, .420, .402];
    c.drawImage(img, box[0] * img.naturalWidth, box[1] * img.naturalHeight,
      box[2] * img.naturalWidth, box[3] * img.naturalHeight,
      x - (ceiling ? 1.1 : .65) * s, y - (ceiling ? .65 : 1.2) * s,
      (ceiling ? 2.2 : 1.3) * s, (ceiling ? .65 : 1.2) * s);
    return true;
  }
  plant(c: CanvasRenderingContext2D, x: number, y: number, s: number, tree: boolean) {
    const img = this.images.plants; if (!img) return;
    const box = tree ? [.55, .125, .415, .81] : [.115, .345, .30, .565];
    const height = s * (tree ? 3.5 : .7);
    const width = height * box[2] * img.naturalWidth / (box[3] * img.naturalHeight);
    c.save(); c.globalAlpha = tree ? .72 : .95;
    c.drawImage(img, box[0] * img.naturalWidth, box[1] * img.naturalHeight,
      box[2] * img.naturalWidth, box[3] * img.naturalHeight,
      x - width / 2, y - height, width, height);
    c.restore();
  }
  mage(c: CanvasRenderingContext2D, spread: number, time: number) {
    const body = this.images.body, cape = this.images.cape;
    if (!body || !cape) return false;
    c.save(); c.rotate(spread * .12);
    // Cloth independently unfolds around a fixed shoulder anchor, not a pose crossfade.
    c.save(); c.translate(-.13, -1.23); c.rotate(-.65 + spread * .7);
    const width = 1.35 + spread * 1.15, height = .94 + spread * .5;
    const strips = 24;
    for (let i = 0; i < strips; i++) {
      const u = i / strips, sway = Math.sin(time * 7 - u * 3) * .035 * (1 - u) ** 2;
      const sourceWidth = cape.naturalWidth / strips;
      c.drawImage(cape, i * sourceWidth, 0, sourceWidth, cape.naturalHeight,
        (u - .97) * width, -height * .48 + sway, width / strips + .004, height);
    }
    c.restore();
    // Leaf/head/boots occupy the same approximate envelope as the old paper silhouette.
    c.drawImage(body, -.94, -2.35, 1.65, 2.4);
    c.restore(); return true;
  }
  grain(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    const img = this.images.paper; if (!img) return;
    // Caller clips to an existing hazard/note path. Tint stays in the original palette.
    c.save(); c.globalAlpha = .3; c.globalCompositeOperation = 'soft-light';
    c.drawImage(img, x, y, w, h); c.restore();
  }
}
