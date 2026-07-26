function preventNativeSelectionOrDrag(event: Event): void {
  if (event.target instanceof Element && event.target.closest('[data-native-selection-buffer]')) return;
  event.preventDefault();
}

export function installInteractionGuards(target: HTMLElement): void {
  target.addEventListener('selectstart', preventNativeSelectionOrDrag, { capture: true });
  target.addEventListener('dragstart', preventNativeSelectionOrDrag, { capture: true });
}
