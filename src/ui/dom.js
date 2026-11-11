// Tiny rendering layer: views return HTML built with the `html` tag, and
// `morph` patches the live DOM to match — keeping focus, typed text, scroll
// positions and running CSS animations. No framework, no build step.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Marks a string as already-safe HTML. */
class Safe {
  constructor(text) {
    this.text = text;
  }
  toString() {
    return this.text;
  }
}

/** Trust a string as HTML (use only for markup you built yourself). */
export const raw = (text) => new Safe(String(text ?? ''));

function render(value) {
  if (value == null || value === false || value === true) return '';
  if (value instanceof Safe) return value.text;
  if (Array.isArray(value)) return value.map(render).join('');
  return esc(value);
}

/**
 * Tagged template: every interpolated value is HTML-escaped unless it is
 * itself the result of `html` or `raw`. Arrays are joined; null, undefined
 * and booleans render as nothing (so `${cond && html`…`}` works).
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Safe(out);
}

/** ` name` when `on` is truthy — for boolean attributes like disabled/checked. */
export const flag = (name, on) => (on ? raw(` ${name}`) : '');

// ---------------------------------------------------------------------------
// DOM morphing
// ---------------------------------------------------------------------------

const keyOf = (node) => (node.nodeType === 1 ? node.getAttribute('data-key') || node.id || null : null);

const sameKind = (a, b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || a.tagName === b.tagName);

function syncAttributes(oldEl, newEl) {
  const oldAttrs = oldEl.attributes;
  for (let i = oldAttrs.length - 1; i >= 0; i--) {
    const { name } = oldAttrs[i];
    if (!newEl.hasAttribute(name)) oldEl.removeAttribute(name);
  }
  const newAttrs = newEl.attributes;
  for (let i = 0; i < newAttrs.length; i++) {
    const { name, value } = newAttrs[i];
    if (oldEl.getAttribute(name) !== value) oldEl.setAttribute(name, value);
  }
}

function syncNode(oldNode, newNode) {
  if (oldNode.nodeType !== 1) {
    if (oldNode.nodeValue !== newNode.nodeValue) oldNode.nodeValue = newNode.nodeValue;
    return;
  }
  // `data-morph="keep"`: an element the page manages itself (e.g. a tooltip layer).
  if (oldNode.getAttribute('data-morph') === 'keep') return;
  const focused = oldNode === document.activeElement;
  const tag = oldNode.tagName;
  syncAttributes(oldNode, newNode);
  if (tag === 'INPUT') {
    if (oldNode.type === 'checkbox' || oldNode.type === 'radio') {
      const checked = newNode.hasAttribute('checked');
      if (oldNode.checked !== checked) oldNode.checked = checked;
    } else if (!focused) {
      const value = newNode.getAttribute('value') ?? '';
      if (oldNode.value !== value) oldNode.value = value;
    }
    return;
  }
  if (tag === 'TEXTAREA') {
    if (!focused && oldNode.value !== newNode.textContent) oldNode.value = newNode.textContent;
    return;
  }
  syncChildren(oldNode, newNode);
  if (tag === 'SELECT' && !focused) {
    const selected = newNode.querySelector('option[selected]');
    const value = selected ? selected.value : newNode.querySelector('option')?.value;
    if (value != null && oldNode.value !== value) oldNode.value = value;
  }
}

function syncChildren(oldParent, newParent) {
  let keyed = null;
  for (let n = oldParent.firstChild; n; n = n.nextSibling) {
    const k = keyOf(n);
    if (k) (keyed ||= new Map()).set(k, n);
  }
  let oldNode = oldParent.firstChild;
  let newNode = newParent.firstChild;
  while (newNode) {
    const nextNew = newNode.nextSibling;
    const key = keyOf(newNode);
    let match = null;
    if (key) {
      const candidate = keyed?.get(key);
      if (candidate && sameKind(candidate, newNode)) {
        match = candidate;
        keyed.delete(key);
      }
    } else {
      // Next old node that is not reserved for a keyed newcomer.
      let candidate = oldNode;
      while (candidate && keyOf(candidate) && keyed?.has(keyOf(candidate))) candidate = candidate.nextSibling;
      if (candidate && !keyOf(candidate) && sameKind(candidate, newNode)) match = candidate;
    }
    if (match) {
      if (match === oldNode) oldNode = oldNode.nextSibling;
      else oldParent.insertBefore(match, oldNode);
      syncNode(match, newNode);
    } else {
      oldParent.insertBefore(newNode, oldNode); // adopts the fresh node from the template
    }
    newNode = nextNew;
  }
  while (oldNode) {
    const next = oldNode.nextSibling;
    oldParent.removeChild(oldNode);
    oldNode = next;
  }
}

/**
 * Make `target`'s children match `markup`, changing as little as possible.
 * Elements with `data-key` (or an id) are matched by key, so list items keep
 * their identity when the list is reordered.
 */
export function morph(target, markup) {
  const template = document.createElement('template');
  template.innerHTML = String(markup);
  syncChildren(target, template.content);
}
