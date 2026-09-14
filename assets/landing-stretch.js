import { play } from "./vendor/cuelume/audio/engine.js";

"use strict";
// Live portrait stretching, copied from the preserved Pull a Face experiment.
(() => {
  const $ = id => document.getElementById(id);
  const clamp = (n,min=0,max=1) => Math.max(min,Math.min(max,n));
  const css = getComputedStyle(document.documentElement);
  const background = css.getPropertyValue('--paper').trim();
  const defaults = {strength:.8,curve:.75,response:120,reach:75,falloff:180,targetMode:'all',exitEasing:true,halftone:false,flipSound:true};
  const restingPose = () => ({x:.5,y:.5,tx:.5,ty:.5,amount:0,targetAmount:0,lastX:.5,lastY:.5,settle:null,held:false});
  // Seed both displayed and target poses before the first frame, so loading
  // never flashes the unstretched base image or eases in from the center.
  const initialPose = () => {
    const x=.15+Math.random()*.7, y=.15+Math.random()*.7;
    return {...restingPose(),x,y,tx:x,ty:y,lastX:x,lastY:y,amount:1,targetAmount:1};
  };
  const state = {...defaults,demo:false};
  const poses = [], views = [], pointerTargets = [];
  let activePose, gpu;
  let activePointerTargets = new Set();
  let frame=0,previous=0,dirty=true,ready=false;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const makeCanvas = (width,height) => Object.assign(document.createElement('canvas'),{width,height});
  function mapAxis(value, pointer, power) {
    const divide = .25 + .5 * clamp(pointer);
    return value < divide
      ? .5 * Math.pow(clamp(value / divide), power * divide)
      : 1 - .5 * Math.pow(clamp((1 - value) / (1 - divide)), power * (1 - divide));
  }

  const vertexSource = `
    attribute vec2 position;
    varying vec2 uv;
    void main() {
      uv = vec2(position.x * .5 + .5, .5 - position.y * .5);
      gl_Position = vec4(position, 0., 1.);
    }
  `;
  const fragmentSource = `
    precision highp float;
    varying vec2 uv;
    uniform sampler2D picture;
    uniform vec2 pointer;
    uniform float power;
    uniform float amount;
    float mapAxis(float value, float point) {
      float divide = .25 + .5 * clamp(point, 0., 1.);
      if (value < divide) return .5 * pow(clamp(value / divide, 0., 1.), power * divide);
      return 1. - .5 * pow(clamp((1. - value) / (1. - divide), 0., 1.), power * (1. - divide));
    }
    void main() {
      vec2 warped = vec2(mapAxis(uv.x, pointer.x), mapAxis(uv.y, pointer.y));
      gl_FragColor = texture2D(picture, mix(uv, warped, amount));
    }
  `;

  function compile(gl, type, code) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, code);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(error);
    }
    return shader;
  }

  class StretchView {
    constructor(canvas, texture, pose = state) {
      this.pose = pose;
      this.canvas = canvas;
      this.textureSource = texture;
      this.context = canvas.getContext('2d');
      this.observer = new ResizeObserver(invalidate);
      this.observer.observe(this.canvas);
      bindPointer(this.canvas, pose);
    }

    setupGL() {
      const gl = this.gl;
      const program = gl.createProgram();
      const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
      const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
      gl.attachShader(program, vertex); gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex); gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(gl.getUniformLocation(program, 'picture'), 0);
      this.uniforms = Object.fromEntries(['pointer','power','amount'].map(key => [key, gl.getUniformLocation(program, key)]));
      this.textures = new Map();
    }

    setTexture(texture) {
      this.textureSource = texture;
      invalidate();
    }

    draw(force = false) {
      if (!force && (this.pose.flipped || this.pose.turning)) return;
      if (this.canvas.closest('[hidden]')) return;
      // Entrance scaling is visual only; keep the backing canvas resolution stable.
      const tile = this.canvas.closest('figure');
      const box = {width:tile.clientWidth,height:tile.clientHeight};
      if (!box.width || !box.height) return;
      const ratio = Math.min(devicePixelRatio || 1, gpu?.gl ? 2 : 1);
      const width = Math.max(1, Math.round(box.width * ratio));
      const height = Math.max(1, Math.round(box.height * ratio));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width; this.canvas.height = height;
      }
      const pose = this.pose;
      const amount = pose.amount * state.strength;
      if (gpu?.gl && !gpu.lost) {
        const gl = gpu.gl, u = gpu.uniforms;
        if (gl.canvas.width !== width || gl.canvas.height !== height) {
          gl.canvas.width = width; gl.canvas.height = height;
        }
        let texture = gpu.textures.get(this.textureSource);
        if (!texture) {
          texture = gl.createTexture();
          gpu.textures.set(this.textureSource,texture);
          gl.bindTexture(gl.TEXTURE_2D,texture);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.textureSource);
        } else gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.viewport(0, 0, width, height);
        gl.uniform2f(u.pointer, pose.x, pose.y);
        gl.uniform1f(u.power, state.curve);
        gl.uniform1f(u.amount, amount);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.context.drawImage(gl.canvas,0,0);
      } else {
        // The mapping is separable: tile source rectangles into destination cells
        // with exactly the same power curve, preserving a live non-GPU fallback.
        const context = this.context, texture = this.textureSource;
        if (amount < .0001) { context.drawImage(texture, 0, 0, width, height); return; }
        const columns = 96, rows = 96;
        const xs = Array.from({length: columns + 1}, (_, i) => {
          const u = i / columns; return (u + (mapAxis(u, pose.x, state.curve) - u) * amount) * texture.width;
        });
        const ys = Array.from({length: rows + 1}, (_, i) => {
          const v = i / rows; return (v + (mapAxis(v, pose.y, state.curve) - v) * amount) * texture.height;
        });
        for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
          context.drawImage(texture, xs[x], ys[y], xs[x+1]-xs[x], ys[y+1]-ys[y],
            x * width / columns, y * height / rows, width / columns + .4, height / rows + .4);
        }
      }
    }
  }

  function setupRenderer() {
    // All portraits share one GPU context and a few source textures, so larger
    // grids do not exceed the browser's per-page WebGL context limit.
    const canvas = makeCanvas(1,1);
    gpu = { gl:canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true}), lost:false };
    if (!gpu.gl) return;
    try { StretchView.prototype.setupGL.call(gpu); }
    catch (error) { console.warn('Using software rendering:',error); gpu.gl = null; }
    canvas.addEventListener('webglcontextlost',event => { event.preventDefault(); gpu.lost = true; invalidate(); });
    canvas.addEventListener('webglcontextrestored',() => {
      try { StretchView.prototype.setupGL.call(gpu); gpu.lost = false; invalidate(); }
      catch (error) { showError(error); }
    });
  }

  function schedule() {
    if (!frame && ready && !document.hidden) frame = requestAnimationFrame(animate);
  }
  function invalidate() { dirty = true; schedule(); }
  function animate(time) {
    frame = 0;
    const dt = Math.min(time - previous || 16, 50); previous = time;
    let moving = false;
    poses.forEach((pose, index) => {
      if (pose.held) return;
      if (pose.settle) {
        pose.settle.elapsed += dt;
        const t = motion.matches ? 1 : Math.min(pose.settle.elapsed / 180, 1);
        const ease = 1 - (1 - t) ** 2;
        pose.x = pose.settle.x + (pose.tx-pose.settle.x)*ease;
        pose.y = pose.settle.y + (pose.ty-pose.settle.y)*ease;
        pose.amount = pose.settle.amount + (pose.targetAmount-pose.settle.amount)*ease;
        if (t === 1) pose.settle = null;
        else moving = true;
        dirty = true;
        return;
      }
      if (state.demo) {
        pose.tx = .5 + Math.sin(time / 1650 + index * 1.1) * .43;
        pose.ty = .5 + Math.cos(time / 2100 + index * .8) * .39;
        pose.targetAmount = 1;
        pose.lastX = pose.tx; pose.lastY = pose.ty;
      }
      const ease = motion.matches || !state.response ? 1 : 1 - Math.exp(-dt / state.response);
      const distance = Math.abs(pose.x-pose.tx) + Math.abs(pose.y-pose.ty) + Math.abs(pose.amount-pose.targetAmount);
      if (distance > .00005) {
        pose.x += (pose.tx-pose.x)*ease; pose.y += (pose.ty-pose.y)*ease;
        pose.amount += (pose.targetAmount-pose.amount)*ease;
        dirty = true;
      } else if (distance > 0) {
        pose.x = pose.tx; pose.y = pose.ty;
        pose.amount = pose.targetAmount;
        dirty = true;
      }
      moving ||= distance > .00005;
    });
    if (dirty) {
      views.forEach(view => view.draw()); dirty = false;

    }
    if (moving || (state.demo && poses.some(pose => !pose.held))) schedule();
  }

  function selectPose(pose) {
    if (activePose === pose) return;
    activePose = pose; updateStatus(); invalidate();
  }

  function holdShape(pose = activePose) {
    if (pose.flipped || pose.turning) { flipPortrait(pose); return; }
    activePointerTargets.forEach(target => {
      if (target.pose !== pose) return;
      target.keepShape(); activePointerTargets.delete(target);
    });
    pose.settle = null;
    pose.tx = pose.lastX = pose.x;
    pose.ty = pose.lastY = pose.y;
    pose.targetAmount = pose.amount;
    pose.held = !pose.held;
    activePose = pose;
    updateStatus(); invalidate();
  }

  function flipPortrait(pose) {
    clearTimeout(pose.flipTimer);
    const view = views.find(view => view.pose === pose);
    const tile = view.canvas.closest('figure');
    activePointerTargets.forEach(target => {
      if (target.pose === pose) { target.keepShape(); activePointerTargets.delete(target); }
    });
    pose.settle = null;
    pose.tx = pose.lastX = pose.x;
    pose.ty = pose.lastY = pose.y;
    pose.targetAmount = pose.amount;
    if (!pose.flipped && !pose.turning) {
      // Copy the visible frame before rotating; its shape and color stay frozen.
      tile.querySelectorAll('.portrait-snapshot,.portrait-soften').forEach(canvas => {
        canvas.width = view.canvas.width; canvas.height = view.canvas.height;
        canvas.getContext('2d').drawImage(view.canvas,0,0);
      });
    }
    if (state.flipSound) play(view.canvas.dataset.portrait === "beibi" ? "sparkle" : "toggle", {volume:.35});
    pose.flipped = !pose.flipped;
    pose.held = true;
    pose.turning = true;
    activePose = pose;
    tile.dataset.flipped = String(pose.flipped);
    updateStatus();
    // Changing the target reverses the CSS transition from its current angle.
    // Keep a fallback for reduced motion or reversals before the first paint.
    pose.flipTimer = setTimeout(() => finishFlip(pose),motion.matches ? 0 : 640);
  }

  function finishFlip(pose) {
    clearTimeout(pose.flipTimer);
    pose.turning = false;
    pose.held = !!pose.flipped;
    updateStatus(); invalidate();
  }

  function bindPointer(canvas, pose = activePose) {
    const tile = canvas.closest('figure');
    const canFlip = tile.classList.contains('portrait-flip');
    const surface = canFlip ? tile : canvas;
    const activate = () => {
      if (pose.entering) return;
      return canFlip ? flipPortrait(pose) : holdShape(pose);
    };
    if (canFlip) tile.querySelector('.portrait-turn').addEventListener('transitionend', event => {
      if (event.propertyName === 'transform' && event.target === event.currentTarget) finishFlip(pose);
    });
    let down = null;
    let engaged = false;
    const move = (event, influence = 1) => {
      if (pose.held) return;
      pose.settle = null;
      engaged = true;
      if (state.demo) { state.demo = false; updateStatus(); }
      const box = tile.getBoundingClientRect();
      // Finite reach spreads coordinates across its expanded area. Infinite
      // reach uses the image's edges for direction and distance for strength.
      const padding = state.targetMode === 'infinite' ? 0 : state.reach;
      pose.tx = pose.lastX = clamp((event.clientX-box.left+padding)/(box.width+padding*2));
      pose.ty = pose.lastY = clamp((event.clientY-box.top+padding)/(box.height+padding*2));
      pose.targetAmount = influence; schedule();
    };
    const keepShape = (easeExit = false) => {
      if (!engaged) return;
      engaged = false;
      if (pose.held || state.demo) return;
      if (easeExit && state.exitEasing && state.targetMode !== 'infinite' && !motion.matches) {
        // Finish the last requested stretch in a short deceleration, without
        // returning toward the original or overshooting the target.
        pose.settle = { x:pose.x, y:pose.y, amount:pose.amount, elapsed:0 };
        schedule(); return;
      }
      // Stop at the visible shape without relaxing or continuing to drift.
      pose.tx = pose.lastX = pose.x;
      pose.ty = pose.lastY = pose.y;
      pose.targetAmount = pose.amount;
      pose.settle = null;
      schedule();
    };
    pointerTargets.push({ canvas, pose, move, keepShape });
    surface.addEventListener('focus',() => selectPose(pose));
    surface.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      down = { x: event.clientX, y: event.clientY, id: event.pointerId };
      canvas.setPointerCapture(event.pointerId); routePointer(event);
    });
    surface.addEventListener('pointerup', event => {
      if (!down || event.pointerId !== down.id) return;
      const moved = Math.hypot(event.clientX-down.x, event.clientY-down.y);
      down = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (moved < 6) activate();
      else if (event.pointerType !== 'mouse') {
        stopPointer(true);
      } else {
        routePointer(event);
      }
    });
    // Assistive activation has no pointer sequence; ordinary clicks use pointerup.
    if (canFlip) surface.addEventListener('click', event => {
      if (!event.detail) activate();
    });
    surface.addEventListener('pointercancel', () => { down = null; keepShape(); });
    surface.addEventListener('lostpointercapture', () => { if (down) { down = null; keepShape(); } });
    surface.addEventListener('keydown', event => {
      const deltas = {ArrowLeft:[-.05,0],ArrowRight:[.05,0],ArrowUp:[0,-.05],ArrowDown:[0,.05]};
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (!event.repeat) activate(); }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (event.repeat) return;
        if (pose.flipped) flipPortrait(pose);
        else if (pose.held && !pose.turning) holdShape(pose);
        return;
      }
      if (!deltas[event.key]) return;
      event.preventDefault(); selectPose(pose);
      if (pose.held) return;
      pose.settle = null;
      activePose = pose;
      state.demo = false;
      pose.tx = pose.lastX = clamp(pose.tx + deltas[event.key][0]);
      pose.ty = pose.lastY = clamp(pose.ty + deltas[event.key][1]);
      pose.targetAmount = 1; updateStatus(); schedule();
    });
  }

  function stopPointer(easeExit = false) {
    activePointerTargets.forEach(target => target.keepShape(easeExit === true));
    activePointerTargets.clear();
  }

  function routePointer(event) {
    // Controls should never reshape an image while the user adjusts a slider.
    if (event.target?.closest?.('button, input, select, a')) {
      stopPointer(true); return;
    }
    const captured = pointerTargets.find(target => target.canvas.hasPointerCapture(event.pointerId));
    const candidates = [];
    for (const target of pointerTargets) {
      if (target.pose.entering) continue;
      if (target.canvas.closest('[hidden]') || (state.targetMode === 'nearest' && captured && captured !== target)) continue;
      const box = target.canvas.closest('figure').getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const dx = Math.max(box.left-event.clientX, 0, event.clientX-box.right);
      const dy = Math.max(box.top-event.clientY, 0, event.clientY-box.bottom);
      const distance = Math.hypot(dx, dy);
      if (state.targetMode !== 'infinite' && distance > state.reach) continue;
      const center = Math.hypot(event.clientX-(box.left+box.width/2), event.clientY-(box.top+box.height/2));
      candidates.push({ target, distance, center });
    }
    candidates.sort((a,b) => a.distance-b.distance || a.center-b.center);
    const nextTargets = new Set(), selectedPoses = new Set(), influences = new Map();
    for (const { target, distance } of candidates) {
      // Portrait and checkerboard share one pose in Both view: use the closer
      // surface's coordinates so they remain synchronized in either mode.
      if (selectedPoses.has(target.pose)) continue;
      nextTargets.add(target); selectedPoses.add(target.pose);
      // Smooth at the image edge, half strength at the falloff distance, and
      // a nonzero tail at every finite distance: no abrupt activation cutoff.
      influences.set(target, state.targetMode === 'infinite'
        ? 1 / (1 + (distance / state.falloff) ** 2) : 1);
      if (state.targetMode === 'nearest') break;
    }
    activePointerTargets.forEach(target => {
      if (!nextTargets.has(target)) target.keepShape(true);
    });
    activePointerTargets = nextTargets;
    nextTargets.forEach(target => target.move(event,influences.get(target)));
    if (nextTargets.size) selectPose(nextTargets.values().next().value.pose);
  }


  function updateStatus() {
    for (const view of views) {
      view.canvas.closest('figure').dataset.held = String(view.pose.held);
      const tile = view.canvas.closest('.portrait-flip');
      if (tile) {
        tile.setAttribute('aria-pressed',String(!!view.pose.flipped));
        tile.setAttribute('aria-label',view.pose.flipped
          ? `${[...tile.querySelectorAll('.portrait-details strong,.portrait-details span')].map(line => line.textContent).join('. ')}. Click or press Enter to turn back and stretch.`
          : `${view.canvas.dataset.name}. Move to stretch. Click or press Enter to reveal instruments.`);
        continue;
      }
      view.canvas.setAttribute('aria-label',`${view.canvas.dataset.name}. ${view.pose.held ? 'Held; click to release.' : 'Move to stretch; click to hold.'} Arrow keys stretch, Space holds, Escape releases.`);
    }
  }

  function preparePortrait(image,ink,halftone = false) {
    // The same treatment applies to every cutout: fill 4:5, monochrome,
    // contrast 125%, then duotone using its brand ink before live warping.
    const texture=makeCanvas(640,800), ctx=texture.getContext('2d');
    ctx.drawImage(image,0,0,640,800);
    const pixels=ctx.getImageData(0,0,640,800), data=pixels.data;
    const shadow=[1,3,5].map(i=>parseInt(ink.slice(i,i+2),16));
    const highlight=[255,249,235];
    for (let i=0;i<data.length;i+=4) {
      if (!data[i+3]) continue;
      const luminance=(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2])/255;
      const tone=clamp((luminance-.5)*1.25+.5);
      for (let c=0;c<3;c++) data[i+c]=shadow[c]+tone*(highlight[c]-shadow[c]);
    }
    ctx.putImageData(pixels,0,0);
    if (halftone) {
      const mask = makeCanvas(640,800);
      mask.getContext('2d').putImageData(pixels,0,0);
      ctx.fillStyle = 'rgb(255,249,235)';
      ctx.fillRect(0,0,640,800);
      ctx.fillStyle = ink;
      // Average each cell before converting its tone to ink coverage. The
      // cached dots stretch with the photograph and retain its cutout alpha.
      const cell = 6;
      for (let y=0;y<800;y+=cell) for (let x=0;x<640;x+=cell) {
        let tone = 0, weight = 0;
        for (let sy=y;sy<Math.min(y+cell,800);sy++) for (let sx=x;sx<Math.min(x+cell,640);sx++) {
          const i=(sy*640+sx)*4, alpha=data[i+3]/255;
          tone += clamp((data[i]-shadow[0])/(highlight[0]-shadow[0]))*alpha;
          weight += alpha;
        }
        if (!weight) continue;
        const radius = Math.sqrt(1-tone/weight)*cell*.71;
        ctx.beginPath();ctx.arc(x+cell/2,y+cell/2,radius,0,Math.PI*2);ctx.fill();
      }
      ctx.globalCompositeOperation='destination-in';
      ctx.drawImage(mask,0,0);
    }
    ctx.globalCompositeOperation='destination-over';
    ctx.fillStyle=background; ctx.fillRect(0,0,640,800);
    return texture;
  }

  function showError(error) {
    document.querySelector('.poster').setAttribute('aria-busy','false');
    console.error('Portraits could not load:',error);
    $('portrait-error').hidden=false;
    $('portrait-error').textContent='Portretta kunne ikkje lastast. Prøv å laste sida på nytt.';
  }

  async function revealPortraits() {
    const poster=document.querySelector('.poster');
    // Left to right on row one, right to left on row two, then Live.
    const snake=[0,1,2,5,4,3,6];
    views.forEach(view=>{view.pose.entering=true;view.draw(true);});
    poster.dataset.loading='false';
    poster.setAttribute('aria-busy','false');
    await Promise.all(snake.map(async (index,step)=>{
      const view=views[index],tile=view.canvas.closest('figure');
      if (!motion.matches) {
        const fade=tile.animate([{opacity:0},{opacity:1}],
          {duration:70,delay:step*100,easing:'ease-out',fill:'both'});
        const entrance=tile.animate([
          {transform:'scale(.8)',offset:0},
          {transform:'scale(1.035)',offset:.62},
          {transform:'scale(.992)',offset:.82},
          {transform:'scale(1)',offset:1}
        ],{duration:540,delay:step*100,easing:'ease-out',fill:'both'});
        try {
          await entrance.finished;
          // Play at the landing, never queue blocked audio for a later gesture.
          if (state.flipSound && !document.hidden) {
            play(view.canvas.dataset.portrait === 'beibi' ? 'sparkle' : 'toggle',{volume:.35});
          }
        } catch { /* Canceled entrances still reveal, without a landing sound. */ }
        entrance.cancel();
        fade.cancel();
      }
      tile.inert=false;
      view.pose.entering=false;
    }));
  }

  async function start() {
    const canvases=[...document.querySelectorAll('canvas[data-source]')];
    const images=await Promise.all(canvases.map(async canvas => {
      const image=new Image(); image.src=canvas.dataset.source; await image.decode(); return image;
    }));
    await document.fonts.ready;
    setupRenderer();
    canvases.forEach((canvas,index)=>{
      const pose=initialPose(); poses.push(pose);
      const ink=css.getPropertyValue(canvas.dataset.portrait === 'beibi' ? '--pink' : '--brown').trim();
      const smoothTexture=preparePortrait(images[index],ink,state.halftone);
      const view=new StretchView(canvas,smoothTexture,pose);
      Object.assign(view,{smoothTexture,sourceImage:images[index],ink});
      views.push(view);
    });
    activePose=poses[0]; ready=true;
    document.addEventListener('pointermove',routePointer);
    document.addEventListener('pointercancel',()=>stopPointer(true));
    document.documentElement.addEventListener('pointerleave',()=>stopPointer(true));
    window.addEventListener('blur',()=>stopPointer(true));
    document.addEventListener('visibilitychange',()=>{
      if (document.hidden) {cancelAnimationFrame(frame);frame=0;}
      else {previous=0;invalidate();}
    });
    motion.addEventListener('change',()=>{if (motion.matches) state.demo=false;updateStatus();invalidate();});
    updateStatus();
    await revealPortraits();
    invalidate();
  }
  start().catch(showError);
})();
