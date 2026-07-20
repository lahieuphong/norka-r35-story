import { useEffect, useState } from 'react';
import { cameraDebugSnapshot } from '../three/storyState';
interface Values { readonly position: readonly [number, number, number]; readonly target: readonly [number, number, number]; readonly fov: number; readonly progress: number; readonly section: string; }
function read(): Values { return { position: cameraDebugSnapshot.position.toArray(), target: cameraDebugSnapshot.target.toArray(), fov: cameraDebugSnapshot.fov, progress: cameraDebugSnapshot.progress, section: cameraDebugSnapshot.section }; }
const fmt = (value: number): string => value.toFixed(3);
async function copyText(text: string): Promise<void> {
  if (navigator.clipboard) { await navigator.clipboard.writeText(text); return; }
  const area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
}
export default function CameraDebugHUD() {
  const [visible, setVisible] = useState(false);
  const [values, setValues] = useState<Values>(read);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key.toLowerCase() === 'd') setVisible((current) => !current);
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    if (!visible) return;
    let frame = 0; let previous = 0;
    const update = (time: number): void => { if (time - previous > 80) { previous = time; setValues(read()); } frame = requestAnimationFrame(update); };
    frame = requestAnimationFrame(update); return () => cancelAnimationFrame(frame);
  }, [visible]);
  if (!visible) return null;
  const snippet = `${JSON.stringify(values.section)}: {\n  position: [${values.position.map(fmt).join(', ')}],\n  target: [${values.target.map(fmt).join(', ')}],\n  fov: ${values.fov.toFixed(2)},\n},`;
  const copy = async (): Promise<void> => { await copyText(snippet); setCopied(true); window.setTimeout(() => setCopied(false), 1200); };
  return (
    <aside className="camera-debug" aria-label="Development camera inspector">
      <div className="camera-debug__heading"><strong>CAMERA HUD</strong><span>D to toggle</span></div>
      <dl><dt>position</dt><dd>{values.position.map(fmt).join(' · ')}</dd><dt>target</dt><dd>{values.target.map(fmt).join(' · ')}</dd><dt>fov</dt><dd>{values.fov.toFixed(2)}</dd><dt>section</dt><dd>{values.section}</dd><dt>progress</dt><dd>{values.progress.toFixed(4)}</dd></dl>
      <button type="button" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy shot'}</button>
    </aside>
  );
}
