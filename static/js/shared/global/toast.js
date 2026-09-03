
const TOAST_TONE_CLASSES = {
  info:     'bg-primary text-primary-foreground',
  success:  'bg-success text-white',
  warning:  'bg-warn text-white',
  error:    'bg-danger text-white',
};

export function showToast(stackId, msg, tone) {
  const stack = document.getElementById(stackId || 'toastStack');
  if (!stack) return;
  const toneClass = TOAST_TONE_CLASSES[tone] || TOAST_TONE_CLASSES.info;
  const t = document.createElement('div');
  t.className = 'toast-anim flex items-center gap-2 rounded-md px-3.5 py-2.5 text-[12.5px] font-medium shadow-lg ' + toneClass;
  t.textContent = msg;
  stack.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

window.showToast = showToast;