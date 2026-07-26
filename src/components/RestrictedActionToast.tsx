import { useEffect, useRef, useState } from 'react';

type RestrictedActionKind = 'console' | 'context-menu' | 'developer-tools' | 'inspector' | 'source';

interface RestrictedActionNotice {
  readonly kind: RestrictedActionKind;
  readonly label: string;
  readonly message: string;
}

interface ActiveNotice extends RestrictedActionNotice {
  readonly id: number;
}

const DISPLAY_DURATION_MS = 3200;
const HIDE_TRANSITION_MS = 260;
const REPEAT_THROTTLE_MS = 900;
const NOTICES: Record<RestrictedActionKind, RestrictedActionNotice> = {
  'developer-tools': {
    kind: 'developer-tools',
    label: 'Developer tools',
    message: 'Developer tools are disabled for this experience.',
  },
  console: {
    kind: 'console',
    label: 'Console',
    message: 'The developer console is disabled for this experience.',
  },
  inspector: {
    kind: 'inspector',
    label: 'Inspector',
    message: 'Element inspection is disabled for this experience.',
  },
  source: {
    kind: 'source',
    label: 'Page source',
    message: 'Page source viewing is disabled for this experience.',
  },
  'context-menu': {
    kind: 'context-menu',
    label: 'Context menu',
    message: 'The browser context menu is disabled for this experience.',
  },
};

function isFirefox(): boolean {
  return navigator.userAgent.includes('Firefox/');
}

function isSafari(): boolean {
  return navigator.userAgent.includes('Safari/')
    && !/(Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS)\//.test(navigator.userAgent);
}

function readRestrictedShortcut(event: KeyboardEvent): RestrictedActionNotice | null {
  const key = event.key.toLowerCase();
  const code = event.code;

  if (key === 'f12' || code === 'F12') return NOTICES['developer-tools'];
  if (key === 'contextmenu' || code === 'ContextMenu' || (event.shiftKey && key === 'f10')) {
    return NOTICES['context-menu'];
  }

  const controlShift = event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;
  const commandOption = event.metaKey && event.altKey && !event.ctrlKey && !event.shiftKey;
  const commandShift = event.metaKey && event.shiftKey && !event.altKey && !event.ctrlKey;

  if (controlShift || commandOption) {
    if (key === 'i') return NOTICES['developer-tools'];
    if (key === 'j' || key === 'k') return NOTICES.console;
    if (key === 'c') return commandOption && isSafari() ? NOTICES.console : NOTICES.inspector;
  }
  if (commandShift && key === 'c') return NOTICES.inspector;

  const controlSource = event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && key === 'u';
  const commandOptionSource = commandOption && key === 'u';
  const firefoxCommandSource = isFirefox()
    && event.metaKey
    && !event.altKey
    && !event.ctrlKey
    && !event.shiftKey
    && key === 'u';
  if (controlSource || commandOptionSource || firefoxCommandSource) return NOTICES.source;

  if (!isFirefox()) return null;
  const firefoxPanelKey = key === 'e' || key === 'm' || key === 'z';
  const firefoxFunctionKey = event.shiftKey
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && (key === 'f5' || key === 'f7' || key === 'f9');
  const firefoxBrowserToolbox = key === 'i'
    && event.shiftKey
    && event.altKey
    && (event.ctrlKey || event.metaKey);
  if ((controlShift && firefoxPanelKey)
    || (commandOption && firefoxPanelKey)
    || firefoxFunctionKey
    || firefoxBrowserToolbox) {
    return NOTICES['developer-tools'];
  }

  return null;
}

function showTopLayer(element: HTMLDivElement | null): void {
  if (!element || typeof element.showPopover !== 'function') return;
  try {
    if (!element.matches(':popover-open')) element.showPopover();
  } catch {
    return;
  }
}

function hideTopLayer(element: HTMLDivElement | null): void {
  if (!element || typeof element.hidePopover !== 'function') return;
  try {
    if (element.matches(':popover-open')) element.hidePopover();
  } catch {
    return;
  }
}

export function RestrictedActionToast() {
  const toastRef = useRef<HTMLDivElement>(null);
  const displayTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const sequenceRef = useRef(0);
  const latestRef = useRef<{ readonly kind: RestrictedActionKind; readonly time: number } | null>(null);
  const [notice, setNotice] = useState<ActiveNotice | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const clearTimers = (): void => {
      if (displayTimerRef.current !== null) window.clearTimeout(displayTimerRef.current);
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
      displayTimerRef.current = null;
      hideTimerRef.current = null;
    };
    const present = (nextNotice: RestrictedActionNotice, repeated: boolean): void => {
      const now = performance.now();
      const latest = latestRef.current;
      if (repeated || (latest?.kind === nextNotice.kind && now - latest.time < REPEAT_THROTTLE_MS)) return;
      latestRef.current = { kind: nextNotice.kind, time: now };
      clearTimers();
      sequenceRef.current += 1;
      setNotice({ ...nextNotice, id: sequenceRef.current });
      setVisible(true);
      showTopLayer(toastRef.current);
      displayTimerRef.current = window.setTimeout(() => {
        setVisible(false);
        hideTimerRef.current = window.setTimeout(() => hideTopLayer(toastRef.current), HIDE_TRANSITION_MS);
      }, DISPLAY_DURATION_MS);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      const restrictedAction = readRestrictedShortcut(event);
      if (!restrictedAction) return;
      event.preventDefault();
      present(restrictedAction, event.repeat);
    };
    const handleContextMenu = (event: MouseEvent): void => {
      event.preventDefault();
      present(NOTICES['context-menu'], false);
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      clearTimers();
      hideTopLayer(toastRef.current);
    };
  }, []);

  return (
    <div
      ref={toastRef}
      className={`restricted-action-toast${visible ? ' is-visible' : ''}`}
      popover='manual'
      role='status'
      aria-live='polite'
      aria-atomic='true'
      aria-hidden={!visible}
      data-restricted-action-toast
      data-action-kind={notice?.kind}
    >
      {notice ? (
        <div key={notice.id} className='restricted-action-toast__panel'>
          <span className='restricted-action-toast__icon' aria-hidden='true'><i /></span>
          <div className='restricted-action-toast__copy'>
            <span className='restricted-action-toast__meta'>System guard · {notice.label}</span>
            <strong>Restricted action</strong>
            <span>{notice.message}</span>
          </div>
          <span className='restricted-action-toast__timer' aria-hidden='true' />
        </div>
      ) : null}
    </div>
  );
}
