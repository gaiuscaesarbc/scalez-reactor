export function renderToxicWaveform(ctx, width, height, time, audio) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, '#1a0033')
  gradient.addColorStop(1, '#001a1a')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  const centerY = height * 0.6
  const timePhase = time * 0.001
  const waveHeight = audio.bass * 100 + 50

  // Waveform terrain
  ctx.fillStyle = `hsl(120, 100%, ${40 + audio.energy * 20}%)`
  ctx.beginPath()
  ctx.moveTo(0, height)

  for (let x = 0; x <= width; x += 5) {
    const progress = x / width
    const waveY = centerY +
      Math.sin(progress * Math.PI * 4 + timePhase * 2 + audio.mids * 1) * waveHeight +
      Math.sin(progress * Math.PI * 2 + timePhase + audio.bass * 0.5) * (waveHeight * 0.5)

    ctx.lineTo(x, waveY)
  }

  ctx.lineTo(width, height)
  ctx.closePath()
  ctx.fill()

  // Electric highlights
  ctx.strokeStyle = `hsl(120, 100%, 80%)`
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let x = 0; x <= width; x += 10) {
    const progress = x / width
    const waveY = centerY +
      Math.sin(progress * Math.PI * 4 + timePhase * 2) * waveHeight

    if (x === 0) {
      ctx.moveTo(x, waveY)
    } else {
      ctx.lineTo(x, waveY)
    }
  }
  ctx.stroke()

  // Electric noise on highs
  if (audio.highs > 0.3) {
    ctx.strokeStyle = `rgba(255, 0, 255, ${audio.highs * 0.7})`
    ctx.lineWidth = 1 + audio.highs * 2

    for (let i = 0; i < 8; i++) {
      const startX = Math.random() * width
      const startY = centerY + (Math.random() - 0.5) * waveHeight

      ctx.beginPath()
      ctx.moveTo(startX, startY)

      for (let j = 0; j < 5; j++) {
        const jitterX = startX + (Math.random() - 0.5) * 60
        const jitterY = startY + (Math.random() - 0.5) * 60

        ctx.lineTo(jitterX, jitterY)
      }
      ctx.stroke()
    }
  }

  // Wave speed control via mids
  const speedBoost = audio.mids * 0.5
  ctx.fillStyle = `rgba(0, 255, 0, ${0.1 + speedBoost * 0.2})`
  ctx.fillRect(0, centerY - 2, width, 4)
}
