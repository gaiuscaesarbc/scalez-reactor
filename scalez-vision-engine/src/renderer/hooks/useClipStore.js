import { useEffect, useMemo, useRef, useState } from 'react'
import { loadStore, saveStore } from '../utils/storage'
import { GENERATED_CLIP_PRESETS } from '../generatedClips/generatedClipPresets'

const LAYER_COUNT = 3
const SLOT_COUNT = 50
const LIKELY_UNSUPPORTED_EXTENSIONS = new Set(['mov', 'avi', 'mkv'])
const SHOWS_STORAGE_KEY = 'scalez_shows'
const LAST_SHOW_STORAGE_KEY = 'scalez_last_show'
const AUTOSAVE_STORAGE_KEY = 'scalez_autosave'
const MIDI_MAPPINGS_STORAGE_KEY = 'scalez_midi_mappings'
const LEGACY_SHOWS_STORAGE_KEYS = [
  'scalez_shows',
  'scalez.shows',
  'scalez-shows',
  'scalezVisionShows',
  'scalez_vision_shows',
  'shows',
]

function parseStoredJson(rawValue, fallbackValue) {
  if (rawValue == null || rawValue === '') {
    return fallbackValue
  }

  const tryParse = (value) => {
    if (typeof value !== 'string') {
      return value
    }
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }

  try {
    let parsed = JSON.parse(rawValue)
    // Legacy builds may have stored JSON as a stringified JSON string.
    for (let depth = 0; depth < 3; depth += 1) {
      if (typeof parsed !== 'string') {
        break
      }
      const trimmed = parsed.trim()
      if (!trimmed || !['{', '[', '"'].includes(trimmed[0])) {
        break
      }
      const nextParsed = tryParse(trimmed)
      if (nextParsed === parsed) {
        break
      }
      parsed = nextParsed
    }
    return parsed
  } catch {
    return fallbackValue
  }
}

function normalizeShowName(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

function isSameShowName(left, right) {
  const a = normalizeShowName(left)
  const b = normalizeShowName(right)
  if (!a || !b) {
    return false
  }
  return a.toLowerCase() === b.toLowerCase()
}

function isShowLikeEntry(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && Array.isArray(value.layers)
    && value.layers.length > 0
  )
}

function readShowsFromStorage() {
  const seenByName = new Map()

  const registerEntry = (entry, fallbackName = '') => {
    if (!isShowLikeEntry(entry)) {
      return
    }

    const normalizedName = normalizeShowName(entry.name || fallbackName)
    if (!normalizedName) {
      return
    }

    const current = seenByName.get(normalizedName)
    const currentTs = Date.parse(current?.timestamp || 0)
    const nextTs = Date.parse(entry?.timestamp || 0)
    if (!current || nextTs >= currentTs) {
      seenByName.set(normalizedName, {
        ...entry,
        name: normalizedName,
      })
    }
  }

  const registerParsed = (parsedValue, sourceKey = '') => {
    if (!parsedValue) {
      return
    }

    if (Array.isArray(parsedValue)) {
      parsedValue.forEach((entry, index) => {
        registerEntry(entry, `${sourceKey} #${index + 1}`)
      })
      return
    }

    if (typeof parsedValue !== 'object') {
      return
    }

    if (Array.isArray(parsedValue.shows)) {
      parsedValue.shows.forEach((entry, index) => {
        registerEntry(entry, `${sourceKey} show ${index + 1}`)
      })
    }

    if (isShowLikeEntry(parsedValue)) {
      registerEntry(parsedValue, sourceKey)
    }

    Object.entries(parsedValue).forEach(([key, value]) => {
      if (key === 'shows' && Array.isArray(value)) {
        return
      }
      registerEntry(value, key)
    })
  }

  LEGACY_SHOWS_STORAGE_KEYS.forEach((key) => {
    const parsed = parseStoredJson(localStorage.getItem(key), null)
    registerParsed(parsed, key)
  })

  // Recovery pass: scan all localStorage keys for show-like payloads.
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key) {
      continue
    }
    const parsed = parseStoredJson(localStorage.getItem(key), null)
    registerParsed(parsed, key)
  }

  const combined = Array.from(seenByName.values())
  if (combined.length > 0) {
    writeShowsToStorage(combined)
  }
  return combined
}

function writeShowsToStorage(shows) {
  localStorage.setItem(SHOWS_STORAGE_KEY, JSON.stringify(shows))
}

function readLastShowName() {
  const candidates = [
    LAST_SHOW_STORAGE_KEY,
    'scalez.last_show',
    'scalez-last-show',
    'scalezLastShow',
  ]

  for (const key of candidates) {
    const value = normalizeShowName(localStorage.getItem(key) || '')
    if (value) {
      return value
    }
  }

  return ''
}

function findShowByName(shows, showName) {
  const requested = normalizeShowName(showName)
  if (!requested) {
    return null
  }

  const exact = shows.find((entry) => normalizeShowName(entry?.name) === requested)
  if (exact) {
    return exact
  }

  return (
    shows.find(
      (entry) => normalizeShowName(entry?.name).toLowerCase() === requested.toLowerCase(),
    ) || null
  )
}

function pruneShowFromParsedValue(parsedValue, sourceKey, targetName) {
  if (parsedValue == null) {
    return { changed: false, deleteKey: false, nextValue: parsedValue }
  }

  if (Array.isArray(parsedValue)) {
    const nextArray = parsedValue.filter((entry) => {
      if (!isShowLikeEntry(entry)) {
        return true
      }
      const entryName = normalizeShowName(entry.name)
      return !isSameShowName(entryName, targetName)
    })
    return {
      changed: nextArray.length !== parsedValue.length,
      deleteKey: nextArray.length === 0,
      nextValue: nextArray,
    }
  }

  if (typeof parsedValue !== 'object') {
    return { changed: false, deleteKey: false, nextValue: parsedValue }
  }

  if (isShowLikeEntry(parsedValue)) {
    const entryName = normalizeShowName(parsedValue.name || sourceKey)
    if (isSameShowName(entryName, targetName)) {
      return { changed: true, deleteKey: true, nextValue: null }
    }
    return { changed: false, deleteKey: false, nextValue: parsedValue }
  }

  let changed = false
  const nextObject = { ...parsedValue }

  if (Array.isArray(parsedValue.shows)) {
    const nextShows = parsedValue.shows.filter((entry) => {
      if (!isShowLikeEntry(entry)) {
        return true
      }
      return !isSameShowName(entry.name, targetName)
    })
    if (nextShows.length !== parsedValue.shows.length) {
      changed = true
      nextObject.shows = nextShows
    }
  }

  Object.entries(parsedValue).forEach(([key, value]) => {
    if (key === 'shows') {
      return
    }
    if (!isShowLikeEntry(value)) {
      return
    }
    const entryName = normalizeShowName(value.name || key)
    if (isSameShowName(entryName, targetName)) {
      delete nextObject[key]
      changed = true
    }
  })

  const hasValues = Object.keys(nextObject).length > 0
  return {
    changed,
    deleteKey: !hasValues,
    nextValue: nextObject,
  }
}

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
    type: 'video',
    status: 'empty',
    errorMessage: '',
    preloadedVideoRef: null,
    clipBpm: 140,
  }
}

function makeGeneratedClipSlot(slotIndex, generatedClip) {
  return {
    slotIndex,
    id: generatedClip.id,
    clipName: generatedClip.name,
    filePath: '',
    type: 'generated',
    generatorType: generatedClip.generatorType,
    status: 'loaded',
    errorMessage: '',
    preloadedVideoRef: null,
    clipBpm: generatedClip.settings?.bpm || 140,
    generatedClip,
  }
}

function findGeneratedClipFromStoredSlot(storedSlot) {
  if (!storedSlot || storedSlot.type !== 'generated') {
    return null
  }
  if (storedSlot.id) {
    return GENERATED_CLIP_PRESETS.find((clip) => clip.id === storedSlot.id) || null
  }
  if (storedSlot.generatorType) {
    return (
      GENERATED_CLIP_PRESETS.find((clip) => clip.generatorType === storedSlot.generatorType) || null
    )
  }
  return null
}

function findGeneratedClipFromLegacySlot(storedSlot) {
  if (!storedSlot) {
    return null
  }
  if (storedSlot.filePath) {
    return null
  }
  if (storedSlot.status !== 'loaded') {
    return null
  }
  if (!storedSlot.clipName) {
    return null
  }
  return GENERATED_CLIP_PRESETS.find((clip) => clip.name === storedSlot.clipName) || null
}

function makeDefaultLayer(layerIndex) {
  const slots = []

  // Seed first N slots with generated clips.
  GENERATED_CLIP_PRESETS.forEach((generatedClip, index) => {
    if (index < GENERATED_CLIP_PRESETS.length) {
      slots.push(makeGeneratedClipSlot(index, generatedClip))
    }
  })

  // Remaining slots: empty video slots
  for (let i = slots.length; i < SLOT_COUNT; i++) {
    slots.push(makeDefaultSlot(i))
  }

  return {
    layerIndex,
    label: `L${layerIndex + 1}`,
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    activeSlotIndex: null,
    slots,
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
      
      // Preserve generated clip metadata if present
      if (storedSlot.type === 'generated') {
        const generatedClip = findGeneratedClipFromStoredSlot(storedSlot)
        if (generatedClip) {
          return {
            ...slot,
            id: generatedClip.id,
            clipName: generatedClip.name,
            filePath: '',
            type: 'generated',
            generatorType: generatedClip.generatorType,
            status: 'loaded',
            errorMessage: '',
            preloadedVideoRef: null,
            clipBpm: typeof storedSlot.clipBpm === 'number' && storedSlot.clipBpm >= 20 ? storedSlot.clipBpm : (generatedClip.settings?.bpm || 140),
            generatedClip,
          }
        }
      }

      // Backward compatibility: old saved data may contain generated clip names
      // without type/id metadata. Recover those slots when possible.
      const legacyGeneratedClip = findGeneratedClipFromLegacySlot(storedSlot)
      if (legacyGeneratedClip) {
        return {
          ...slot,
          id: legacyGeneratedClip.id,
          clipName: legacyGeneratedClip.name,
          filePath: '',
          type: 'generated',
          generatorType: legacyGeneratedClip.generatorType,
          status: 'loaded',
          errorMessage: '',
          preloadedVideoRef: null,
          clipBpm:
            typeof storedSlot.clipBpm === 'number' && storedSlot.clipBpm >= 20
              ? storedSlot.clipBpm
              : (legacyGeneratedClip.settings?.bpm || 140),
          generatedClip: legacyGeneratedClip,
        }
      }

      return {
        ...slot,
        clipName: storedSlot.clipName || '',
        filePath: storedSlot.filePath || '',
        type: storedSlot.type || 'video',
        status: storedSlot.status || 'empty',
        errorMessage: storedSlot.errorMessage || '',
        preloadedVideoRef: null,
        clipBpm: typeof storedSlot.clipBpm === 'number' && storedSlot.clipBpm >= 20 ? storedSlot.clipBpm : 140,
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

  const setClipBpm = (layerIndex, slotIndex, clipBpm) => {
    const bpmVal = typeof clipBpm === 'number' && clipBpm >= 20 ? Math.round(clipBpm) : 140
    updateLayers((current) =>
      current.map((layer) => {
        if (layer.layerIndex !== layerIndex) return layer
        const slots = layer.slots.map((slot) =>
          slot.slotIndex === slotIndex ? { ...slot, clipBpm: bpmVal } : slot,
        )
        return { ...layer, slots }
      }),
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
    const normalizedShowName = normalizeShowName(showName)
    if (!normalizedShowName) {
      return null
    }

    const showData = {
      name: normalizedShowName,
      timestamp: new Date().toISOString(),
      layers: layers.map((layer) => ({
        label: layer.label,
        visible: layer.visible,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        activeSlotIndex: layer.activeSlotIndex,
        slots: layer.slots.map((slot) => ({
          id: slot.id || null,
          type: slot.type || 'video',
          generatorType: slot.generatorType || null,
          clipName: slot.clipName,
          filePath: slot.filePath,
          status: slot.status,
          clipBpm: slot.clipBpm,
        })),
      })),
      midiMappings: midiMappings_ || midiMappings || {},
      appSettings: appSettings || null,
    }
    const shows = readShowsFromStorage()
    const existingIdx = shows.findIndex((s) => normalizeShowName(s?.name) === normalizedShowName)
    if (existingIdx >= 0) {
      shows[existingIdx] = showData
    } else {
      shows.push(showData)
    }
    writeShowsToStorage(shows)
    localStorage.setItem(LAST_SHOW_STORAGE_KEY, normalizedShowName)
    return showData
  }

  const autosaveShow = (midiMappings_, appSettings) => {
    const autosaveName = '__autosave__'
    const existingAutosave = parseStoredJson(localStorage.getItem(AUTOSAVE_STORAGE_KEY), null)

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
          id: slot.id || null,
          type: slot.type || 'video',
          generatorType: slot.generatorType || null,
          clipName: slot.clipName,
          filePath: slot.filePath,
          status: slot.status,
          clipBpm: slot.clipBpm,
        })),
      })),
      midiMappings: midiMappings_ || midiMappings || {},
      appSettings:
        appSettings != null
          ? appSettings
          : (existingAutosave?.appSettings ?? null),
    }
    localStorage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify(showData))
  }

  const applyShowData = (showData) => {
    if (!showData || !Array.isArray(showData.layers)) {
      return { ok: false, appSettings: null, midiMappings: {} }
    }

    updateLayers((current) =>
      current.map((layer) => {
        const showLayer = showData.layers.find((sl) => sl.label === layer.label)
        if (!showLayer) return layer

        const slots = layer.slots.map((slot, idx) => {
          const showSlot = showLayer.slots[idx]
          if (showSlot?.type === 'generated') {
            const generatedClip = findGeneratedClipFromStoredSlot(showSlot)
            if (generatedClip) {
              return {
                ...slot,
                id: generatedClip.id,
                clipName: generatedClip.name,
                filePath: '',
                type: 'generated',
                generatorType: generatedClip.generatorType,
                status: showSlot.status || 'loaded',
                errorMessage: '',
                clipBpm:
                  typeof showSlot.clipBpm === 'number' && showSlot.clipBpm >= 20
                    ? showSlot.clipBpm
                    : (generatedClip.settings?.bpm || 140),
                generatedClip,
              }
            }
          }

          const legacyGeneratedClip = findGeneratedClipFromLegacySlot(showSlot)
          if (legacyGeneratedClip) {
            return {
              ...slot,
              id: legacyGeneratedClip.id,
              clipName: legacyGeneratedClip.name,
              filePath: '',
              type: 'generated',
              generatorType: legacyGeneratedClip.generatorType,
              status: showSlot.status || 'loaded',
              errorMessage: '',
              clipBpm:
                typeof showSlot.clipBpm === 'number' && showSlot.clipBpm >= 20
                  ? showSlot.clipBpm
                  : (legacyGeneratedClip.settings?.bpm || 140),
              generatedClip: legacyGeneratedClip,
            }
          }

          return showSlot
            ? {
                ...slot,
                id: showSlot.id || slot.id,
                type: showSlot.type || slot.type,
                generatorType: showSlot.generatorType || slot.generatorType,
                clipName: showSlot.clipName,
                filePath: showSlot.filePath,
                status: showSlot.status,
                errorMessage: '',
                clipBpm:
                  typeof showSlot.clipBpm === 'number' && showSlot.clipBpm >= 20
                    ? showSlot.clipBpm
                    : slot.clipBpm,
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
    return {
      ok: true,
      appSettings: showData.appSettings || null,
      midiMappings: showData.midiMappings || {},
    }
  }

  // Persist MIDI mappings independently of show saves for immediate restoration
  const persistMidiMappings = (mappings) => {
    if (mappings && typeof mappings === 'object') {
      localStorage.setItem(MIDI_MAPPINGS_STORAGE_KEY, JSON.stringify(mappings))
    }
  }

  // Restore MIDI mappings from independent storage
  const restoreMidiMappings = () => {
    const stored = parseStoredJson(localStorage.getItem(MIDI_MAPPINGS_STORAGE_KEY), {})
    if (stored && typeof stored === 'object') {
      setMidiMappings(stored)
      return stored
    }
    return {}
  }

  const applySceneComposition = (sceneLayers = []) => {
    updateLayers((current) =>
      current.map((layer) => {
        const sceneLayer = sceneLayers.find((entry) => entry.targetLayerIndex === layer.layerIndex)
        if (!sceneLayer) {
          return layer
        }

        const nextVisible = sceneLayer.visible !== false
        const nextOpacity = typeof sceneLayer.opacity === 'number' ? sceneLayer.opacity : layer.opacity
        const nextBlendMode = sceneLayer.blendMode || layer.blendMode

        let activeSlotIndex = nextVisible ? layer.activeSlotIndex : null
        let nextSlots = layer.slots

        if (sceneLayer.clip?.filePath) {
          const existingSlot = layer.slots.find((slot) => slot.filePath === sceneLayer.clip.filePath)
          const targetSlotIndex = existingSlot ? existingSlot.slotIndex : 0
          nextSlots = layer.slots.map((slot) => {
            if (slot.slotIndex !== targetSlotIndex) {
              return slot
            }
            return {
              ...slot,
              clipName: sceneLayer.clip.clipName || slot.clipName,
              filePath: sceneLayer.clip.filePath,
              status: 'loaded',
              errorMessage: '',
            }
          })
          activeSlotIndex = targetSlotIndex
        }

        return {
          ...layer,
          visible: nextVisible,
          opacity: nextOpacity,
          blendMode: nextBlendMode,
          activeSlotIndex,
          slots: nextSlots,
        }
      }),
    )
  }

  const restoreLastShow = () => {
    const lastShowName = readLastShowName()
    const autosaveData = parseStoredJson(localStorage.getItem(AUTOSAVE_STORAGE_KEY), null)
    const shows = readShowsFromStorage()
    const lastShowData =
      lastShowName && lastShowName !== '__autosave__'
        ? findShowByName(shows, lastShowName)
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

    return { ok: false, appSettings: null, midiMappings: {} }
  }

  const loadShow = (showName) => {
    const requested = normalizeShowName(showName)
    if (requested.toLowerCase() === '__autosave__' || requested.toLowerCase() === 'autosave') {
      const autosave = parseStoredJson(localStorage.getItem(AUTOSAVE_STORAGE_KEY), null)
      if (!isShowLikeEntry(autosave)) {
        return { ok: false, appSettings: null, midiMappings: {} }
      }
      localStorage.setItem(LAST_SHOW_STORAGE_KEY, '__autosave__')
      return applyShowData(autosave)
    }

    const shows = readShowsFromStorage()
    const show = findShowByName(shows, showName)
    if (!show) return { ok: false, appSettings: null, midiMappings: {} }

    localStorage.setItem(LAST_SHOW_STORAGE_KEY, normalizeShowName(show.name))
    return applyShowData(show)
  }

  const getSavedShows = () => {
    const shows = [...readShowsFromStorage()]
    const autosave = parseStoredJson(localStorage.getItem(AUTOSAVE_STORAGE_KEY), null)
    if (isShowLikeEntry(autosave)) {
      shows.push({
        ...autosave,
        name: '__autosave__',
      })
    }

    return shows.sort((a, b) => {
      const left = Date.parse(b?.timestamp || 0)
      const right = Date.parse(a?.timestamp || 0)
      const safeLeft = Number.isFinite(left) ? left : 0
      const safeRight = Number.isFinite(right) ? right : 0
      return safeLeft - safeRight
    })
  }

  const deleteShow = (showName) => {
    const target = normalizeShowName(showName)
    if (!target) {
      return
    }

    const shows = readShowsFromStorage()
    const filtered = shows.filter((s) => !isSameShowName(s?.name, target))
    writeShowsToStorage(filtered)

    // Also remove matching shows from legacy/recovered keys so they do not reappear.
    const storageKeys = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key) {
        storageKeys.push(key)
      }
    }

    storageKeys.forEach((key) => {
      if (key === LAST_SHOW_STORAGE_KEY || key === MIDI_MAPPINGS_STORAGE_KEY) {
        return
      }

      if (key === AUTOSAVE_STORAGE_KEY && isSameShowName(target, '__autosave__')) {
        localStorage.removeItem(AUTOSAVE_STORAGE_KEY)
        return
      }

      const rawValue = localStorage.getItem(key)
      if (rawValue == null) {
        return
      }
      const parsed = parseStoredJson(rawValue, null)
      const result = pruneShowFromParsedValue(parsed, key, target)
      if (!result.changed) {
        return
      }
      if (result.deleteKey) {
        localStorage.removeItem(key)
      } else {
        localStorage.setItem(key, JSON.stringify(result.nextValue))
      }
    })

    const lastShowName = readLastShowName()
    if (isSameShowName(lastShowName, target)) {
      localStorage.removeItem(LAST_SHOW_STORAGE_KEY)
    }
  }

  // Autosave is orchestrated from App with current MIDI mappings + app settings.
  // Keeping a second local autosave loop here can overwrite mappings with stale data.

  const loadGeneratedClipIntoSlot = (layerIndex, slotIndex, generatedClip) => {
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
            slotIndex,
            id: generatedClip.id,
            clipName: generatedClip.name,
            filePath: '',
            type: 'generated',
            generatorType: generatedClip.generatorType,
            status: 'loaded',
            errorMessage: '',
            preloadedVideoRef: null,
            clipBpm: generatedClip.settings?.bpm || 140,
            generatedClip,
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

  const loadGeneratedPackToLayer = (layerIndex) => {
    updateLayers((current) =>
      current.map((layer) => {
        if (layer.layerIndex !== layerIndex) {
          return layer
        }

        const slots = layer.slots.map((slot) => {
          if (slot.slotIndex < GENERATED_CLIP_PRESETS.length) {
            return makeGeneratedClipSlot(slot.slotIndex, GENERATED_CLIP_PRESETS[slot.slotIndex])
          }
          return slot
        })

        return {
          ...layer,
          slots,
        }
      }),
    )
  }

  const loadGeneratedPackToAllLayers = () => {
    updateLayers((current) =>
      current.map((layer) => {
        const slots = layer.slots.map((slot) => {
          if (slot.slotIndex < GENERATED_CLIP_PRESETS.length) {
            return makeGeneratedClipSlot(slot.slotIndex, GENERATED_CLIP_PRESETS[slot.slotIndex])
          }
          return slot
        })

        return {
          ...layer,
          slots,
        }
      }),
    )
  }

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
    setClipBpm,
    triggerClip,
    loadClipIntoSlot,
    markSlotFailed,
    saveShow,
    loadShow,
    getSavedShows,
    deleteShow,
    autosaveShow,
    restoreLastShow,
    applySceneComposition,
    loadGeneratedClipIntoSlot,
    loadGeneratedPackToLayer,
    loadGeneratedPackToAllLayers,
    persistMidiMappings,
    restoreMidiMappings,
  }
}
