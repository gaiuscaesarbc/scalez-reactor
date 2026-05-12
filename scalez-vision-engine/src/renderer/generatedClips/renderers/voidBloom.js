export function renderVoidBloom(ctx, width, height, time, audio) {
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)

  const centerX = width / 2
  const centerY = height / 2
  const timePhase = time * 0.0005
  const bloomSize = audio.bass * 200 + 50

  // Main bloom center
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, bloomSize)
  gradient.addColorStop(0, `rgba(255, 0, 255, ${0.8 + audio.energy * 0.2})`)
  gradient.addColorStop(0.5, `rgba(0, 255, 255, ${0.5 + audio.energy * 0.3})`)
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')

  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(centerX, centerY, bloomSize, 0, Math.PI * 2)
  ctx.fill()

  // Neon flowers/petals
  const petalCount = Math.floor(6 + audio.energy * 6)
  for (let i = 0; i < petalCount; i++) {
    const angle = (i / petalCount) * Math.PI * 2 + timePhase * 30
    const petalDistance = bloomSize * 0.6

    const petalX = centerX + Math.cos(angle) * petalDistance
    const petalY = centerY + Math.sin(angle) * petalDistance
    const petalSize = 30 + audio.mids * 40

    ctx.fillStyle = `hsl(${300 + i * 60}, 100%, ${50 + audio.energy * 30}%)`
    ctx.beginPath()
    ctx.arc(petalX, petalY, petalSize, 0, Math.PI * 2)
    ctx.fill()

    // Inner glow
    ctx.strokeStyle = `rgba(255, 255, 255, ${audio.highs * 0.6})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(petalX, petalY, petalSize * 0.7, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Particle petals on highs
  if (audio.highs > 0.3) {
    const particleCount = Math.floor(audio.highs * 30)
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const distance = Math.random() * bloomSize
      const x = centerX + Math.cos(angle) * distance
      const y = centerY + Math.sin(angle) * distance

      ctx.fillStyle = `rgba(0, 255, 200, ${audio.highs * 0.8})`
      ctx.beginPath()
      ctx.arc(x, y, 2 + Math.random() * 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
