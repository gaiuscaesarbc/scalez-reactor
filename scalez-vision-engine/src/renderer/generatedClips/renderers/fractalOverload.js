export function renderFractalOverload(ctx, width, height, time, audio) {
  const centerX = width / 2
  const centerY = height / 2
  const maxRadius = Math.max(width, height) * 0.4

  ctx.fillStyle = '#1a0a2e'
  ctx.fillRect(0, 0, width, height)

  const timePhase = time * 0.0005
  const zoom = 1 + audio.bass * 0.8
  const rotation = timePhase + audio.mids * 0.5

  // Fractal-like kaleidoscope using nested circles
  const levels = 6
  for (let level = 0; level < levels; level++) {
    const symmetry = 4 + Math.floor(audio.energy * 4)
    const radius = maxRadius * (1 - level / levels) * zoom

    for (let i = 0; i < symmetry; i++) {
      const angle = (i / symmetry) * Math.PI * 2 + rotation
      const x = centerX + Math.cos(angle) * radius
      const y = centerY + Math.sin(angle) * radius

      const hue = (level * 40 + i * 30 + timePhase * 100) % 360
      ctx.fillStyle = `hsl(${hue}, 100%, ${50 + audio.energy * 30}%)`

      ctx.beginPath()
      ctx.arc(x, y, 15 + level * 8, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Symmetry flashes on highs
  if (audio.highs > 0.3) {
    ctx.strokeStyle = `rgba(255, 0, 255, ${audio.highs * 0.8})`
    ctx.lineWidth = 2 + audio.highs * 4
    const flashRadius = maxRadius * (1 + audio.highs * 0.5)
    ctx.beginPath()
    ctx.arc(centerX, centerY, flashRadius, 0, Math.PI * 2)
    ctx.stroke()
  }
}
