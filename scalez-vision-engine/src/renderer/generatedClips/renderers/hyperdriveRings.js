export function renderHyperdriveRings(ctx, width, height, time, audio) {
  ctx.fillStyle = '#000810'
  ctx.fillRect(0, 0, width, height)

  const centerX = width / 2
  const centerY = height / 2
  const timePhase = time * 0.0015
  const maxRadius = Math.max(width, height) * 0.4

  // Speed rings
  const ringCount = 12
  for (let i = 0; i < ringCount; i++) {
    const phase = (timePhase * (1 + audio.mids * 2) + i * 0.1) % 1
    const progress = phase

    const radius = maxRadius * progress * (1 + audio.bass * 0.5)
    const lineWidth = 4 + (1 - progress) * 8

    ctx.strokeStyle = `hsl(${200 + i * 15}, 100%, ${50 + (1 - progress) * 40}%)`
    ctx.lineWidth = lineWidth
    ctx.globalAlpha = 1 - progress
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // Polygon rings (add variety)
  const sides = 6
  for (let i = 0; i < ringCount / 2; i++) {
    const phase = (timePhase * 0.8 + (i * 0.2)) % 1
    const radius = maxRadius * phase * (1 + audio.bass * 0.4)

    ctx.strokeStyle = `hsl(${60 + i * 40}, 100%, ${60 - progress * 30}%)`
    ctx.lineWidth = 2 + audio.energy * 2
    ctx.globalAlpha = 0.5 + (1 - phase) * 0.5
    ctx.beginPath()

    for (let j = 0; j < sides; j++) {
      const angle = (j / sides) * Math.PI * 2
      const x = centerX + Math.cos(angle) * radius
      const y = centerY + Math.sin(angle) * radius

      if (j === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.closePath()
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // White flashes on highs
  if (audio.highs > 0.4) {
    const flashCount = Math.floor(audio.highs * 8)
    for (let i = 0; i < flashCount; i++) {
      const angle = (i / flashCount) * Math.PI * 2 + timePhase * 20
      const distance = (Math.random() * 0.7 + 0.3) * maxRadius

      ctx.fillStyle = `rgba(255, 255, 255, ${audio.highs * 0.9})`
      ctx.beginPath()
      ctx.arc(
        centerX + Math.cos(angle) * distance,
        centerY + Math.sin(angle) * distance,
        4 + audio.highs * 4,
        0,
        Math.PI * 2,
      )
      ctx.fill()
    }
  }

  // Center void
  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.arc(centerX, centerY, 40, 0, Math.PI * 2)
  ctx.fill()

  // Center glow
  const glowGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 80)
  glowGradient.addColorStop(0, `rgba(0, 255, 200, ${0.3 + audio.energy * 0.4})`)
  glowGradient.addColorStop(1, 'rgba(0, 255, 200, 0)')
  ctx.fillStyle = glowGradient
  ctx.beginPath()
  ctx.arc(centerX, centerY, 80, 0, Math.PI * 2)
  ctx.fill()
}
