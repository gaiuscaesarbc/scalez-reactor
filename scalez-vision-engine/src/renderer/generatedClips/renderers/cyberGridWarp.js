export function renderCyberGridWarp(ctx, width, height, time, audio) {
  ctx.fillStyle = '#001a1a'
  ctx.fillRect(0, 0, width, height)

  const centerX = width / 2
  const centerY = height / 2
  const timePhase = time * 0.0008

  // Grid size controlled by audio
  const gridSize = 30 + audio.bass * 50
  const distortion = audio.mids * 0.5

  // Draw warped grid
  const gridCount = Math.ceil(Math.max(width, height) / gridSize) + 2
  ctx.strokeStyle = `hsl(180, 100%, ${50 + audio.energy * 30}%)`
  ctx.lineWidth = 2

  for (let i = -gridCount; i < gridCount; i++) {
    // Horizontal lines
    ctx.beginPath()
    for (let j = -gridCount; j < gridCount; j++) {
      const x = centerX + j * gridSize
      const baseY = centerY + i * gridSize
      const warp = Math.sin((x / width) * Math.PI * 2 + timePhase) * gridSize * distortion
      const y = baseY + warp

      if (j === -gridCount) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()

    // Vertical lines
    ctx.beginPath()
    for (let j = -gridCount; j < gridCount; j++) {
      const y = centerY + j * gridSize
      const baseX = centerX + i * gridSize
      const warp = Math.sin((y / height) * Math.PI * 2 + timePhase) * gridSize * distortion
      const x = baseX + warp

      if (j === -gridCount) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()
  }

  // Neon edge flashes on highs
  if (audio.highs > 0.3) {
    ctx.strokeStyle = `rgba(255, 0, 128, ${audio.highs * 0.8})`
    ctx.lineWidth = 1 + audio.highs * 3
    const flashRadius = Math.max(width, height) * 0.3
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2
      const x1 = centerX + Math.cos(angle) * flashRadius
      const y1 = centerY + Math.sin(angle) * flashRadius
      const x2 = centerX + Math.cos(angle + 0.3) * flashRadius
      const y2 = centerY + Math.sin(angle + 0.3) * flashRadius

      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
  }
}
