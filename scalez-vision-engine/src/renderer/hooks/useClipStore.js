import { useEffect, useMemo, useState } from 'react'
import { loadStore, saveStore } from '../utils/storage'

const LAYER_COUNT = 3
const SLOT_COUNT = 50

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

  const triggerClip = (layerIndex, slotIndex) => {
    updateLayers((current) =>
      current.map((layer) => {
        if (layer.layerIndex !== layerIndex) {
          return layer
        }
        const slot = layer.slots[slotIndex]
        if (!slot || slot.status === 'empty' || slot.status === 'missing' || slot.status === 'failed') {
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

  const markSlotFailed = (layerIndex, slotIndex, errorMessage) => {
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
            status: 'failed',
            errorMessage,
          }
        })

        const activeFailed = layer.activeSlotIndex === slotIndex && slots[slotIndex]?.status === 'failed'

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
          }
        })

        return {
          ...layer,
          slots,
          activeSlotIndex: slotIndex,
        }
      }),
    )

    const exists = await window.scalezApi?.pathExists?.(picked.filePath)
    if (exists === false) {
      markSlotMissing(layerIndex, slotIndex, true)
    }
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
            })
          }
        }
      }

      for (const check of checks) {
        const exists = await window.scalezApi?.pathExists?.(check.filePath)
        if (!canceled && exists === false) {
          markSlotMissing(check.layerIndex, check.slotIndex, true)
        }
      }
    }

    validatePaths()

    return () => {
      canceled = true
    }
  }, [])

  const visibleLayers = useMemo(() => layers.filter((layer) => layer.visible), [layers])

  const saveShow = (showName) => {
    const showData = {
      name: showName,
      timestamp: new Date().toISOString(),
      layers: layers.map((layer) => ({
        label: layer.label,
        visible: layer.visible,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        slots: layer.slots.map((slot) => ({
          clipName: slot.clipName,
          filePath: slot.filePath,
          status: slot.status,
        })),
      })),
    }
    const shows = JSON.parse(localStorage.getItem('scalez_shows') || '[]')
    shows.push(showData)
    localStorage.setItem('scalez_shows', JSON.stringify(shows))
    return showData
  }

  const loadShow = (showName) => {
    const shows = JSON.parse(localStorage.getItem('scalez_shows') || '[]')
    const show = shows.find((s) => s.name === showName)
    if (!show) return false

    updateLayers((current) =>
      current.map((layer) => {
        const showLayer = show.layers.find((sl) => sl.label === layer.label)
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
          slots,
        }
      }),
    )
    return true
  }

  const getSavedShows = () => {
    return JSON.parse(localStorage.getItem('scalez_shows') || '[]')
  }

  const deleteShow = (showName) => {
    const shows = JSON.parse(localStorage.getItem('scalez_shows') || '[]')
    const filtered = shows.filter((s) => s.name !== showName)
    localStorage.setItem('scalez_shows', JSON.stringify(filtered))
  }

  return {
    layers,
    visibleLayers,
    setLayerVisible,
    setLayerOpacity,
    setLayerBlendMode,
    clearLayer,
    triggerClip,
    loadClipIntoSlot,
    markSlotFailed,
    saveShow,
    loadShow,
    getSavedShows,
    deleteShow,
  }
}
