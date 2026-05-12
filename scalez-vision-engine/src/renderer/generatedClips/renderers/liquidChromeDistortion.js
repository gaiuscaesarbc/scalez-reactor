export function renderLiquidChromeDistortion(ctx, width, height, time, audio) {
  ctx.fillStyle = '#0a0a15'
  ctx.fillRect(0, 0, width, height)

  const timePhase = time * 0.001
  const waveHeight = height * 0.1 + audio.bass * 40

  // Liquid waves
  for (let y = 0; y < height; y += 8) {
    ctx.strokeStyle = `hsl(200, 80%, ${50 + audio.energy * 30 + audio.mids * 20}%)`
    ctx.lineWidth = 2
    ctx.beginPath()

    for (let x = 0; x < width; x += 5) {
      const waveY = y + Math.sin((x / width) * Math.PI * 2 + timePhase + audio.mids * 2) * waveHeight
      const ripple = audio.bass * 10

      if (x === 0) {
        ctx.moveTo(x, waveY + ripple)
      } else {
        ctx.lineTo(x, waveY + ripple)
      }
    }
    ctx.stroke()
  }

  // Chrome highlights
  const highlightCount = 4 + Math.floor(audio.energy * 4)
  for (let i = 0; i < highlightCount; i++) {
    const x = (time * 0.0001 * (i + 1) + i / highlightCount) % 1
    const y = (time * 0.00005 * (i + 1) + i / highlightCount) % 1

    ctx.fillStyle = `rgba(192, 192, 192, ${0.3 + audio.highs * 0.5})`
    ctx.fillRect(x * width, y * height, 100, 50)

    // Chrome distortion
    for (let dy = 0; dy < 50; dy += 5) {
      const distort = Math.sin((x * width + dy + timePhase) * 0.01) * 20
      ctx.fillStyle = `rgba(200, 200, 200, ${0.2 + audio.energy * 0.2})`
      ctx.fillRect(x * width + distort, y * height + dy, 80, 3)
    }
  }
}
