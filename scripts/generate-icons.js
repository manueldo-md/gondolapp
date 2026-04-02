// scripts/generate-icons.js
// Genera los íconos PWA de GondolApp usando sharp + SVG
// Uso: node scripts/generate-icons.js

const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const OUT_DIR = path.join(__dirname, '..', 'public', 'icons')
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

// SVG base: "G" blanca sobre fondo verde con bordes redondeados
function makeSvg(size) {
  const r = Math.round(size * 0.22)   // border-radius ~22%
  const fontSize = Math.round(size * 0.58)
  const cx = size / 2
  const cy = size / 2 + Math.round(size * 0.04) // offset vertical leve

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#1D9E75"/>
  <text
    x="${cx}"
    y="${cy}"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="Arial, Helvetica, sans-serif"
    font-weight="700"
    font-size="${fontSize}"
    fill="white"
  >G</text>
</svg>`
}

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512]

async function generateIcons() {
  console.log('Generando íconos PWA...')

  for (const size of SIZES) {
    const svg = Buffer.from(makeSvg(size))
    const outPath = path.join(OUT_DIR, `icon-${size}x${size}.png`)
    await sharp(svg).png().toFile(outPath)
    console.log(`  ✓ icon-${size}x${size}.png`)
  }

  // apple-touch-icon (180x180)
  const appleSvg = Buffer.from(makeSvg(180))
  await sharp(appleSvg).png().toFile(path.join(OUT_DIR, 'apple-touch-icon.png'))
  console.log('  ✓ apple-touch-icon.png (180x180)')

  // favicon.ico en la raíz de public (32x32)
  const faviconSvg = Buffer.from(makeSvg(32))
  const faviconPath = path.join(__dirname, '..', 'public', 'favicon.ico')
  await sharp(faviconSvg).png().toFile(faviconPath)
  console.log('  ✓ favicon.ico (32x32 PNG embebido)')

  // shortcut-campanas (96x96, misma "G" verde)
  const shortcutSvg = Buffer.from(makeSvg(96))
  await sharp(shortcutSvg).png().toFile(path.join(OUT_DIR, 'shortcut-campanas.png'))
  console.log('  ✓ shortcut-campanas.png')

  console.log('\n✅ Todos los íconos generados en public/icons/')
}

generateIcons().catch(err => {
  console.error('Error generando íconos:', err)
  process.exit(1)
})
