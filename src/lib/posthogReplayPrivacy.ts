const svgGeometryAttributes = new Set([
  'viewbox', 'd', 'points', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'clip-rule'
]);

function parseAssetUrl(value: string, element: Element): URL | null {
  try {
    return new URL(value, element.ownerDocument.baseURI);
  } catch {
    return null;
  }
}

/** Keep presentation metadata; mask content-bearing attributes, including aria-label and data-*. */
export function maskReplayAttribute(name: string, value: string, element?: Element): string {
  const masked = value.replace(/\S/g, '*');
  if (!element) return masked;
  const attribute = name.toLowerCase();
  // Daily's classes are application-defined, never derived from User content.
  if (attribute === 'class') return value;

  if (attribute === 'style') {
    const style = element.ownerDocument.createElement('span').style;
    style.cssText = value;
    for (const property of Array.from(style)) {
      // CSS can also carry text or a URL. Keep only presentation declarations.
      const declaration = style.getPropertyValue(property);
      if (
        property === 'content' ||
        (property.startsWith('--') && property !== '--calendar-color') ||
        (property === '--calendar-color' && !CSS.supports('color', declaration)) ||
        /url\s*\(|["']/i.test(declaration)
      ) style.removeProperty(property);
    }
    return style.cssText;
  }

  if (element.namespaceURI === 'http://www.w3.org/2000/svg' && svgGeometryAttributes.has(attribute)) {
    return /url\s*\(/i.test(value) ? '' : value;
  }
  if ((attribute === 'width' || attribute === 'height') && /^\d+(?:\.\d+)?(?:px|%)?$/.test(value)) {
    return value;
  }
  if (attribute === 'type' && ['INPUT', 'BUTTON'].includes(element.tagName) &&
      ['text', 'email', 'password', 'checkbox', 'radio', 'number', 'time', 'date', 'button', 'submit', 'reset'].includes(value)) {
    return value;
  }
  if (attribute === 'rel' && element.tagName === 'LINK' && ['stylesheet', 'preload', 'modulepreload', 'icon'].includes(value)) {
    return value;
  }
  if (attribute === 'href' && element.tagName === 'LINK' && element.getAttribute('rel') === 'stylesheet') {
    const url = parseAssetUrl(value, element);
    if (!url) return masked;
    if (url.origin === element.ownerDocument.location.origin &&
        /^\/_app\/immutable\/assets\/[\w.-]+\.css$/.test(url.pathname) && !url.search && !url.hash) {
      return value;
    }
  }
  if (attribute === 'src' && element.tagName === 'IMG') {
    const url = parseAssetUrl(value, element);
    if (!url) return masked;
    if (url.origin === element.ownerDocument.location.origin &&
        ['/daily-mark.svg', '/brand/google-g.svg'].includes(url.pathname) && !url.search && !url.hash) {
      return value;
    }
  }
  return masked;
}
