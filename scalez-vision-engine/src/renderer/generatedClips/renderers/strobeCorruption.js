export function renderStrobeCorruption(ctx, width, height, time, audio, settings = {}) {
  const strobeCooldown = settings.strobeCooldown || 150
  const timeMs = time
  const lastStrobeTime = Math.floor(timeMs / strobeCooldown) * strobeCooldown

  // Alternate black/white strobe background
  const strobePhase = (timeMs - lastStrobeTime) / strobeCooldown
  const isStrobe = strobePhase > 0.3 && strobePhase < 0.7 && audio.bass > 0.6

  ctx.fillStyle = isStrobe ? '#ffffff' : '#000000'
  ctx.fillRect(0, 0, width, height)

  // Glitch blocks
  const blockSize = 30
  const glitchAmount = audio.mids * 200

  for (let y = 0; y < height; y += blockSize) {
    for (let x = 0; x < width; x += blockSize) {
      const seed = Math.sin(x * 0.01 + y * 0.01 + time * 0.001) * 999
      const glitch = Math.sin(seed + time * 0.002) > 0.5

      if (glitch) {
        const offset = Math.sin(seed) * glitchAmount

        ctx.fillStyle = isStrobe
          ? `rgba(0, 0, 0, ${0.4 + audio.highs * 0.6})`
          : `rgba(255, 255, 255, ${0.4 + audio.highs * 0.6})`

        ctx.fillRect(x + offset, y, blockSize, blockSize)
      }
    }
  }

  // Corruption lines
  const lineCount = Math.floor(10 + audio.energy * 20)
  ctx.strokeStyle = isStrobe
    ? `rgba(0, 255, 255, ${audio.energy * 0.8})`
    : `rgba(255, 0, 255, ${audio.energy * 0.8})`
  ctx.lineWidth = 2 + audio.highs * 4

  for (let i = 0; i < lineCount; i++) {
    const y = (time * 0.002 + (i / lineCount)) % 1 * height
    const glitchX = Math.sin(time * 0.005 + i) * 50

    ctx.beginPath()
    ctx.moveTo(0 + glitchX, y)
    ctx.lineTo(width + glitchX, y)
    ctx.stroke()
  }
}
