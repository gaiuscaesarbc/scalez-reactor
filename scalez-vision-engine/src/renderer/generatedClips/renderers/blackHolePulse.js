export function renderBlackHolePulse(ctx, width, height, time, audio) {
  const centerX = width / 2
  const centerY = height / 2
  const maxRadius = Math.max(width, height)

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)

  const bassInfluence = audio.bass * 100 + 50
  const hisInfluence = audio.highs * 80

  // Vortex rings
  const ringCount = 8
  for (let i = 0; i < ringCount; i++) {
    const phase = (time * 0.001 + i * 0.3) % (Math.PI * 2)
    const radius = (maxRadius * 0.15) + i * (maxRadius * 0.08) + bassInfluence
    const distortion = Math.sin(phase) * audio.mids * 30

    ctx.strokeStyle = `hsl(${200 + i * 15}, 100%, ${50 + audio.energy * 20}%)`
    ctx.lineWidth = 3 + audio.highs * 4
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius + distortion, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Light streaks on highs
  if (audio.highs > 0.3) {
    ctx.strokeStyle = `rgba(0, 255, 224, ${audio.highs * 0.8})`
    ctx.lineWidth = 2 + audio.highs * 4
    for (let i = 0; i < 4; i++) {
      const angle = (time * 0.005 + (i / 4) * Math.PI * 2) % (Math.PI * 2)
      const streakLength = maxRadius * 0.4
      const startX = centerX + Math.cos(angle) * (maxRadius * 0.2)
      const startY = centerY + Math.sin(angle) * (maxRadius * 0.2)
      const endX = centerX + Math.cos(angle) * streakLength
      const endY = centerY + Math.sin(angle) * streakLength

      ctx.beginPath()
      ctx.moveTo(startX, startY)
      ctx.lineTo(endX, endY)
      ctx.stroke()
    }
  }
}
