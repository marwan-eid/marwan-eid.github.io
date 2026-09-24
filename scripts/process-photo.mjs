// Crops and grades the source portrait into the assets the site uses.
//   node scripts/process-photo.mjs ../PersonalPhoto.jpg
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const src = process.argv[2] ?? '../PersonalPhoto.jpg';
const out = new URL('../src/assets/', import.meta.url);
mkdirSync(out, { recursive: true });

// Gentle grade: a touch less saturation, a touch more contrast, slightly warmer.
const grade = (img) =>
  img
    .modulate({ saturation: 0.9, brightness: 1.01 })
    .linear(1.06, -7)
    .recomb([
      [1.02, 0, 0],
      [0, 1.0, 0],
      [0, 0, 0.97],
    ]);

const base = sharp(src).rotate(); // respect EXIF orientation

// Head-and-shoulders portrait, 4:5.
await grade(base.clone().extract({ left: 160, top: 30, width: 920, height: 1150 }))
  .resize(920, 1150)
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile(new URL('portrait.jpg', out).pathname.replace(/^\/([A-Z]:)/, '$1'));

// Square avatar centred on the face.
await grade(base.clone().extract({ left: 250, top: 40, width: 740, height: 740 }))
  .resize(512, 512)
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile(new URL('avatar.jpg', out).pathname.replace(/^\/([A-Z]:)/, '$1'));

console.log('wrote src/assets/portrait.jpg and src/assets/avatar.jpg');
