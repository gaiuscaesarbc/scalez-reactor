export function renderDemonCore(ctx, width, height, time, audio) {
  ctx.fillStyle = '#1a0a00'
  ctx.fillRect(0, 0, width, height)

  const centerX = width / 2
  const centerY = height / 2
  const timePhase = time * 0.001

  // Core orb
  const coreRadius = 60 + audio.bass * 80
  const coreGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreRadius)
  coreGradient.addColorStop(0, `rgba(255, 100, 0, ${0.6 + audio.energy * 0.4})`)
  coreGradient.addColorStop(0.6, `rgba(255, 0, 0, ${0.4 + audio.energy * 0.3})`)
  coreGradient.addColorStop(1, `rgba(100, 0, 0, ${0.1 + audio.energy * 0.2})`)

  ctx.fillStyle = coreGradient
  ctx.beginPath()
  ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2)
  ctx.fill()

  // Energy bands rotating
  const bandCount = 6
  for (let i = 0; i < bandCount; i++) {
    const angle = (i / bandCount) * Math.PI * 2 + timePhase * audio.mids * 2
    const bandRadius = coreRadius + 30

    ctx.strokeStyle = `hsl(${30 + i * 40}, 100%, ${50 + audio.energy * 30}%)`
    ctx.lineWidth = 3 + audio.energy * 4
    ctx.globalAlpha = 0.6 + audio.energy * 0.4

    ctx.beginPath()
    ctx.arc(centerX, centerY, bandRadius, angle - 0.3, angle + 0.3)
    ctx.stroke()

    ctx.globalAlpha = 1
  }

  // Outer ring bands
  const ringCount = 3
  for (let i = 0; i < ringCount; i++) {
    const ringRadius = coreRadius + 50 + i * 40
    const angle = (i / ringCount) * Math.PI * 2 + timePhase

    ctx.strokeStyle = `hsl(${20 + i * 20}, 80%, 60%)`
    ctx.lineWidth = 2 + audio.mids * 3

    for (let j = 0; j < 4; j++) {
      const arcAngle = angle + (j / 4) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(centerX, centerY, ringRadius, arcAngle, arcAngle + 0.5)
      ctx.stroke()
    }
  }

  // Sparks and cracks on highs
  if (audio.highs > 0.3) {
    const sparkCount = Math.floor(audio.highs * 20)
    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const distance = coreRadius + Math.random() * 100
      const x = centerX + Math.cos(angle) * distance
      const y = centerY + Math.sin(angle) * distance

      ctx.fillStyle = `rgba(255, 255, 100, ${audio.highs * 0.9})`
      ctx.beginPath()
      ctx.arc(x, y, 2 + audio.highs * 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // Cracks
    ctx.strokeStyle = `rgba(255, 150, 0, ${audio.highs * 0.8})`
    ctx.lineWidth = 1 + audio.highs * 2
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2
      const segments = Math.floor(3 + audio.highs * 4)

      ctx.beginPath()
      let x = centerX
      let y = centerY
      ctx.moveTo(x, y)

      for (let j = 0; j < segments; j++) {
        const dist = (coreRadius + 80) * (j / segments)
        const jitter = Math.random() * 15 - 7.5
        x = centerX + Math.cos(angle + jitter * 0.01) * dist
        y = centerY + Math.sin(angle + jitter * 0.01) * dist
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }

  // Reactor glow
  const glowRadius = coreRadius * 1.5
  const glowGradient = ctx.createRadialGradient(centerX, centerY, coreRadius, centerX, centerY, glowRadius)
  glowGradient.addColorStop(0, `rgba(255, 100, 0, 0.4)`)
  glowGradient.addColorStop(1, 'rgba(255, 100, 0, 0)')

  ctx.fillStyle = glowGradient
  ctx.beginPath()
  ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2)
  ctx.fill()
}
