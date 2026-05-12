export function renderPlasmaMeltdown(ctx, width, height, time, audio) {
  ctx.fillStyle = '#1a0000'
  ctx.fillRect(0, 0, width, height)

  const noiseScale = 50
  const bassInfluence = audio.bass * 150
  const timePhase = time * 0.001

  // Create molten plasma field using turbulence-like pattern
  for (let y = 0; y < height; y += 10) {
    for (let x = 0; x < width; x += 10) {
      const nx = x / width
      const ny = y / height

      // Pseudo-turbulence
      const noise = Math.sin(nx * 10 + timePhase) * Math.cos(ny * 10 + timePhase) *
        Math.sin(nx + ny + timePhase * 0.5)

      const value = 0.5 + noise * 0.5 + audio.mids * 0.3 + audio.bass * 0.4
      const hue = 20 + value * 30 + bassInfluence * 0.01
      const sat = 100
      const light = Math.max(30, 40 + value * 40 + audio.highs * 30)

      ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`
      ctx.fillRect(x, y, 12, 12)
    }
  }

  // Shockwaves on bass
  if (audio.bass > 0.5) {
    const shockRadius = audio.bass * width * 0.3
    ctx.strokeStyle = `rgba(255, 255, 100, ${audio.bass * 0.6})`
    ctx.lineWidth = 3 + audio.bass * 6
    ctx.beginPath()
    ctx.arc(width / 2, height / 2, shockRadius, 0, Math.PI * 2)
    ctx.stroke()
  }

  // White-hot flickers on highs
  if (audio.highs > 0.3) {
    const flickerCount = Math.floor(audio.highs * 15)
    for (let i = 0; i < flickerCount; i++) {
      const x = Math.random() * width
      const y = Math.random() * height
      const size = 2 + Math.random() * 8

      ctx.fillStyle = `rgba(255, 255, 255, ${audio.highs * 0.8})`
      ctx.fillRect(x, y, size, size)
    }
  }
}
