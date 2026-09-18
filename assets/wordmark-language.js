// A little dialect easter egg: only Henrik + Tormod turned over means Bokmål.
export function createWordmarkLanguage(motion) {
  const svg = document.querySelector('.wordmark-art');
  const title = svg.querySelector('.wordmark-gutane');
  const ns = 'http://www.w3.org/2000/svg';
  const paths = [...title.children];
  const boxes = paths.map(path => path.getBBox());
  const bounds = title.getBBox();
  const original = document.createElementNS(ns, 'g');
  original.append(...paths);
  const bokmal = document.createElementNS(ns, 'g');
  bokmal.style.display = 'none';
  title.append(original, bokmal);

  // Reuse the actual G, U, T, E, N artwork, including a second T and E.
  // Fit all seven letters to the exact original width without changing height.
  const letters = [0, 1, 2, 2, 5, 4, 5];
  const gap = 8;
  const width = letters.reduce((sum, index) => sum + boxes[index].width, 0) + gap * 6;
  const scale = bounds.width / width;
  let x = bounds.x;
  for (const index of letters) {
    const placement = document.createElementNS(ns, 'g');
    placement.setAttribute('transform', `translate(${x},0) scale(${scale},1) translate(${-boxes[index].x},0)`);
    placement.append(paths[index].cloneNode(true));
    bokmal.append(placement);
    x += (boxes[index].width + gap) * scale;
  }

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

  function spring(element, index, large = false) {
    element.style.transformBox = 'fill-box';
    element.style.transformOrigin = '50% 85%';
    const tilt = index % 2 ? -1 : 1;
    const animation = element.animate([
      {opacity:0, transform:`translateY(${large ? 32 : 12}px) rotate(${tilt * 9}deg) scale(.65,1.2)`},
      {opacity:1, transform:`translateY(${large ? -13 : -4}px) rotate(${-tilt * 4}deg) scale(1.05,.9)`, offset:.55},
      {opacity:1, transform:'translateY(3px) rotate(1deg) scale(.98,1.03)', offset:.78},
      {opacity:1, transform:'none'}
    ], {duration:large ? 620 : 440, delay:index * (large ? 45 : 14), easing:'cubic-bezier(.2,.7,.25,1)', fill:'backwards'});
    animations.add(animation);
    animation.finished.then(() => { animation.cancel(); animations.delete(animation); }, () => {});
  }

  return function updateLanguage(views) {
    const flipped = views.filter(view => view.pose.flipped);
    const next = flipped.length === 2 && ['Henrik', 'Tormod'].every(name => flipped.some(view => view.canvas.dataset.name === name));
    if (next === active) return;
    active = next;
    stopAnimations();
    original.style.display = active ? 'none' : '';
    bokmal.style.display = active ? '' : 'none';
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
    [...(active ? bokmal : original).querySelectorAll('path')].forEach((path, index) => spring(path, index, true));
    // Start beside the title, then ripple upwards through the adjective stack.
    [...rows].sort((a,b) => b.text.y.baseVal[0].value - a.text.y.baseVal[0].value)
      .forEach((row, index) => spring(row.text, index));
  };
}
