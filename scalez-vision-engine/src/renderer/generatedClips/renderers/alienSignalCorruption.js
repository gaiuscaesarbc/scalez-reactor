export function renderAlienSignalCorruption(ctx, width, height, time, audio) {
  ctx.fillStyle = '#001a00'
  ctx.fillRect(0, 0, width, height)

  const timePhase = time * 0.001
  const glitchAmount = audio.mids * 80

  // Scanlines
  const scanlineFreq = 0.6
  for (let y = 0; y < height; y += 8) {
    const phase = (y / height) * Math.PI * 2 + timePhase
    const glitch = Math.sin(phase * 10) * glitchAmount

    ctx.fillStyle = `rgba(0, 255, 0, ${0.1 + audio.mids * 0.4})`
    ctx.fillRect(0 + glitch * 0.1, y, width - glitch * 0.2, 4)
  }

  // Digital noise blocks
  const blockSize = 20
  for (let y = 0; y < height; y += blockSize) {
    for (let x = 0; x < width; x += blockSize) {
      const noiseVal = Math.sin(x * 0.01 + y * 0.01 + timePhase) * 0.5 + 0.5
      if (noiseVal > 0.5) {
        const glitchX = Math.sin(timePhase + x * 0.001) * glitchAmount
        ctx.fillStyle = `rgba(255, 0, 255, ${noiseVal * audio.energy})`
        ctx.fillRect(x + glitchX, y, blockSize, blockSize)
      }
    }
  }

  // Glitch slices on highs
  if (audio.highs > 0.4) {
    const sliceCount = Math.floor(audio.highs * 8)
    for (let i = 0; i < sliceCount; i++) {
      const y = Math.random() * height
      const height2 = 2 + Math.random() * 8
      const glitchX = Math.random() * 40 - 20

      ctx.fillStyle = `rgba(0, 255, 255, ${audio.highs * 0.7})`
      ctx.fillRect(glitchX, y, width - glitchX * 2, height2)
    }
  }
}
