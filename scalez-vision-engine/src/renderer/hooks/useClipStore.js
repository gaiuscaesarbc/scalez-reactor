import { useEffect, useMemo, useRef, useState } from 'react'
import { loadStore, saveStore } from '../utils/storage'

const LAYER_COUNT = 3
const SLOT_COUNT = 50
const LIKELY_UNSUPPORTED_EXTENSIONS = new Set(['mov', 'avi', 'mkv'])

function toMediaUrl(filePath) {
  if (!filePath) {
    return ''
  }
  if (window.scalezApi?.toMediaUrl) {
    return window.scalezApi.toMediaUrl(filePath)
  }
  const normalized = filePath.replace(/\\/g, '/')
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return encodeURI(`file:///${normalized}`)
  }
  return encodeURI(`file://${normalized}`)
}

function getFileExtension(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return ''
  }
  const fileName = filePath.split(/[\\/]/).pop() || ''
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === fileName.length - 1) {
    return ''
  }
  return fileName.slice(dotIndex + 1).toLowerCase()
}

function classifyVideoIssue({ extension, errorCode }) {
  if (errorCode === 4 || errorCode === 3 || LIKELY_UNSUPPORTED_EXTENSIONS.has(extension)) {
    return 'unsupported'
  }
  return 'failed'
}

function probeVideoPlayable(filePath) {
  return new Promise((resolve) => {
    const src = toMediaUrl(filePath)
    const video = document.createElement('video')
    // Use 'auto' preload so the browser tries to fully buffer + decode, not just read metadata.
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    // Append offscreen so the decoder actually initializes (required by some Chromium codecs).
    video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none'
    document.body.appendChild(video)

    let settled = false

    const cleanup = () => {
      video.oncanplay = null
      video.onerror = null
      video.ontimeupdate = null
      try {
        video.pause()
      } catch {
        // ignore
      }
      video.removeAttribute('src')
      video.load()
      if (video.parentNode) {
        video.parentNode.removeChild(video)
      }
    }

    const finish = (result) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve(result)
    }

    // 8s total — generous enough for large files / slow disks.
    const timeout = setTimeout(() => {
      finish({ ok: false, src, errorCode: 4, message: 'Timed out while probing codec support.' })
    }, 8000)

    // `timeupdate` fires only after at least one decoded video frame — this confirms codec support.
    video.ontimeupdate = () => {
      clearTimeout(timeout)
      finish({ ok: true, src })
    }

    video.onerror = () => {
      clearTimeout(timeout)
      const mediaError = video.error
      finish({
        ok: false,
        src,
        errorCode: mediaError?.code || 4,
        message: mediaError?.message || 'Video failed to load or decode in Chromium/Electron.',
      })
    }

    // On canplay: container is readable. Now try to play so the decoder starts.
    // Decode errors (HEVC, AV1, unsupported codec) surface as errors during play, not before.
    video.oncanplay = () => {
      video.play().catch((playError) => {
        clearTimeout(timeout)
        finish({
          ok: false,
          src,
          errorCode: 4,
          message: playError?.message || 'play() rejected during codec probe.',
        })
      })
    }

    video.src = src
    video.load()
  })
}

function makeDefaultSlot(slotIndex) {
  return {
    slotIndex,
    clipName: '',
    filePath: '',
    status: 'empty',
    errorMessage: '',
    preloadedVideoRef: null,
  }
}

function makeDefaultLayer(layerIndex) {
  return {
    layerIndex,
    label: `L${layerIndex + 1}`,
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    activeSlotIndex: null,
    slots: Array.from({ length: SLOT_COUNT }, (_, slotIndex) => makeDefaultSlot(slotIndex)),
  }
}

function normalizeStore(stored) {
  const fallback = Array.from({ length: LAYER_COUNT }, (_, index) => makeDefaultLayer(index))
  if (!stored || !Array.isArray(stored.layers)) {
    return fallback
  }

  return fallback.map((layer) => {
    const storedLayer = stored.layers[layer.layerIndex]
    if (!storedLayer) {
      return layer
    }

    const slots = layer.slots.map((slot) => {
      const storedSlot = storedLayer.slots?.[slot.slotIndex]
      if (!storedSlot) {
        return slot
      }
      return {
        ...slot,
        clipName: storedSlot.clipName || '',
        filePath: storedSlot.filePath || '',
        status: storedSlot.status || 'empty',
        errorMessage: storedSlot.errorMessage || '',
        preloadedVideoRef: null,
      }
    })

    return {
      ...layer,
      visible: typeof storedLayer.visible === 'boolean' ? storedLayer.visible : true,
      opacity: typeof storedLayer.opacity === 'number' ? storedLayer.opacity : 1,
      blendMode: storedLayer.blendMode || 'normal',
      activeSlotIndex:
        typeof storedLayer.activeSlotIndex === 'number' ? storedLayer.activeSlotIndex : null,
      slots,
    }
  })
}

function persistLayers(layers) {
  saveStore({ layers })
}

export function useClipStore() {
  const [layers, setLayers] = useState(() => normalizeStore(loadStore()))
  const [midiMappings, setMidiMappings] = useState({})
  const slotProbeVersionRef = useRef({})

  const updateLayers = (mutator) => {
    setLayers((current) => {
      const next = mutator(current)
      persistLayers(next)
      return next
    })
  }

  const setLayerVisible = (layerIndex, visible) => {
    updateLayers((current) =>
      current.map((layer) =>
        layer.layerIndex === layerIndex ? { ...layer, visible } : layer,
      ),
    )
  }

  const setLayerOpacity = (layerIndex, opacity) => {
    updateLayers((current) =>
      current.map((layer) =>
        layer.layerIndex === layerIndex ? { ...layer, opacity } : layer,
      ),
    )
  }

  const setLayerBlendMode = (layerIndex, blendMode) => {
    updateLayers((current) =>
      current.map((layer) =>
        layer.layerIndex === layerIndex ? { ...layer, blendMode } : layer,
      ),
    )
  }

  const clearLayer = (layerIndex) => {
    updateLayers((current) =>
      current.map((layer) =>
        layer.layerIndex === layerIndex ? { ...layer, activeSlotIndex: null } : layer,
      ),
    )
  }

  const clearSlot = (layerIndex, slotIndex) => {
    updateLayers((current) =>
      current.map((layer) => {
        if (layer.layerIndex !== layerIndex) {
          return layer
        }

        if (slotIndex < 0 || slotIndex >= layer.slots.length) {
          return layer
        }

        const slots = layer.slots.map((slot) =>
          slot.slotIndex === slotIndex ? makeDefaultSlot(slotIndex) : slot,
        )

        const nextActiveSlotIndex = layer.activeSlotIndex === slotIndex ? null : layer.activeSlotIndex

        return {
          ...layer,
          slots,
          activeSlotIndex: nextActiveSlotIndex,
        }
      }),
    )
  }

  const triggerClip = (layerIndex, slotIndex) => {
    updateLayers((current) =>
      current.map((layer) => {
        if (layer.layerIndex !== layerIndex) {
          return layer
        }
        const slot = layer.slots[slotIndex]
        if (
          !slot ||
          slot.status === 'empty' ||
          slot.status === 'missing' ||
          slot.status === 'failed' ||
          slot.status === 'unsupported'
        ) {
          return layer
        }
        return { ...layer, activeSlotIndex: slotIndex }
      }),
    )
  }

  const markSlotMissing = (layerIndex, slotIndex, isMissing) => {
    updateLayers((current) =>
      current.map((layer) => {
        if (layer.layerIndex !== layerIndex) {
          return layer
        }

        const slots = layer.slots.map((slot) => {
          if (slot.slotIndex !== slotIndex || !slot.filePath) {
            return slot
          }

          return {
            ...slot,
            status: isMissing ? 'missing' : 'loaded',
          }
        })

        const activeIsMissing =
          layer.activeSlotIndex === slotIndex && slots[slotIndex]?.status === 'missing'

        return {
          ...layer,
          slots,
          activeSlotIndex: activeIsMissing ? null : layer.activeSlotIndex,
        }
      }),
    )
  }

  const markSlotFailed = (layerIndex, slotIndex, errorMessage, errorType = 'failed') => {
    updateLayers((current) =>
      current.map((layer) => {
        if (layer.layerIndex !== layerIndex) {
          return layer
        }

        const slots = layer.slots.map((slot) => {
          if (slot.slotIndex !== slotIndex) {
            return slot
          }

          return {
            ...slot,
            status: errorType === 'unsupported' ? 'unsupported' : 'failed',
            errorMessage,
          }
        })

        const activeFailed =
          layer.activeSlotIndex === slotIndex &&
          (slots[slotIndex]?.status === 'failed' || slots[slotIndex]?.status === 'unsupported')

        return {
          ...layer,
          slots,
          activeSlotIndex: activeFailed ? null : layer.activeSlotIndex,
        }
      }),
    )
  }

  const loadClipIntoSlot = async (layerIndex, slotIndex) => {
    const picked = await window.scalezApi?.pickVideoFile?.()
    if (!picked?.filePath) {
      return
    }

    const extension = getFileExtension(picked.filePath)
    const likelyUnsupported = LIKELY_UNSUPPORTED_EXTENSIONS.has(extension)
    if (import.meta.env.DEV) {
      console.info(
        `[video:pick] layer=${layerIndex + 1} slot=${slotIndex + 1} file=${picked.filePath} ext=${extension || 'n/a'} likelyUnsupported=${likelyUnsupported}`,
      )
    }

    const probeKey = `${layerIndex}-${slotIndex}`
    const nextVersion = (slotProbeVersionRef.current[probeKey] || 0) + 1
    slotProbeVersionRef.current[probeKey] = nextVersion

    const exists = await window.scalezApi?.pathExists?.(picked.filePath)
    if (exists === false) {
      markSlotFailed(layerIndex, slotIndex, 'Missing file: selected path no longer exists.', 'failed')
      return
    }

    const probeResult = await probeVideoPlayable(picked.filePath)
    if (slotProbeVersionRef.current[probeKey] !== nextVersion) {
      return
    }

    if (import.meta.env.DEV) {
      if (probeResult.ok) {
        console.info(`[video:probe] canplay src=${probeResult.src}`)
      } else {
        console.warn(
          `[video:probe] failed src=${probeResult.src} code=${probeResult.errorCode || 'n/a'} message=${probeResult.message || 'n/a'}`,
        )
      }
    }

    if (!probeResult.ok) {
      const issueType = classifyVideoIssue({
        extension,
        errorCode: probeResult.errorCode,
      })
      const unsupportedHint =
        issueType === 'unsupported'
          ? 'Unsupported format/codec. Prefer MP4 (H.264) or WebM (VP8/VP9).'
          : 'Video load failed. Check file path and permissions.'
      const message = `${unsupportedHint} ${probeResult.message || ''}`.trim()
      markSlotFailed(layerIndex, slotIndex, message, issueType)
      return
    }

    const warning = likelyUnsupported
      ? ' (Container loaded, but codec compatibility may still fail during playback. Prefer MP4 H.264 or WebM VP8/VP9.)'
      : ''

    updateLayers((current) =>
      current.map((layer) => {
        if (layer.layerIndex !== layerIndex) {
          return layer
        }

        const slots = layer.slots.map((slot) => {
          if (slot.slotIndex !== slotIndex) {
            return slot
          }
          return {
            ...slot,
            clipName: picked.clipName,
            filePath: picked.filePath,
            status: 'loaded',
            errorMessage: warning,
          }
        })

        return {
          ...layer,
          slots,
          activeSlotIndex: slotIndex,
        }
      }),
    )
  }

  useEffect(() => {
    let canceled = false

    async function validatePaths() {
      const checks = []
      for (const layer of layers) {
        for (const slot of layer.slots) {
          if (slot.filePath) {
            checks.push({
              layerIndex: layer.layerIndex,
              slotIndex: slot.slotIndex,
              filePath: slot.filePath,
              status: slot.status,
            })
          }
        }
      }

      for (const check of checks) {
        if (canceled) {
          break
        }

        const exists = await window.scalezApi?.pathExists?.(check.filePath)
        if (canceled) {
          break
        }

        if (exists === false) {
          markSlotMissing(check.layerIndex, check.slotIndex, true)
          continue
        }

        // Re-probe any clip that was previously marked loaded so that files
        // encoded with unsupported codecs (e.g. HEVC/H.265 MP4) get caught
        // at startup rather than failing silently during playback.
        if (check.status === 'loaded') {
          const probeResult = await probeVideoPlayable(check.filePath)
          if (canceled) {
            break
          }

          if (!probeResult.ok) {
            const extension = getFileExtension(check.filePath)
            const issueType = classifyVideoIssue({ extension, errorCode: probeResult.errorCode })
            const hint =
              issueType === 'unsupported'
                ? 'Unsupported format/codec. Prefer MP4 (H.264) or WebM (VP8/VP9).'
                : 'Video failed to reload. Check file path and permissions.'
            const message = `${hint} ${probeResult.message || ''}`.trim()
            markSlotFailed(check.layerIndex, check.slotIndex, message, issueType)
            if (import.meta.env.DEV) {
              console.warn(
                `[video:startup-reprobe] failed layer=${check.layerIndex + 1} slot=${check.slotIndex + 1} code=${probeResult.errorCode} message=${probeResult.message}`,
              )
            }
          }
        }
      }
    }

    validatePaths()

    return () => {
      canceled = true
    }
  }, [])

  const visibleLayers = useMemo(() => layers.filter((layer) => layer.visible), [layers])

  const revalidateImportedSlots = async (showLayers) => {
    if (!Array.isArray(showLayers)) {
      return
    }

    for (const showLayer of showLayers) {
      const layerIndex = layers.find((layer) => layer.label === showLayer.label)?.layerIndex
      if (typeof layerIndex !== 'number') {
        continue
      }

      const slots = Array.isArray(showLayer.slots) ? showLayer.slots : []
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        const slot = slots[slotIndex]
        if (!slot?.filePath) {
          continue
        }

        const probeKey = `${layerIndex}-${slotIndex}`
        const nextVersion = (slotProbeVersionRef.current[probeKey] || 0) + 1
        slotProbeVersionRef.current[probeKey] = nextVersion

        const exists = await window.scalezApi?.pathExists?.(slot.filePath)
        if (slotProbeVersionRef.current[probeKey] !== nextVersion) {
          continue
        }
        if (exists === false) {
          markSlotMissing(layerIndex, slotIndex, true)
          continue
        }

        if (slot.status !== 'loaded') {
          continue
        }

        const probeResult = await probeVideoPlayable(slot.filePath)
        if (slotProbeVersionRef.current[probeKey] !== nextVersion) {
          continue
        }
        if (!probeResult.ok) {
          const extension = getFileExtension(slot.filePath)
          const issueType = classifyVideoIssue({ extension, errorCode: probeResult.errorCode })
          const hint =
            issueType === 'unsupported'
              ? 'Unsupported format/codec. Prefer MP4 (H.264) or WebM (VP8/VP9).'
              : 'Video failed to reload. Check file path and permissions.'
          const message = `${hint} ${probeResult.message || ''}`.trim()
          markSlotFailed(layerIndex, slotIndex, message, issueType)
        }
      }
    }
  }

  const saveShow = (showName, midiMappings_, appSettings) => {
    const showData = {
      name: showName,
      timestamp: new Date().toISOString(),
      layers: layers.map((layer) => ({
        label: layer.label,
        visible: layer.visible,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        activeSlotIndex: layer.activeSlotIndex,
        slots: layer.slots.map((slot) => ({
          clipName: slot.clipName,
          filePath: slot.filePath,
          status: slot.status,
        })),
      })),
      midiMappings: midiMappings_ || midiMappings || {},
      appSettings: appSettings || null,
    }
    const shows = JSON.parse(localStorage.getItem('scalez_shows') || '[]')
    const existingIdx = shows.findIndex((s) => s.name === showName)
    if (existingIdx >= 0) {
      shows[existingIdx] = showData
    } else {
      shows.push(showData)
    }
    localStorage.setItem('scalez_shows', JSON.stringify(shows))
    localStorage.setItem('scalez_last_show', showName)
    return showData
  }

  const autosaveShow = (midiMappings_, appSettings) => {
    const autosaveName = '__autosave__'
    const existingAutosaveRaw = localStorage.getItem('scalez_autosave')
    let existingAutosave = null
    if (existingAutosaveRaw) {
      try {
        existingAutosave = JSON.parse(existingAutosaveRaw)
      } catch {
        existingAutosave = null
      }
    }

    const showData = {
      name: autosaveName,
      timestamp: new Date().toISOString(),
      layers: layers.map((layer) => ({
        label: layer.label,
        visible: layer.visible,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        activeSlotIndex: layer.activeSlotIndex,
        slots: layer.slots.map((slot) => ({
          clipName: slot.clipName,
          filePath: slot.filePath,
          status: slot.status,
        })),
      })),
      midiMappings: midiMappings_ || midiMappings || {},
      appSettings:
        appSettings != null
          ? appSettings
          : (existingAutosave?.appSettings ?? null),
    }
    localStorage.setItem('scalez_autosave', JSON.stringify(showData))
  }

  const applyShowData = (showData) => {
    if (!showData || !Array.isArray(showData.layers)) {
      return { ok: false, appSettings: null }
    }

    updateLayers((current) =>
      current.map((layer) => {
        const showLayer = showData.layers.find((sl) => sl.label === layer.label)
        if (!showLayer) return layer

        const slots = layer.slots.map((slot, idx) => {
          const showSlot = showLayer.slots[idx]
          return showSlot
            ? {
                ...slot,
                clipName: showSlot.clipName,
                filePath: showSlot.filePath,
                status: showSlot.status,
                errorMessage: '',
              }
            : slot
        })

        return {
          ...layer,
          visible: showLayer.visible,
          opacity: showLayer.opacity,
          blendMode: showLayer.blendMode,
          activeSlotIndex:
            typeof showLayer.activeSlotIndex === 'number' ? showLayer.activeSlotIndex : null,
          slots,
        }
      }),
    )

    if (showData.midiMappings) {
      setMidiMappings(showData.midiMappings)
    } else {
      setMidiMappings({})
    }

    void revalidateImportedSlots(showData.layers)
    return { ok: true, appSettings: showData.appSettings || null }
  }

  const restoreLastShow = () => {
    const lastShowName = localStorage.getItem('scalez_last_show')
    const autosaveRaw = localStorage.getItem('scalez_autosave')

    let autosaveData = null
    if (autosaveRaw) {
      try {
        autosaveData = JSON.parse(autosaveRaw)
      } catch {
        autosaveData = null
      }
    }

    const shows = JSON.parse(localStorage.getItem('scalez_shows') || '[]')
    const lastShowData =
      lastShowName && lastShowName !== '__autosave__'
        ? shows.find((s) => s.name === lastShowName)
        : null

    const autosaveTs = autosaveData?.timestamp ? Date.parse(autosaveData.timestamp) : Number.NaN
    const lastShowTs = lastShowData?.timestamp ? Date.parse(lastShowData.timestamp) : Number.NaN

    // Load whichever snapshot is newest so startup reflects the latest saved state.
    if (autosaveData && (Number.isNaN(lastShowTs) || autosaveTs >= lastShowTs)) {
      return applyShowData(autosaveData)
    }

    if (lastShowData) {
      return applyShowData(lastShowData)
    }

    return { ok: false, appSettings: null }
  }

  const loadShow = (showName) => {
    const shows = JSON.parse(localStorage.getItem('scalez_shows') || '[]')
    const show = shows.find((s) => s.name === showName)
    if (!show) return false

    localStorage.setItem('scalez_last_show', showName)
    return applyShowData(show)
  }

  const getSavedShows = () => {
    return JSON.parse(localStorage.getItem('scalez_shows') || '[]')
  }

  const deleteShow = (showName) => {
    const shows = JSON.parse(localStorage.getItem('scalez_shows') || '[]')
    const filtered = shows.filter((s) => s.name !== showName)
    localStorage.setItem('scalez_shows', JSON.stringify(filtered))
  }

  // Autosave every 30 seconds
  useEffect(() => {
    const autosaveInterval = setInterval(() => {
      autosaveShow()
    }, 30000)

    return () => clearInterval(autosaveInterval)
  }, [layers])

  return {
    layers,
    visibleLayers,
    midiMappings,
    setMidiMappings,
    setLayerVisible,
    setLayerOpacity,
    setLayerBlendMode,
    clearLayer,
    clearSlot,
    triggerClip,
    loadClipIntoSlot,
    markSlotFailed,
    saveShow,
    loadShow,
    getSavedShows,
    deleteShow,
    autosaveShow,
    restoreLastShow,
  }
}
