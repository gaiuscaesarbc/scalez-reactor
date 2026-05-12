export function renderCosmicDustStorm(ctx, width, height, time, audio) {
  ctx.fillStyle = '#0a0a1f'
  ctx.fillRect(0, 0, width, height)

  const centerX = width / 2
  const centerY = height / 2
  const particleCount = Math.floor(150 * audio.energy + 100)
  const timePhase = time * 0.0005

  // Star particles
  for (let i = 0; i < particleCount; i++) {
    const seed = Math.sin(i * 0.137) * 999 + 500
    const angle = ((seed + timePhase * 100) % 1000) / 1000 * Math.PI * 2
    const distance = ((seed * 0.5 + audio.bass * 200) % 1) * (Math.max(width, height) * 0.4)

    const x = centerX + Math.cos(angle) * distance
    const y = centerY + Math.sin(angle) * distance

    if (x > 0 && x < width && y > 0 && y < height) {
      const brightness = 0.3 + ((seed * 0.3) % 1) * 0.7
      ctx.fillStyle = `rgba(255, 200, 100, ${brightness * audio.energy})`
      ctx.beginPath()
      ctx.arc(x, y, 1 + audio.mids * 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Sparkle bursts on highs
  if (audio.highs > 0.3) {
    const burstCount = Math.floor(audio.highs * 12)
    for (let i = 0; i < burstCount; i++) {
      const angle = (i / burstCount) * Math.PI * 2 + timePhase * 50
      const distance = audio.highs * (Math.max(width, height) * 0.25)
      const x = centerX + Math.cos(angle) * distance
      const y = centerY + Math.sin(angle) * distance

      ctx.fillStyle = `rgba(0, 255, 200, ${audio.highs * 0.9})`
      ctx.beginPath()
      ctx.arc(x, y, 3 + audio.highs * 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
