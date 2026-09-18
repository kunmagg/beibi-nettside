// Feather alpha with three small box blurs, including in browsers without
// Canvas.filter. This softens the entire expanded letter mask.
function featherMask(context, width, height, softness) {
  const image = context.getImageData(0, 0, width, height);
  let alpha = new Float32Array(width * height);
  let buffer = new Float32Array(alpha.length);
  for (let i = 0; i < alpha.length; i++) alpha[i] = image.data[i * 4 + 3];
  const radius = Math.max(1, Math.round(softness / 1.4));
  const divisor = radius * 2 + 1;
  for (let pass = 0; pass < 3; pass++) {
    for (const horizontal of [true, false]) {
      const count = horizontal ? height : width;
      const length = horizontal ? width : height;
      const step = horizontal ? 1 : width;
      for (let line = 0; line < count; line++) {
        const offset = horizontal ? line * width : line;
        let sum = 0;
        for (let i = 0; i <= radius && i < length; i++) sum += alpha[offset + i * step];
        for (let i = 0; i < length; i++) {
          buffer[offset + i * step] = sum / divisor;
          if (i - radius >= 0) sum -= alpha[offset + (i - radius) * step];
          if (i + radius + 1 < length) sum += alpha[offset + (i + radius + 1) * step];
        }
      }
      [alpha, buffer] = [buffer, alpha];
    }
  }
  for (let i = 0; i < alpha.length; i++) image.data[i * 4 + 3] = alpha[i];
  context.putImageData(image, 0, 0);
}

export function createPortraitHalo(tile) {
  const snapshot = tile.querySelector('.portrait-snapshot');
  const halo = tile.querySelector('.portrait-halo');
  const details = tile.querySelector('.portrait-details');
  const lines = [...details.children];
  const mask = document.createElement('canvas');
  const maskContext = mask.getContext('2d');
  let captured = false, pending = 0;

  function setFont(context, style, scale = 1) {
    context.font = `${style.fontStyle} ${style.fontWeight} ${parseFloat(style.fontSize) * scale}px ${style.fontFamily}`;
    context.fontKerning = style.fontKerning;
    if ('letterSpacing' in context) context.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
  }

  function fitText() {
    // Measure the requested size, not the previous fit, so labels can grow
    // back after a viewport or text-size change.
    const style = getComputedStyle(details);
    const previous = parseFloat(style.getPropertyValue('--detail-fit')) || 1;
    const availableWidth = details.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availableHeight = details.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    let widest = 0, totalHeight = 0;
    for (const line of lines) {
      const lineStyle = getComputedStyle(line);
      setFont(maskContext, lineStyle, 1 / previous);
      widest = Math.max(widest, maskContext.measureText(line.textContent).width);
      totalHeight += (parseFloat(lineStyle.lineHeight) + parseFloat(lineStyle.marginTop) + parseFloat(lineStyle.marginBottom)) / previous;
    }
    const fit = Math.min(1, availableWidth / Math.max(1, widest), availableHeight / Math.max(1, totalHeight));
    if (Math.abs(fit - previous) > .0005) details.style.setProperty('--detail-fit', fit.toFixed(4));
  }

  function render() {
    pending = 0;
    if (!captured || !tile.clientWidth || !tile.clientHeight) return;
    fitText();
    const width = tile.clientWidth, height = tile.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    halo.width = mask.width = pixelWidth;
    halo.height = mask.height = pixelHeight;
    const styles = lines.map(line => getComputedStyle(line));
    const largestFont = Math.max(...styles.map(style => parseFloat(style.fontSize)));
    const radius = Math.max(1.6, Math.min(3.5, largestFont * .11));
    // Layout offsets remain stable throughout the 3D flip.
    maskContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    maskContext.fillStyle = maskContext.strokeStyle = '#fff';
    maskContext.lineJoin = 'round';
    maskContext.lineWidth = radius * 2;
    maskContext.textAlign = 'center';
    maskContext.textBaseline = 'alphabetic';
    lines.forEach((line, index) => {
      const style = styles[index];
      setFont(maskContext, style);
      const metrics = maskContext.measureText(line.textContent);
      const size = parseFloat(style.fontSize);
      const ascent = metrics.fontBoundingBoxAscent ?? size * .8;
      const descent = metrics.fontBoundingBoxDescent ?? size * .2;
      const x = details.offsetLeft + line.offsetLeft + line.offsetWidth / 2;
      const y = details.offsetTop + line.offsetTop + (line.offsetHeight - ascent - descent) / 2 + ascent;
      maskContext.strokeText(line.textContent, x, y);
      maskContext.fillText(line.textContent, x, y);
    });
    featherMask(maskContext, pixelWidth, pixelHeight, radius * .8 * ratio);

    const context = halo.getContext('2d');
    context.setTransform(-1, 0, 0, 1, pixelWidth, 0);
    context.drawImage(snapshot, 0, 0, pixelWidth, pixelHeight);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = getComputedStyle(tile).getPropertyValue('--paper').trim();
    context.globalAlpha = .78;
    context.fillRect(0, 0, pixelWidth, pixelHeight);
    context.globalAlpha = 1;
    // Retain the cutout alpha instead of tinting transparent space.
    context.globalCompositeOperation = 'destination-in';
    context.setTransform(-1, 0, 0, 1, pixelWidth, 0);
    context.drawImage(snapshot, 0, 0, pixelWidth, pixelHeight);
    context.globalCompositeOperation = 'source-over';
    const image = `url("${mask.toDataURL()}")`;
    halo.style.maskImage = image;
    halo.style.webkitMaskImage = image;
    halo.style.setProperty('--halo-blur', `${radius * 1.7}px`);
    halo.dataset.ready = 'true';
  }

  const observer = new ResizeObserver(() => {
    if (captured && !pending) pending = requestAnimationFrame(render);
  });
  [tile, details, ...lines].forEach(element => observer.observe(element));

  return {
    refresh: render,
    capture(source) {
      snapshot.width = source.width;
      snapshot.height = source.height;
      snapshot.getContext('2d').drawImage(source, 0, 0);
      captured = true;
      if (pending) cancelAnimationFrame(pending);
      render();
    }
  };
}
