// Continue at the release speed, then let the cable gently accelerate the lift.
// The cubic curve is the normalized constant-acceleration displacement curve.
export function discoLiftTiming(distance, releaseSpeed) {
  const speed = Math.max(0, Math.min(4, releaseSpeed)); // CSS pixels per ms
  const acceleration = .0025;
  const duration = Math.max(100, 2 * distance / (Math.sqrt(speed * speed + 2 * acceleration * distance) + speed));
  const initialSlope = Math.min(1, speed * duration / Math.max(1, distance));
  return {duration, easing:`cubic-bezier(${1/3},${initialSlope/3},${2/3},${(1+initialSlope)/3})`};
}

// Two consecutive Live flips start the party; tap or swipe the ball to end it.
export function createDiscoBall(motion) {
  const lighting = document.createElement('div');
  lighting.className = 'disco-lighting';
  lighting.setAttribute('aria-hidden', 'true');
  // A small set of compositor-animated reflections, rather than a full-screen
  // canvas repaint. Each mirror catches the light at a different phase.
  for (let index = 0; index < 36; index++) {
    const spot = document.createElement('span');
    spot.className = 'disco-reflection';
    const column = index % 6, row = Math.floor(index / 6);
    spot.style.cssText = `left:${column * 19 - 4 + Math.sin(index * 7) * 5}%;top:${row * 20 - 3 + Math.cos(index * 11) * 6}%;` +
      `--travel-x:${index % 2 ? -16 : 16}vw;--travel-y:${index % 3 ? 14 : -18}vh;` +
      `--spot-size:${14 + index % 5 * 5}px;--stretch:${1 + index % 3 * .4};` +
      `--duration:${7 + index % 5}s;--phase:${-index * 1.37}s;` +
      `--light:${index % 7 === 0 ? '255,157,197' : index % 5 === 0 ? '187,204,255' : '255,244,206'};`;
    lighting.append(spot);
  }
  const rig = document.createElement('div');
  rig.className = 'disco-rig';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'disco-dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss disco ball');
  dismiss.setAttribute('aria-description', 'Tap, swipe up, or press Enter to dismiss.');
  dismiss.title = 'Tap or swipe up to dismiss';
  dismiss.disabled = true;
  rig.append(canvas, dismiss);
  document.body.append(lighting, rig);
  const context = canvas.getContext('2d');
  const henrik = document.querySelector('[data-name="Henrik"]').closest('figure');
  const oystein = document.querySelector('[data-name="Øystein"]').closest('figure');
  let active = false, visible = false, frame = 0, previous = 0, angle = 0, retractTimer;
  let liveStreak = 0;
  let liftAnimation = null;

  function position() {
    const upper = henrik.getBoundingClientRect();
    const lower = oystein.getBoundingClientRect();
    const size = Math.min(245, Math.max(67, upper.width));
    rig.style.width = rig.style.height = `${size}px`;
    rig.style.left = `${(upper.left + upper.width / 2 + lower.left + lower.width / 2) / 2 - size / 2}px`;
    rig.style.top = `${(upper.top + upper.height / 2 + lower.top + lower.height / 2) / 2 - size / 2}px`;
    const pixels = Math.round(size * Math.min(devicePixelRatio || 1, 2));
    if (canvas.width !== pixels) canvas.width = canvas.height = pixels;
    if (visible) draw();
  }

  function draw() {
    const size = canvas.width, radius = size * .42, center = size / 2;
    context.clearRect(0, 0, size, size);
    context.save();
    context.translate(center, center);
    context.shadowColor = 'rgba(33,17,3,.25)';
    context.shadowBlur = size * .04;
    context.shadowOffsetY = size * .025;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fillStyle = '#524945';
    context.fill();
    context.shadowColor = 'transparent';

    // Project small mirror tiles on a turning sphere. Longitude moves while
    // the light stays put, so each facet catches and releases the spotlight.
    const rows = 16, columns = 32;
    const point = (latitude, longitude) => ({
      x: Math.cos(latitude) * Math.sin(longitude),
      y: Math.sin(latitude),
      z: Math.cos(latitude) * Math.cos(longitude)
    });
    for (let row = 0; row < rows; row++) {
      const latitude = -Math.PI / 2 + (row + .5) * Math.PI / rows;
      for (let column = 0; column < columns; column++) {
        const longitude = column * Math.PI * 2 / columns + angle;
        const normal = point(latitude, longitude);
        if (normal.z <= 0) continue;
        const halfLat = Math.PI / rows * .45;
        const halfLon = Math.PI / columns * .9;
        const corners = [point(latitude-halfLat, longitude-halfLon), point(latitude-halfLat, longitude+halfLon),
          point(latitude+halfLat, longitude+halfLon), point(latitude+halfLat, longitude-halfLon)];
        // Clip the far edge at the silhouette to keep the ball perfectly round.
        const light = Math.max(0, normal.x * -.4 + normal.y * -.55 + normal.z * .73);
        const variation = Math.sin(row * 73 + column * 37) * 9;
        const shine = Math.pow(light, 18) * 35;
        const brightness = Math.min(99, 24 + light * 48 + variation + shine);
        const pink = (column + row * 3) % 11 === 0;
        context.fillStyle = `hsl(${pink ? 338 : 38} ${pink ? 40 : 9}% ${brightness}%)`;
        context.beginPath();
        corners.forEach((p, index) => {
          const x = (p.z < 0 ? Math.sign(p.x) * Math.cos(Math.asin(p.y)) : p.x) * radius;
          if (index === 0) context.moveTo(x, p.y * radius);
          else context.lineTo(x, p.y * radius);
        });
        context.closePath();
        context.fill();
      }
    }
    const gloss = context.createRadialGradient(-radius * .35, -radius * .45, 0, 0, 0, radius);
    gloss.addColorStop(0, 'rgba(255,249,235,.3)');
    gloss.addColorStop(.55, 'rgba(255,249,235,0)');
    gloss.addColorStop(1, 'rgba(33,17,3,.25)');
    context.fillStyle = gloss;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    // Two small, slowly breathing glints instead of flashing the whole page.
    for (const [x,y,phase] of [[-.46,-.53,0],[.65,.25,2]]) {
      const length = radius * (.075 + .045 * Math.sin(angle * 3 + phase));
      context.fillStyle = '#fff9eb';
      context.beginPath();
      context.moveTo(x*radius, y*radius-length);
      context.lineTo(x*radius+length*.22, y*radius-length*.22);
      context.lineTo(x*radius+length, y*radius);
      context.lineTo(x*radius+length*.22, y*radius+length*.22);
      context.lineTo(x*radius, y*radius+length);
      context.lineTo(x*radius-length*.22, y*radius+length*.22);
      context.lineTo(x*radius-length, y*radius);
      context.lineTo(x*radius-length*.22, y*radius-length*.22);
      context.closePath();
      context.fill();
    }
    context.restore();
  }

  function tick(time) {
    frame = 0;
    if (!visible || document.hidden || motion.matches) return;
    // The small sphere needs only 30 paints per second, especially on phones.
    if (!previous || time - previous >= 1000 / 30) {
      if (previous) angle += Math.min(time - previous, 100) * .00065;
      previous = time;
      draw();
    }
    frame = requestAnimationFrame(tick);
  }

  function syncMotion() {
    if (motion.matches && liftAnimation) {
      liftAnimation.cancel();
      liftAnimation = null;
      rig.classList.remove('is-flying');
    }
    lighting.dataset.moving = String(active && !document.hidden && !motion.matches);
    cancelAnimationFrame(frame);
    frame = previous = 0;
    if (motion.matches && !active) visible = false;
    if (visible) {
      draw();
      if (!motion.matches && !document.hidden) frame = requestAnimationFrame(tick);
    }
  }

  function finishRetraction() {
    if (!active) {
      clearTimeout(retractTimer);
      visible = false;
      syncMotion();
    }
  }
  rig.addEventListener('transitionend', event => {
    if (event.target === rig && event.propertyName === 'transform') finishRetraction();
  });
  new ResizeObserver(position).observe(document.querySelector('.poster'));
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, {passive:true});
  document.addEventListener('visibilitychange', syncMotion);
  motion.addEventListener('change', syncMotion);
  position();

  function setLowered(next, flight) {
    active = next;
    clearTimeout(retractTimer);
    liftAnimation?.cancel();
    liftAnimation = null;
    rig.classList.toggle('is-flying', !!flight && !motion.matches);
    if (active) {
      visible = true;
      position();
    }
    rig.classList.toggle('is-lowered', active);
    lighting.classList.toggle('is-on', active);
    dismiss.disabled = !active;
    syncMotion();
    if (flight && !motion.matches) {
      const timing = discoLiftTiming(flight.distance, flight.speed);
      const animation = rig.animate([
        {transform:`translateY(${flight.offset}px)`},
        {transform:`translateY(${flight.offset - flight.distance}px)`}
      ], {...timing, fill:'both'});
      liftAnimation = animation;
      animation.finished.then(() => {
        if (liftAnimation !== animation) return;
        animation.cancel();
        liftAnimation = null;
        rig.classList.remove('is-flying');
        finishRetraction();
      }, () => {});
      retractTimer = setTimeout(finishRetraction, timing.duration + 50);
      return;
    }
    // A rapid reversal before the first paint may not emit transitionend.
    if (!active) retractTimer = setTimeout(finishRetraction, motion.matches ? 0 : 950);
  }

  function dismissBall(flight) {
    if (!active) return;
    liveStreak = 0;
    if (document.activeElement === dismiss) document.querySelector('[data-name="Live"]').closest('figure').focus({preventScroll:true});
    setLowered(false, flight);
  }

  let gesture = null, suppressClick = false;
  function sampleGesture(event) {
    gesture.samples = gesture.samples.filter(sample => event.timeStamp - sample.time <= 100);
    gesture.samples.push({y:event.clientY, time:event.timeStamp});
  }
  function releaseGesture() {
    const pointerId = gesture?.id;
    gesture = null;
    rig.classList.remove('is-dragging');
    rig.style.translate = '';
    if (pointerId !== undefined && dismiss.hasPointerCapture(pointerId)) dismiss.releasePointerCapture(pointerId);
  }
  dismiss.addEventListener('pointerdown', event => {
    if (!active || !event.isPrimary || event.button !== 0) return;
    suppressClick = false;
    gesture = {id:event.pointerId, x:event.clientX, y:event.clientY, samples:[]};
    sampleGesture(event);
    dismiss.setPointerCapture(event.pointerId);
  });
  dismiss.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    event.stopPropagation();
    sampleGesture(event);
    const dy = event.clientY - gesture.y;
    if (Math.hypot(event.clientX - gesture.x, dy) > 8) suppressClick = true;
    if (dy < -8 && !motion.matches) {
      rig.classList.add('is-dragging');
      rig.style.translate = `0 ${dy}px`;
    }
  });
  dismiss.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    sampleGesture(event);
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    const first = gesture.samples[0];
    const speed = Math.max(0, (first.y - event.clientY) / Math.max(1, event.timeStamp - first.time));
    const threshold = Math.max(24, Math.min(48, rig.clientHeight * .25));
    const swipeUp = (-dy >= threshold || (-dy >= 12 && speed >= .5)) && -dy > Math.abs(dx) * 1.15;
    const bounds = rig.getBoundingClientRect();
    const flight = {offset:bounds.top - parseFloat(rig.style.top), distance:Math.max(1, bounds.bottom + 16), speed};
    suppressClick = Math.hypot(dx, dy) > 8;
    if (swipeUp && !motion.matches) rig.classList.add('is-flying');
    releaseGesture();
    if (swipeUp) dismissBall(flight);
  });
  for (const eventName of ['pointercancel', 'lostpointercapture']) {
    dismiss.addEventListener(eventName, () => {
      if (!gesture) return;
      suppressClick = true;
      releaseGesture();
    });
  }
  dismiss.addEventListener('click', event => {
    // A sideways/downward drag is not a tap. Keyboard activation still works.
    if (event.detail && suppressClick) return;
    dismissBall();
  });

  return function onPortraitFlip(view) {
    if (active) return;
    liveStreak = view.canvas.dataset.name === 'Live' ? liveStreak + 1 : 0;
    if (liveStreak === 2) setLowered(true);
  };
}
