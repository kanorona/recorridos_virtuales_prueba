(function () {
  // =========================
  //  Configuración
  // =========================
  const CATEGORIES = [
    { id: 'school',      label: 'Escuelas/Colegios', tags: [{k:'amenity',v:'school'}] },
    { id: 'university',  label: 'Universidades',     tags: [{k:'amenity',v:'university'}] },
    { id: 'park',        label: 'Parques',           tags: [{k:'leisure',v:'park'}] },
    { id: 'mall',        label: 'Centros comerciales', tags: [{k:'shop',v:'mall'}] },
    { id: 'hospital',    label: 'Hospitales',        tags: [{k:'amenity',v:'hospital'}] },
    { id: 'clinic',      label: 'Clínicas',          tags: [{k:'amenity',v:'clinic'}] },
    { id: 'pharmacy',    label: 'Farmacias',         tags: [{k:'amenity',v:'pharmacy'}] },
    { id: 'supermarket', label: 'Super/Tiendas',     tags: [{k:'shop',v:'supermarket'}, {k:'shop',v:'convenience'}] },
    { id: 'bus_stop', label: 'Paradas de bus', tags: [{k:'highway',v:'bus_stop'}] },

  ];

  const COLORS = {
    school:'#f7fa60ff',
    university:'#60a5fa',
    park:'#4ade80',
    mall:'#f472b6',
    hospital:'#f87171',
    clinic:'#fb923c',
    pharmacy:'#a78bfa',
    supermarket:'#34d399',
    bus_stop:'#004242ff'

  };

  // =========================
  //  Estado inicial (fijo en código)
  // =========================
  const center = { lat: -0.29858, lng: -78.46758 }; // <-- Cambia aquí a la nueva casa
  const homeLabel = "Casa en Conjunto Samara";      // <-- Cambia el nombre visible
  let radius = 1500; // radio inicial en metros

  // Categorías activas por defecto: todas
  let activeCats = CATEGORIES.map(c => c.id);

  // =========================
  //  Utilidades
  // =========================
  function toNum(v, def) {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function featureToLatLng(feat) {
    if (feat.type === 'node') return [feat.lat, feat.lon];
    if (feat.type === 'way' || feat.type === 'relation') {
      const c = feat.center;
      if (c) return [c.lat, c.lon];
    }
    return null;
  }

  function getName(tags) {
    if (!tags) return 'Sin nombre';
    return tags.name || tags['name:es'] || tags.brand || 'Sin nombre';
  }

  function guessCategory(tags) {
    for (const c of CATEGORIES) {
      for (const t of c.tags) {
        if (tags && tags[t.k] === t.v) return c.id;
      }
    }
    return 'otro';
  }

  function categoryLabel(id) {
    const c = CATEGORIES.find(x => x.id === id);
    return c ? c.label : 'Otro';
  }

  function iconFor(catId) {
    const color = COLORS[catId] || '#f59e0b';
    const svg = encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='30' height='42' viewBox='0 0 30 42'>
        <path d='M15 0C6.715 0 0 6.715 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.715 23.285 0 15 0z' fill='${color}'/>
        <circle cx='15' cy='15' r='6' fill='#0b1220'/>
      </svg>`
    );
    return L.icon({
      iconUrl: `data:image/svg+xml,${svg}`,
      iconSize: [24, 34],
      iconAnchor: [12, 34],
      popupAnchor: [0, -28]
    });
  }

  // Icono especial para resaltar temporalmente
  function iconForHighlighted(catId) {
    const color = COLORS[catId] || '#f59e0b';
    const svg = encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='36' height='50' viewBox='0 0 30 42'>
        <path d='M15 0C6.715 0 0 6.715 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.715 23.285 0 15 0z' fill='${color}' stroke='#ffffff' stroke-width='2'/>
        <circle cx='15' cy='15' r='6' fill='#0b1220'/>
      </svg>`
    );
    return L.icon({
      iconUrl: `data:image/svg+xml,${svg}`,
      iconSize: [30, 42],
      iconAnchor: [15, 42],
      popupAnchor: [0, -32]
    });
  }

  function homeIcon() {
    const svg = encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="#facc15" stroke="#000" stroke-width="1.5">
        <path d="M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z"/>
      </svg>
    `);
    return L.icon({
      iconUrl: `data:image/svg+xml,${svg}`,
      iconSize: [36, 36],
      iconAnchor: [18, 36],  // punta inferior como ancla
      popupAnchor: [0, -28]
    });
  }

  function highlightMarker(mk, catId) {
    if (!mk) return;
    const originalIcon = mk.options.icon;
    mk.setZIndexOffset(1000);
    mk.setIcon(iconForHighlighted(catId));
    mk.openPopup();
    map.flyTo(mk.getLatLng(), Math.max(map.getZoom(), 17), { duration: 0.4 });

    setTimeout(() => {
      mk.setIcon(originalIcon);
      mk.setZIndexOffset(0);
    }, 1200);
  }

  function normalizeName(s) {
    if (!s) return '';
    return s
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ')
      .trim();
  }

  function buildOverpassQuery(lat, lng, radius, activeCatIds) {
    const parts = [];
    activeCatIds.forEach(id => {
      const cat = CATEGORIES.find(c => c.id === id);
      if (!cat) return;
      cat.tags.forEach(tag => {
        const filter = `[${tag.k}="${tag.v}"]`;
        parts.push(`node${filter}(around:${radius},${lat},${lng});`);
        parts.push(`way${filter}(around:${radius},${lat},${lng});`);
        parts.push(`relation${filter}(around:${radius},${lat},${lng});`);
      });
    });
    const body = parts.join('\n');
    return `[out:json][timeout:25];
(
${body}
);
out center;`;
  }

  // =========================
  //  Referencias de UI
  // =========================
  const latLbl = document.getElementById("latLbl");
  const lngLbl = document.getElementById("lngLbl");
  const radiusLbl = document.getElementById("radiusLbl");
  const radiusInput = document.getElementById("radius");
  const btnSearch = document.getElementById("search");
  const listDiv = document.getElementById("list");
  const toggleArea = document.getElementById("toggleArea");

  // Vincular checkboxes con estado
  const catCheckboxes = document.querySelectorAll('.categories input[type="checkbox"]');
  if (catCheckboxes.length) {
    catCheckboxes.forEach(cb => cb.checked = true);
    catCheckboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        // solo actualizar categorías activas, NO buscar aún
        activeCats = Array.from(catCheckboxes)
          .filter(x => x.checked)
          .map(x => x.value);
      });
    });
  }



  // Pinta header e input
  function syncHeader(ll, r) {
    latLbl.textContent = ll.lat.toFixed(5);
    lngLbl.textContent = ll.lng.toFixed(5);
    radiusLbl.textContent = `${r}`;
    if (radiusInput) radiusInput.value = r;
  }
  syncHeader(center, radius);

  // =========================
  //  Mapa Leaflet
  // =========================
  const mapHost = document.getElementById("map");
  const mapDiv = document.createElement("div");
  mapDiv.style.position = "absolute";
  mapDiv.style.inset = "0";
  mapHost.appendChild(mapDiv);

  const map = L.map(mapDiv, { zoomControl: true }).setView([center.lat, center.lng], 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  // marcador fijo de la casa
  const homeMarker = L.marker([center.lat, center.lng], { draggable: false, icon: homeIcon() })
    .addTo(map)
    .bindPopup(homeLabel)
    .openPopup();


  const resultsLayer = L.layerGroup().addTo(map);
  let searchCircle = null;

  // =========================
  //  Render de lista (con resumen)
  // =========================
  function renderList(items) {
    if (!items.length) {
      listDiv.innerHTML = `<div class="item"><em>0 resultados.</em></div>`;
      return;
    }

    // Conteo por categoría
    const counts = items.reduce((acc, it) => {
      acc[it.catId] = (acc[it.catId] || 0) + 1;
      return acc;
    }, {});
    const summary = CATEGORIES
      .map(c => counts[c.id] ? `${c.label}: ${counts[c.id]}` : null)
      .filter(Boolean)
      .join(' · ');

    listDiv.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'item summary';
    header.innerHTML = `<strong>${items.length} resultados</strong><div class="meta">${summary}</div>`;
    listDiv.appendChild(header);

    items.forEach(it => {
      const row = document.createElement('div');
      row.className = 'item';

      const left = document.createElement('div');
      const right = document.createElement('div');
      right.className = 'actions';

      left.innerHTML = `<h3>${it.name}</h3><div class="meta">${categoryLabel(it.catId)} · ${(it.dist/1000).toFixed(2)} km</div>`;
      right.innerHTML = `
        <a href="https://www.openstreetmap.org/?mlat=${it.lat}&mlon=${it.lng}#map=18/${it.lat}/${it.lng}" target="_blank">OSM</a>
        &nbsp;·&nbsp;
        <a href="https://maps.google.com/?q=${it.lat},${it.lng}" target="_blank">Maps</a>
      `;

      row.appendChild(left);
      row.appendChild(right);

      row.addEventListener('click', () => {
        // resalta fila activa
        document.querySelectorAll('#list .item').forEach(n => n.classList.remove('active'));
        row.classList.add('active');
        // destaca el marker
        highlightMarker(it.marker, it.catId);
      });

      listDiv.appendChild(row);
    });
  }

  // =========================
  //  Búsqueda en Overpass
  // =========================
  async function search() {
    const ll = L.latLng(center.lat, center.lng); // centro fijo
    const r = toNum(radiusInput?.value, radius);
    radius = r;

    syncHeader(ll, r);
    resultsLayer.clearLayers();
    listDiv.innerHTML = `<div class="item"><span>Buscando…</span></div>`;

    // círculo del área
    if (searchCircle) map.removeLayer(searchCircle);
    searchCircle = L.circle(ll, {
      radius: r,
      color: "#16a34a",
      weight: 2,
      fillColor: "#22c55e",
      fillOpacity: 0.10
    }).addTo(map);

    // respeta el toggle del área + auto-zoom si está visible
    if (toggleArea && !toggleArea.checked) {
      map.removeLayer(searchCircle);
    } else {
      const bounds = searchCircle.getBounds();
      map.fitBounds(bounds, { padding: [20, 20] });
    }

    try {
      const query = buildOverpassQuery(ll.lat, ll.lng, r, activeCats);
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {'Content-Type':'application/x-www-form-urlencoded'},
        body: new URLSearchParams({ data: query })
      });

      const json = await res.json();
      const elements = json.elements || [];

      // estructuras de dedupe
      const seenIds = new Set();
      const seenByName = new Map();
      const NEAR_EPS_METERS = 30;

      const perCatCounts = new Map();
      const items = [];

      for (const el of elements) {
        // dedupe por ID
        if (seenIds.has(el.id)) continue;
        seenIds.add(el.id);

        const pos = featureToLatLng(el);
        if (!pos) continue;
        const [y, x] = pos;

        const name = getName(el.tags || {});
        const norm = normalizeName(name);

        // dedupe por nombre cercano
        if (norm) {
          const arr = seenByName.get(norm) || [];
          const near = arr.some(p => haversine(p.lat, p.lng, y, x) < NEAR_EPS_METERS);
          if (near) continue;
          arr.push({ lat: y, lng: x });
          seenByName.set(norm, arr);
        }

        const dist = haversine(ll.lat, ll.lng, y, x);
        const catId = guessCategory(el.tags || {});
        if (!activeCats.includes(catId)) continue;

        // límite por categoría
        const c = perCatCounts.get(catId) || 0;
        if (c >= 20) continue;
        perCatCounts.set(catId, c + 1);

        const mk = L.marker([y, x], { icon: iconFor(catId) })
          .bindPopup(`<b>${name}</b><br>${categoryLabel(catId)}<br>${dist.toFixed(0)} m`);
        resultsLayer.addLayer(mk);

        items.push({ name, catId, dist, lat: y, lng: x, marker: mk });
      }

      items.sort((a, b) => a.dist - b.dist);
      renderList(items);

    } catch (err) {
      console.error(err);
      listDiv.innerHTML = `<div class="item"><span>Error consultando Overpass. Intenta nuevamente.</span></div>`;
    }
  }

  // =========================
  //  Eventos UI
  // =========================
  if (btnSearch) {
    btnSearch.disabled = false;
    btnSearch.style.cursor = "pointer";
    btnSearch.style.opacity = "1";
    btnSearch.addEventListener("click", search);
  }

  // toggle del área sin relanzar búsqueda
  toggleArea?.addEventListener('change', () => {
    if (!searchCircle) return;
    if (toggleArea.checked) {
      searchCircle.addTo(map);
      const bounds = searchCircle.getBounds();
      map.fitBounds(bounds, { padding: [20, 20] });
    } else {
      map.removeLayer(searchCircle);
    }
  });

})();
