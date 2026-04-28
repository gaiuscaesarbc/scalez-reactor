const STORAGE_KEY = 'scalez.vision.v1.clipStore'

export function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveStore(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Ignore storage write errors to keep performance UI resilient.
  }
}
