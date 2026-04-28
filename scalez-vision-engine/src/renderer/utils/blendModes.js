export const BLEND_MODES = [
  { label: 'Normal', value: 'normal' },
  { label: 'Add', value: 'add' },
  { label: 'Screen', value: 'screen' },
]

export function blendModeToCss(mode) {
  if (mode === 'add') {
    return 'plus-lighter'
  }
  if (mode === 'screen') {
    return 'screen'
  }
  return 'normal'
}
