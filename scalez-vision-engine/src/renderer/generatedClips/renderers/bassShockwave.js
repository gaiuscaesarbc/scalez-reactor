export function renderBassShockwave(ctx, width, height, time, audio) {
  ctx.fillStyle = '#1a0000'
  ctx.fillRect(0, 0, width, height)

  const centerX = width / 2
  const centerY = height / 2
  const maxRadius = Math.max(width, height) * 0.4
  const timePhase = time * 0.001

  // Expanding rings on bass
  const ringCount = 8
  for (let i = 0; i < ringCount; i++) {
    const phase = (audio.bass * i * 0.1 + timePhase) % 1
    const radius = maxRadius * phase

    ctx.strokeStyle = `hsl(40, 100%, ${50 + audio.energy * 30}%)`
    ctx.lineWidth = 4 + (1 - phase) * 6
    ctx.globalAlpha = 1 - phase
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // Distortion effect on mids
  if (audio.mids > 0.3) {
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2
      const innerRadius = maxRadius * 0.2
      const outerRadius = maxRadius * 0.4

      const distort = audio.mids * 50
      ctx.strokeStyle = `rgba(255, 100, 0, ${audio.mids * 0.5})`
      ctx.lineWidth = 2 + audio.mids * 3

      ctx.beginPath()
      const startAngle = angle + Math.sin(timePhase + i) * distort
      ctx.moveTo(
        centerX + Math.cos(startAngle) * innerRadius,
        centerY + Math.sin(startAngle) * innerRadius,
      )
      ctx.lineTo(
        centerX + Math.cos(startAngle + 0.1) * outerRadius,
        centerY + Math.sin(startAngle + 0.1) * outerRadius,
      )
      ctx.stroke()
    }
  }

  // Cracks/lightning on highs
  if (audio.highs > 0.3) {
    ctx.strokeStyle = `rgba(255, 255, 100, ${audio.highs * 0.8})`
    ctx.lineWidth = 1 + audio.highs * 2
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2
      const segments = Math.floor(4 + audio.highs * 8)

      ctx.beginPath()
      let x = centerX
      let y = centerY
      ctx.moveTo(x, y)

      for (let j = 0; j < segments; j++) {
        const dist = (maxRadius * 0.5) * (j / segments)
        const jitter = Math.random() * 20 - 10
        x = centerX + Math.cos(angle + jitter * 0.01) * dist
        y = centerY + Math.sin(angle + jitter * 0.01) * dist
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }
}
