export function renderLaserCathedral(ctx, width, height, time, audio) {
  ctx.fillStyle = '#0a0015'
  ctx.fillRect(0, 0, width, height)

  const centerX = width / 2
  const centerY = height / 2
  const timePhase = time * 0.0008
  const symmetry = 8

  // Laser beams
  for (let i = 0; i < symmetry; i++) {
    const baseAngle = (i / symmetry) * Math.PI * 2
    const movement = audio.mids * 0.3
    const angle = baseAngle + Math.sin(timePhase + i) * movement

    const beamLength = Math.max(width, height) * 0.5
    const beamWidth = 2 + 4 + audio.bass * 8

    const x1 = centerX
    const y1 = centerY
    const x2 = centerX + Math.cos(angle) * beamLength
    const y2 = centerY + Math.sin(angle) * beamLength

    // Gradient beam
    const gradient = ctx.createLinearGradient(x1, y1, x2, y2)
    const hue = (i * 40 + timePhase * 100) % 360
    gradient.addColorStop(0, `hsl(${hue}, 100%, 50%)`)
    gradient.addColorStop(0.5, `hsl(${(hue + 60) % 360}, 100%, 60%)`)
    gradient.addColorStop(1, `hsl(${(hue + 120) % 360}, 100%, 40%)`)

    ctx.strokeStyle = gradient
    ctx.lineWidth = beamWidth
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    // Laser glow
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + audio.energy * 0.4})`
    ctx.lineWidth = beamWidth * 3
    ctx.globalAlpha = 0.3
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // Flicker accents on highs
  if (audio.highs > 0.3) {
    ctx.strokeStyle = `rgba(255, 200, 0, ${audio.highs * 0.9})`
    ctx.lineWidth = 1
    for (let i = 0; i < symmetry; i++) {
      const angle = (i / symmetry) * Math.PI * 2 + timePhase * 20
      const flickerLength = Math.max(width, height) * (0.4 + audio.highs * 0.2)

      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.lineTo(
        centerX + Math.cos(angle) * flickerLength,
        centerY + Math.sin(angle) * flickerLength,
      )
      ctx.stroke()
    }
  }

  // Central glow
  const glowRadius = 30 + audio.energy * 60
  const glowGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius)
  glowGradient.addColorStop(0, `rgba(255, 255, 255, ${0.5 + audio.energy * 0.4})`)
  glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

  ctx.fillStyle = glowGradient
  ctx.beginPath()
  ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2)
  ctx.fill()
}
