// A little dialect easter egg: only Henrik + Tormod turned over means Bokmål.
export function createWordmarkLanguage(motion) {
  const svg = document.querySelector('.wordmark-art');
  const title = svg.querySelector('.wordmark-gutane');
  const ns = 'http://www.w3.org/2000/svg';
  const paths = [...title.children];
  const boxes = paths.map(path => path.getBBox());
  const bounds = title.getBBox();
  const matrix = (scale = 1, x = 0, y = 0) => `matrix(${scale},0,0,1,${x},${y})`;
  // Keep G/U/T/N/the final E as the same nodes in both spellings.
  // Only A leaves; the extra T and middle E are new arrivals.
  const sources = [0, 1, 2, 3, 4, 5, 2, 5];
  const order = [0, 1, 2, 6, 7, 4, 5];
  const gap = 8;
  const width = order.reduce((sum, index) => sum + boxes[sources[index]].width, 0) + gap * 6;
  const scale = bounds.width / width;
  const placements = new Map();
  let x = bounds.x;
  for (const index of order) {
    const box = boxes[sources[index]];
    placements.set(index, {scale, x:x - scale * box.x});
    x += (box.width + gap) * scale;
  }
  title.replaceChildren();
  const glyphs = sources.map((source, index) => {
    const element = document.createElementNS(ns, 'g');
    element.dataset.letter = 'GUTANE'[source];
    element.style.transformOrigin = '0 0';
    element.style.transformBox = 'view-box';
    element.append(index < 6 ? paths[source] : paths[source].cloneNode(true));
    const placement = placements.get(index) || {scale:1, x:0};
    const nn = index < 6 ? {scale:1, x:0} : placement;
    element.style.transform = matrix(nn.scale, nn.x);
    element.style.opacity = index < 6 ? '1' : '0';
    title.append(element);
    return {element, nn, nb:placement, original:index < 6, shared:index < 6 && index !== 3, nbOrder:order.indexOf(index)};
  });

  const translations = {låge:'lave', høge:'høye', blåe:'blå', gråe:'grå', brae:'bra', trae:'trege', vene:'vakre'};
  const rows = [...svg.querySelectorAll('.wordmark-adjectives text')].map(text => {
    const nynorsk = text.textContent;
    const bokmal = nynorsk.replace(/^dei /, 'de ').replace(/\S+$/, word => translations[word] || word);
    // Preserve the phrase's footprint, even when the replacement is shorter.
    text.setAttribute('textLength', text.getComputedTextLength());
    text.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    return {text, nynorsk, bokmal};
  });
  const instruments = [...document.querySelectorAll('.portrait-details span')]
    .filter(text => ['Munnspel', 'Trommar'].includes(text.textContent))
    .map(text => ({text, nynorsk:text.textContent, bokmal:{Munnspel:'Munnspill', Trommar:'Trommer'}[text.textContent]}));
  let active = false;
  const animations = new Set();

  function stopAnimations() {
    animations.forEach(animation => animation.cancel());
    animations.clear();
  }
  motion.addEventListener('change', () => { if (motion.matches) stopAnimations(); });

  function track(animation) {
    animations.add(animation);
    animation.finished.then(() => { animation.cancel(); animations.delete(animation); }, () => {});
  }

  function rise(element, index) {
    const animation = element.animate([
      {opacity:0, transform:'translateY(12px)'},
      {opacity:1, offset:.55},
      {opacity:1, transform:'translateY(0px)'}
    ], {duration:440, delay:index * 14, easing:'cubic-bezier(.2,.7,.25,1)', fill:'backwards'});
    track(animation);
  }

  function moveTitle(snapshots) {
    glyphs.forEach((glyph, index) => {
      const {element} = glyph;
      const placement = active ? glyph.nb : glyph.nn;
      const shown = active ? glyph.nbOrder !== -1 : glyph.original;
      const target = matrix(placement.scale, placement.x);
      const from = snapshots[index];
      // Set resting styles first so reduced motion and cancellation settle cleanly.
      element.style.transform = target;
      element.style.opacity = shown ? '1' : '0';
      if (motion.matches) return;
      const delay = Math.max(0, active ? glyph.nbOrder : index) * 45;
      if (glyph.shared) {
        track(element.animate([
          {transform:from.transform}, {transform:target}
        ], {duration:620, delay, easing:'cubic-bezier(.2,.7,.25,1)', fill:'backwards'}));
      } else if (shown) {
        track(element.animate([
          {opacity:from.opacity, transform:from.opacity > .001 ? from.transform : matrix(placement.scale, placement.x, 28)},
          {opacity:1, offset:.55},
          {opacity:1, transform:target}
        ], {duration:620, delay, easing:'cubic-bezier(.2,.7,.25,1)', fill:'backwards'}));
      } else if (from.opacity > .001) {
        track(element.animate([
          {opacity:from.opacity, transform:from.transform},
          {opacity:0, transform:matrix(placement.scale, placement.x, -28)}
        ], {duration:220, easing:'ease-out', fill:'backwards'}));
      }
    });
  }

  return function updateLanguage(views) {
    const flipped = views.filter(view => view.pose.flipped);
    const next = flipped.length === 2 && ['Henrik', 'Tormod'].every(name => flipped.some(view => view.canvas.dataset.name === name));
    if (next === active) return;
    // Snapshot before canceling so a quick reversal continues from the visible pose.
    const snapshots = glyphs.map(({element}) => {
      const style = getComputedStyle(element);
      return {transform:style.transform, opacity:Number(style.opacity)};
    });
    active = next;
    stopAnimations();
    moveTitle(snapshots);
    const language = active ? 'bokmal' : 'nynorsk';
    rows.forEach(row => { row.text.textContent = row[language]; });
    instruments.forEach(row => { row.text.textContent = row[language]; });
    views.forEach(view => view.halo.refresh());
    document.documentElement.lang = active ? 'nb' : 'nn';
    document.querySelector('.brand-copy h1').textContent = active ? 'Beibi & Guttene' : 'Beibi & Gutane';
    document.querySelector('.boys').setAttribute('aria-label', active ? 'Guttene' : 'Gutane');
    svg.querySelector('title').textContent = active ? 'Beibi & Guttene, med alle slags gutter' : 'Beibi & Gutane, med alle slags gutar';
    svg.dataset.language = document.documentElement.lang;
    if (motion.matches) return;
    // Reveal the adjective rows progressively from the bottom upwards.
    [...rows].sort((a,b) => b.text.y.baseVal[0].value - a.text.y.baseVal[0].value)
      .forEach((row, index) => rise(row.text, index));
  };
}
