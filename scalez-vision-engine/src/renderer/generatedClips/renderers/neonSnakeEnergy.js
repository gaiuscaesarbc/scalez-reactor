export function renderNeonSnakeEnergy(ctx, width, height, time, audio) {
  const centerX = width / 2
  const centerY = height / 2

  ctx.fillStyle = '#0a0015'
  ctx.fillRect(0, 0, width, height)

  // Multiple snakes
  const snakeCount = 3
  for (let s = 0; s < snakeCount; s++) {
    const offsetPhase = (s / snakeCount) * Math.PI * 2
    const snakeLength = 30
    const speed = 1.5 + audio.mids * 2

    ctx.strokeStyle = `hsl(${300 + s * 60}, 100%, ${50 + audio.energy * 30}%)`
    ctx.lineWidth = 8 + audio.bass * 12
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.beginPath()
    let firstPoint = true

    for (let i = 0; i < snakeLength; i++) {
      const progress = i / snakeLength
      const globalPhase = (time * 0.002 * speed + offsetPhase) % (Math.PI * 2)
      const segmentPhase = globalPhase + progress * Math.PI * 4

      const angle = segmentPhase
      const distance = Math.sin(progress * Math.PI) * (width * 0.2)
      const x = centerX + Math.cos(angle) * distance
      const y = centerY + Math.sin(angle) * distance

      if (firstPoint) {
        ctx.moveTo(x, y)
        firstPoint = false
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()
  }

  // Sparks on highs
  if (audio.highs > 0.4) {
    const sparkCount = Math.floor(audio.highs * 20)
    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const distance = Math.random() * (width * 0.3) + width * 0.1
      const x = centerX + Math.cos(angle) * distance
      const y = centerY + Math.sin(angle) * distance

      ctx.fillStyle = `rgba(0, 255, 136, ${audio.highs * 0.9})`
      ctx.beginPath()
      ctx.arc(x, y, 2 + audio.highs * 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
