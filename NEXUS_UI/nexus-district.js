/* NEXUS District Engine — shared 3D world used by every district page.
   Inherits the landing-page visual DNA: same palette, fog, materials, motion.
   Global API: window.NexusDistrict.mount(canvasId, opts) -> controls
   opts = {
     accent: 0xRRGGBB,            // district color
     theme: 'marketplace'|'network'|'audit'|'execution'|'treasury',
     nodes: [{pos:[x,y,z], color, score}],   // holographic pillars (entities)
     anchors: [{el:HTMLElement, pos:[x,y,z], scaleByDepth:true}],
     camera: {pos:[x,y,z], look:[x,y,z]},
     onFrame: (t)=>{}
   }
*/
(function () {
  function glowTex() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  function winTex() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#05080f'; x.fillRect(0, 0, 64, 64);
    for (let i = 2; i < 64; i += 5) for (let j = 3; j < 64; j += 7) {
      if (Math.random() < 0.3) {
        x.globalAlpha = 0.4 + Math.random() * 0.6;
        x.fillStyle = Math.random() < 0.72 ? '#2f7bff' : '#bcd6ff';
        x.fillRect(i, j, 2, 3);
      }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function mount(canvasId, opts) {
    opts = opts || {};
    const accent = opts.accent || 0x4aa3ff;
    const cv = document.getElementById(canvasId);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04060e);
    scene.fog = new THREE.FogExp2(0x05070f, 0.0052);
    const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 1400);
    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    renderer.setSize(innerWidth, innerHeight);

    const GLOW = glowTex(), WIN = winTex();
    const ac = new THREE.Color(accent);

    function glow(color, scale, x, y, z) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
      s.scale.set(scale, scale, 1); s.position.set(x, y, z); return s;
    }

    // lights
    scene.add(new THREE.AmbientLight(0x223861, 0.75));
    const dir = new THREE.DirectionalLight(0x6f9bff, 0.45); dir.position.set(30, 80, 40); scene.add(dir);
    const key = new THREE.PointLight(accent, 1.4, 160); key.position.set(0, 26, 0); scene.add(key);

    // ground + grid
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: 0x05070f, roughness: 0.5, metalness: 0.75 }));
    plane.rotation.x = -Math.PI / 2; plane.position.y = -0.2; scene.add(plane);
    const grid = new THREE.GridHelper(700, 90, accent, 0x0e1f3a);
    grid.position.y = 0.02; grid.material.transparent = true; grid.material.opacity = 0.42; scene.add(grid);

    // ambient building field (themed, dim)
    (function buildings() {
      const count = 150, geo = new THREE.BoxGeometry(1, 1, 1);
      const emi = new THREE.Color(accent).multiplyScalar(0.35).getHex();
      const mat = new THREE.MeshStandardMaterial({ color: 0x080e1a, emissive: emi, emissiveIntensity: 0.8, emissiveMap: WIN, roughness: 0.8, metalness: 0.45 });
      const mesh = new THREE.InstancedMesh(geo, mat, count); const d = new THREE.Object3D();
      let p = 0, tries = 0;
      while (p < count && tries < count * 12) {
        tries++;
        const a = Math.random() * Math.PI * 2, r = 48 + Math.random() * 150;
        const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.92;
        const h = 4 + Math.pow(Math.random(), 1.7) * 46, w = 3 + Math.random() * 7;
        d.position.set(x, h / 2, z); d.scale.set(w, h, w); d.rotation.y = Math.random() * 0.5; d.updateMatrix();
        mesh.setMatrixAt(p, d.matrix); p++;
      }
      mesh.count = p; scene.add(mesh);
    })();

    // floating dust
    const dust = (function () {
      const N = 850, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
      const cols = [[ac.r, ac.g, ac.b], [0.49, 0.36, 1], [0.6, 0.78, 1]];
      for (let i = 0; i < N; i++) {
        pos[i*3] = (Math.random()-0.5)*340; pos[i*3+1] = Math.random()*130 - 6; pos[i*3+2] = (Math.random()-0.5)*340;
        const c = cols[(Math.random()*cols.length)|0]; col[i*3]=c[0]; col[i*3+1]=c[1]; col[i*3+2]=c[2];
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.7, map: GLOW, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
      scene.add(pts); return pts;
    })();

    // drones
    const drones = [];
    for (let i = 0; i < 8; i++) {
      const s = glow(i % 3 === 0 ? 0xf5b740 : (i % 2 ? 0xa874ff : accent), 1.7, 0, 0, 0);
      scene.add(s);
      drones.push({ s, r: 36 + Math.random() * 100, y: 14 + Math.random() * 40, sp: 0.05 + Math.random() * 0.09, ph: Math.random() * 6.28 });
    }

    // ---- centerpiece by theme ----
    const spin = [];
    const anims = [];
    const cp = new THREE.Group(); scene.add(cp);
    buildCenterpiece(opts.theme, cp, accent, glow, WIN, spin, anims);

    // ---- holographic entity pillars (nodes) ----
    const nodeObjs = [];
    (opts.nodes || []).forEach(n => {
      const col = n.color || accent;
      const g = new THREE.Group();
      // light column
      const col3d = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.4, 18, 14, 1, true),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      col3d.position.y = 9; g.add(col3d);
      // reputation ring
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4 + (n.score || 0.7) * 1.6, 0.12, 8, 60),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 16; g.add(ring);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.08, 8, 48),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending }));
      ring2.rotation.x = Math.PI / 2.2; ring2.position.y = 16; g.add(ring2);
      g.add(glow(col, 14, 0, 16, 0));
      g.position.set(n.pos[0], n.pos[1] || 0, n.pos[2]);
      scene.add(g);
      nodeObjs.push({ g, ring, ring2, base: n.pos[1] || 0, ph: Math.random() * 6.28 });
    });

    // ---- state ----
    const mouse = { x: 0, y: 0 }, mouseT = { x: 0, y: 0 };
    const t0 = performance.now();
    const camPos = opts.camera && opts.camera.pos ? opts.camera.pos.slice() : [0, 30, 90];
    const camLook = opts.camera && opts.camera.look ? opts.camera.look.slice() : [0, 14, 0];
    const anchors = opts.anchors || [];
    const _v = new THREE.Vector3();

    function onMove(e) { mouseT.x = (e.clientX / innerWidth) * 2 - 1; mouseT.y = (e.clientY / innerHeight) * 2 - 1; }
    function onResize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
    addEventListener('mousemove', onMove, { passive: true });
    addEventListener('resize', onResize);

    let raf, alive = true, frames = 0;
    function loop() {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      frames++; window.__nxFrames = frames;
      const t = (performance.now() - t0) / 1000;
      mouse.x += (mouseT.x - mouse.x) * 0.05; mouse.y += (mouseT.y - mouse.y) * 0.05;

      // cinematic breathing + parallax orbit
      const orbit = Math.sin(t * 0.12) * 6;
      camera.position.set(
        camPos[0] + mouse.x * 10 + orbit,
        camPos[1] + Math.sin(t * 0.4) * 2.2 - mouse.y * 6,
        camPos[2] + Math.cos(t * 0.3) * 3
      );
      camera.lookAt(camLook[0] + mouse.x * 3, camLook[1], camLook[2]);

      spin.forEach(s => { s.obj.rotation[s.axis] += s.sp; });
      for (let i = 0; i < anims.length; i++) { try { anims[i](t); } catch (e) {} }
      dust.rotation.y += 0.0004;

      drones.forEach(d => { const a = t * d.sp + d.ph; d.s.position.set(Math.cos(a) * d.r, d.y + Math.sin(a * 2) * 3, Math.sin(a) * d.r); });
      nodeObjs.forEach(n => {
        n.g.position.y = n.base + Math.sin(t * 0.6 + n.ph) * 0.7;
        n.ring.rotation.z += 0.01; n.ring2.rotation.z -= 0.014;
      });

      // project HTML anchors into 3D space
      const W = innerWidth, H = innerHeight;
      anchors.forEach(a => {
        if (!a.el) return;
        _v.set(a.pos[0], a.pos[1], a.pos[2]).project(camera);
        if (_v.z > 1) { a.el.style.opacity = '0'; return; }
        const sx = (_v.x * 0.5 + 0.5) * W, sy = (-_v.y * 0.5 + 0.5) * H;
        const dist = camera.position.distanceTo(new THREE.Vector3(a.pos[0], a.pos[1], a.pos[2]));
        let sc = a.scaleByDepth === false ? 1 : Math.max(0.62, Math.min(1.12, 1.5 - dist / 150));
        a.el.style.left = sx + 'px'; a.el.style.top = sy + 'px';
        a.el.style.transform = 'translate(-50%,-50%) scale(' + sc.toFixed(3) + ')';
        a.el.style.opacity = String(Math.max(0.25, Math.min(1, sc)));
        a.el.style.zIndex = String(500 - Math.round(dist));
      });

      if (opts.onFrame) { try { opts.onFrame(t); } catch (e) {} }
      renderer.render(scene, camera);
    }
    loop();

    return {
      camera, scene, renderer,
      dispose() {
        alive = false; cancelAnimationFrame(raf);
        removeEventListener('mousemove', onMove); removeEventListener('resize', onResize);
        renderer.dispose();
      }
    };
  }

  function buildCenterpiece(theme, cp, accent, glow, WIN, spin, anims) {
    anims = anims || [];
    if (theme === 'network') {
      // holographic globe + node mesh
      const globe = new THREE.Mesh(new THREE.SphereGeometry(16, 28, 20), new THREE.MeshBasicMaterial({ color: accent, wireframe: true, transparent: true, opacity: 0.28 }));
      globe.position.y = 22; cp.add(globe); spin.push({ obj: globe, axis: 'y', sp: 0.0025 });
      const N = 380, pos = new Float32Array(N * 3);
      const pts3 = [];
      for (let i = 0; i < N; i++) {
        const u = Math.random(), vv = Math.random(); const th = 2 * Math.PI * u, ph = Math.acos(2 * vv - 1);
        const r = 16.2; const x = r * Math.sin(ph) * Math.cos(th), y = 22 + r * Math.cos(ph), z = r * Math.sin(ph) * Math.sin(th);
        pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z; if (i < 60) pts3.push(new THREE.Vector3(x, y, z));
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      cp.add(new THREE.Points(g, new THREE.PointsMaterial({ color: accent, size: 1.1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
      // arcs between random nodes
      const lp = [];
      for (let i = 0; i < 70; i++) { const a = pts3[(Math.random()*pts3.length)|0], b = pts3[(Math.random()*pts3.length)|0]; lp.push(a.x,a.y,a.z,b.x,b.y,b.z); }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lp), 3));
      cp.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending })));
      cp.add(glow(accent, 80, 0, 22, 0));
    } else if (theme === 'audit') {
      // VERIFICATION TOWER — tallest landmark: cyan rim + purple proof beam + attestation streams
      const base = new THREE.Mesh(new THREE.BoxGeometry(9, 54, 9), new THREE.MeshStandardMaterial({ color: 0x0a1120, emissive: accent, emissiveIntensity: 0.7, emissiveMap: WIN, roughness: 0.7, metalness: 0.5 }));
      base.position.y = 27; cp.add(base);
      // cyan rim-light edges (wireframe shell)
      const rim = new THREE.Mesh(new THREE.BoxGeometry(9.5, 54.5, 9.5), new THREE.MeshBasicMaterial({ color: 0x34d4c0, wireframe: true, transparent: true, opacity: 0.35 }));
      rim.position.y = 27; cp.add(rim);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(2.8, 16, 6), new THREE.MeshStandardMaterial({ color: 0x0a1834, emissive: 0x34d4c0, emissiveIntensity: 1.7, metalness: 0.7, roughness: 0.25 }));
      spire.position.y = 62; cp.add(spire);
      // PURPLE PROOF BEAM rising from the spire crown (short — source stays framed with the crown)
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.3, 34, 18, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x7c5cff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      beam.position.y = 88; cp.add(beam);
      const beamCore = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.12, 34, 10),
        new THREE.MeshBasicMaterial({ color: 0xb9a6ff, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false }));
      beamCore.position.y = 88; cp.add(beamCore);
      // proof pulses travelling UP the beam
      const pulses = [];
      for (let i = 0; i < 5; i++) { const s = glow(0xb9a6ff, 5, 0, 71, 0); cp.add(s); pulses.push({ s, t: i / 5 }); }
      anims.push((t) => {
        beamCore.material.opacity = 0.5 + Math.sin(t * 3) * 0.2;
        pulses.forEach(p => { p.t += 0.012; if (p.t > 1) p.t -= 1; p.s.position.y = 71 + p.t * 32; p.s.material.opacity = Math.sin(p.t * Math.PI) * 0.95; });
      });
      // proof graph nodes orbiting AROUND the crown — pushed outward so they never obscure the tower
      const grp = new THREE.Group(); grp.position.y = 46; cp.add(grp); spin.push({ obj: grp, axis: 'y', sp: 0.004 });
      const verts = [];
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * 6.28, r = 20 + Math.random() * 9, h = (Math.random() - 0.5) * 22;
        const x = Math.cos(a) * r, z = Math.sin(a) * r, p = new THREE.Vector3(x, h, z); verts.push(p);
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.95), new THREE.MeshBasicMaterial({ color: i % 5 === 0 ? 0x4ade80 : 0x34d4c0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }));
        m.position.copy(p); grp.add(m);
      }
      const lp = [];
      for (let i = 0; i < verts.length; i++) { const b = verts[(i + 1 + ((Math.random()*3)|0)) % verts.length]; lp.push(verts[i].x,verts[i].y,verts[i].z,b.x,b.y,b.z); }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lp), 3));
      grp.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x34d4c0, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending })));
      // ATTESTATION STREAMS — particles spiralling up into the spire (execution → proof)
      const SN = 220, sp = new Float32Array(SN * 3), sd = [];
      for (let i = 0; i < SN; i++) { const a = Math.random() * 6.28, r = 7 + Math.random() * 22; sd.push({ a, r, y: Math.random() * 60, sp: 0.18 + Math.random() * 0.3 }); sp[i*3]=Math.cos(a)*r; sp[i*3+1]=sd[i].y; sp[i*3+2]=Math.sin(a)*r; }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      const streams = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x34d4c0, size: 0.7, map: glow(0,1,0,0,0).material.map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
      cp.add(streams);
      anims.push(() => {
        const arr = sg.attributes.position.array;
        for (let i = 0; i < SN; i++) { const d = sd[i]; d.y += d.sp; const tnorm = d.y / 60; const rr = d.r * (1 - tnorm * 0.82); if (d.y > 60) { d.y = 0; d.r = 7 + Math.random() * 22; } arr[i*3]=Math.cos(d.a + d.y*0.03)*rr; arr[i*3+1]=d.y; arr[i*3+2]=Math.sin(d.a + d.y*0.03)*rr; }
        sg.attributes.position.needsUpdate = true;
      });
      cp.add(glow(0x34d4c0, 44, 0, 56, 0));
      cp.add(glow(0x7c5cff, 60, 0, 84, 0));
    } else if (theme === 'execution') {
      // ring exchange platform + energy bars
      const plat = new THREE.Mesh(new THREE.CylinderGeometry(13, 15, 5, 36), new THREE.MeshStandardMaterial({ color: 0x081a24, emissive: accent, emissiveIntensity: 0.5, emissiveMap: WIN, roughness: 0.7, metalness: 0.6 }));
      plat.position.y = 4; cp.add(plat);
      [11, 14, 17].forEach((r, i) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.22, 8, 70), new THREE.MeshBasicMaterial({ color: i === 1 ? 0x4ade80 : accent, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }));
        ring.rotation.x = Math.PI / 2; ring.position.y = 7 + i * 0.4; cp.add(ring); spin.push({ obj: ring, axis: 'z', sp: 0.004 * (i + 1) });
      });
      const bars = new THREE.Group(); bars.position.y = 7; cp.add(bars);
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * 6.28, r = 9; const h = 2 + Math.random() * 14;
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, h, 0.5), new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0x4ade80 : accent, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
        b.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r); bars.add(b);
      }
      spin.push({ obj: bars, axis: 'y', sp: 0.003 });
      cp.add(glow(accent, 64, 0, 12, 0));
    } else if (theme === 'treasury') {
      // gold vault + capital pool rings — polished materials + animation
      const vault = new THREE.Mesh(new THREE.BoxGeometry(15, 18, 15), new THREE.MeshStandardMaterial({ color: 0x1a1308, emissive: accent, emissiveIntensity: 0.42, roughness: 0.22, metalness: 1.0 }));
      vault.position.y = 9; cp.add(vault);
      // brushed edge frame for material richness
      const frame = new THREE.Mesh(new THREE.BoxGeometry(15.4, 18.4, 15.4), new THREE.MeshBasicMaterial({ color: accent, wireframe: true, transparent: true, opacity: 0.28 }));
      frame.position.y = 9; cp.add(frame);
      const door = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.5, 14, 48), new THREE.MeshStandardMaterial({ color: 0x2a1d08, emissive: accent, emissiveIntensity: 1.3, metalness: 1, roughness: 0.2 }));
      door.position.set(0, 9, 7.6); cp.add(door); spin.push({ obj: door, axis: 'z', sp: 0.006 });
      const doorGlow = new THREE.Mesh(new THREE.CircleGeometry(3.8, 36), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending }));
      doorGlow.position.set(0, 9, 7.7); cp.add(doorGlow);
      // floating capital pools with individual bob + emissive pulse
      const pools = new THREE.Group(); pools.position.y = 26; cp.add(pools); spin.push({ obj: pools, axis: 'y', sp: 0.0035 });
      const poolMeshes = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * 6.28, r = 13;
        const mat = new THREE.MeshStandardMaterial({ color: 0x1a1206, emissive: accent, emissiveIntensity: 1.0, metalness: 0.95, roughness: 0.22 });
        const pool = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.7, 16, 40), mat);
        pool.rotation.x = Math.PI / 2; pool.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); pools.add(pool);
        poolMeshes.push({ pool, base: 0, ph: i * 1.3, mat });
      }
      // gold shimmer rising from the vault
      const GN = 90, gp = new Float32Array(GN * 3), gd = [];
      for (let i = 0; i < GN; i++) { const a = Math.random()*6.28, r = Math.random()*8; gd.push({ a, r, y: Math.random()*22, sp: 0.05 + Math.random()*0.09 }); gp[i*3]=Math.cos(a)*r; gp[i*3+1]=gd[i].y; gp[i*3+2]=Math.sin(a)*r; }
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(gp, 3));
      const shimmer = new THREE.Points(gg, new THREE.PointsMaterial({ color: accent, size: 0.6, map: glow(0,1,0,0,0).material.map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
      shimmer.position.y = 2; cp.add(shimmer);
      anims.push((t) => {
        poolMeshes.forEach(p => { p.pool.position.y = Math.sin(t * 0.8 + p.ph) * 2.2; p.mat.emissiveIntensity = 0.8 + Math.sin(t * 1.4 + p.ph) * 0.35; });
        doorGlow.material.opacity = 0.14 + Math.sin(t * 2) * 0.08;
        const arr = gg.attributes.position.array;
        for (let i = 0; i < GN; i++) { const d = gd[i]; d.y += d.sp; if (d.y > 24) { d.y = 0; d.r = Math.random()*8; } arr[i*3+1] = d.y; }
        gg.attributes.position.needsUpdate = true;
      });
      cp.add(glow(accent, 60, 0, 14, 0));
    } else if (theme === 'soulmint') {
      // SOULMINT CHAMBER — central intelligence core, orbiting memory fragments,
      // encryption rings, glowing policy seals, crystallizing identity
      const coreMat = new THREE.MeshStandardMaterial({ color: 0x0a1c40, emissive: accent, emissiveIntensity: 1.6, roughness: 0.25, metalness: 0.7, flatShading: true });
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(5.2, 1), coreMat); core.position.y = 26; cp.add(core); spin.push({ obj: core, axis: 'y', sp: 0.004 });
      // crystallizing identity shell that slowly forms
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(7.6, 0), new THREE.MeshBasicMaterial({ color: 0xb9a6ff, wireframe: true, transparent: true, opacity: 0.5 }));
      crystal.position.y = 26; cp.add(crystal); spin.push({ obj: crystal, axis: 'x', sp: 0.0035 });
      // encryption rings assembling around the intelligence
      const ringMeshes = [];
      [[9, 0x4aa3ff], [12, 0x7c5cff], [15, 0x34d4c0]].forEach(([r, c], i) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.14, 10, 96), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }));
        ring.position.y = 26; ring.rotation.x = Math.PI / 2 + i * 0.5; ring.rotation.y = i * 0.7; cp.add(ring);
        ringMeshes.push(ring); spin.push({ obj: ring, axis: i === 1 ? 'y' : 'z', sp: 0.006 * (i + 1) });
      });
      // orbiting memory fragments (physical shards)
      const frags = new THREE.Group(); frags.position.y = 26; cp.add(frags); spin.push({ obj: frags, axis: 'y', sp: -0.006 });
      const fragData = [];
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * 6.28, r = 17 + Math.random() * 10, h = (Math.random() - 0.5) * 24;
        const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(1 + Math.random() * 0.8), new THREE.MeshStandardMaterial({ color: 0x0a1834, emissive: i % 3 === 0 ? 0x34d4c0 : 0x7c5cff, emissiveIntensity: 1.3, metalness: 0.6, roughness: 0.3, flatShading: true }));
        shard.position.set(Math.cos(a) * r, h, Math.sin(a) * r); frags.add(shard); fragData.push({ shard, ph: Math.random() * 6.28 });
      }
      // glowing policy seals — hex plates orbiting lower
      const seals = new THREE.Group(); seals.position.y = 10; cp.add(seals); spin.push({ obj: seals, axis: 'y', sp: 0.005 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * 6.28, r = 14;
        const seal = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.4, 6), new THREE.MeshStandardMaterial({ color: 0x141022, emissive: 0x7c5cff, emissiveIntensity: 1.1, metalness: 0.8, roughness: 0.3 }));
        seal.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); seal.rotation.x = Math.PI / 2; seals.add(seal);
      }
      // base platform
      const plat = new THREE.Mesh(new THREE.CylinderGeometry(11, 13, 3, 40), new THREE.MeshStandardMaterial({ color: 0x0a0f1e, emissive: accent, emissiveIntensity: 0.4, emissiveMap: WIN, roughness: 0.6, metalness: 0.6 }));
      plat.position.y = 1.5; cp.add(plat);
      anims.push((t) => {
        coreMat.emissiveIntensity = 1.3 + Math.sin(t * 2.2) * 0.5;
        crystal.material.opacity = 0.35 + Math.sin(t * 1.1) * 0.2;
        core.position.y = 26 + Math.sin(t * 0.6) * 0.8;
        fragData.forEach(f => { f.shard.rotation.x += 0.02; f.shard.rotation.y += 0.015; });
      });
      cp.add(glow(accent, 70, 0, 26, 0));
      cp.add(glow(0x7c5cff, 40, 0, 26, 0));
    } else {
      // marketplace (default): holographic identity tower + holo column
      const tower = new THREE.Mesh(new THREE.BoxGeometry(11, 30, 11), new THREE.MeshStandardMaterial({ color: 0x120b28, emissive: accent, emissiveIntensity: 0.6, emissiveMap: WIN, roughness: 0.7, metalness: 0.5 }));
      tower.position.y = 15; cp.add(tower);
      const holo = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 16, 26, 1, true), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.22, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      holo.position.y = 36; cp.add(holo); spin.push({ obj: holo, axis: 'y', sp: -0.01 });
      [7, 10].forEach((r, i) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.16, 8, 60), new THREE.MeshBasicMaterial({ color: i ? 0xffffff : accent, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
        ring.rotation.x = Math.PI / 2; ring.position.y = 30 + i * 6; cp.add(ring); spin.push({ obj: ring, axis: 'z', sp: 0.006 * (i + 1) });
      });
      cp.add(glow(accent, 70, 0, 34, 0));
    }
  }

  window.NexusDistrict = { mount };
})();
