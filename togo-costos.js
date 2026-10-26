/* TOGO · Costos y precios de los elaborados (versión del dueño).
   Este archivo es PÚBLICO y no tiene ningún costo ni precio: los datos vienen del repo privado
   (togo_maestro.json + compras_mp.json) a través del "store" que le pasa la página.
   store = { doc, compras:[...], comprasAl:'fecha', cargas:[...], usuario:'Banchi', save(doc,msg)->Promise, esRaro(carga)->bool }
*/
(function (W) {
  'use strict';
  var TABS = [['ins', 'Insumos'], ['rec', 'Recetas'], ['pre', 'Precios'], ['lis', 'Lista vigente']];
  var CANAL = { min: 'Minorista', may: 'Mayorista fraccionado', pieza: 'Pieza por mayor' };
  var CANAL_C = { min: 'Minorista', may: 'Mayorista', pieza: 'Pieza' };
  var TIPOS_INS = ['Fiambre', 'Queso', 'Panificado', 'Ingrediente', 'Envase', 'Provisorio'];
  var TIPOS_REC = ['Al vacío', 'Queso en film', 'Pizzita', 'Alfajor', 'Picada', 'Ensalada', 'Otro'];
  var PREF = { Fiambre: 'MP-F', Queso: 'MP-Q', Panificado: 'MP-P', Ingrediente: 'ING-', Envase: 'ENV-', Provisorio: 'PRV-' };

  // ---------- utilidades ----------
  function $(s, r) { return (r || document).querySelector(s); }
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function money(v, d) { if (v == null || !isFinite(v)) return '—'; return '$' + Number(v).toLocaleString('es-AR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function m2(v) { return money(v, 2); }
  function pct(v, d) { if (v == null || !isFinite(v)) return '—'; return (v * 100).toLocaleString('es-AR', { maximumFractionDigits: d == null ? 1 : d }) + '%'; }
  function num(s) { if (typeof s === 'number') return s; s = String(s || '').trim().replace(/\$/g, '').replace(/\s/g, ''); if (!s) return null; if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.'); var n = parseFloat(s); return isFinite(n) ? n : null; }
  function hoy() { var d = new Date(Date.now() - 3 * 3600e3); return d.toISOString().slice(0, 10); }
  function ahora() { var d = new Date(Date.now() - 3 * 3600e3); return d.toISOString().slice(0, 16).replace('T', ' '); }
  function fdate(s) { if (!s) return '—'; var p = String(s).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0].slice(2) : s; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function cant(v, u) { if (v == null) return '—'; if (u === 'kg' && v < 1) return (v * 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' g'; return Number(v).toLocaleString('es-AR', { maximumFractionDigits: 3 }) + ' ' + (u || ''); }

  // ---------- motor de costo ----------
  function Motor(store) {
    var D = store.doc, C = D.constantes;
    var byIns = {}; D.insumos.forEach(function (i) { byIns[i.id] = i; });
    var comprasPor = {};
    (store.compras || []).forEach(function (c) { (comprasPor[c.codigo] = comprasPor[c.codigo] || []).push(c); });
    Object.keys(comprasPor).forEach(function (k) { comprasPor[k].sort(function (a, b) { return (b.fechaFactura || '').localeCompare(a.fechaFactura || '') || (b.fechaCarga || '').localeCompare(a.fechaCarga || ''); }); });

    function compras(ins) { return ins && ins.codigoMP ? (comprasPor[ins.codigoMP] || []) : []; }
    // Precio vigente: el más nuevo entre la última factura y el precio a mano.
    function precio(ins) {
      if (!ins) return null;
      var a = 1 + (ins.alic == null ? 0.21 : ins.alic);
      var f = compras(ins)[0], m = ins.manual;
      if (f && (!m || !m.fecha || (f.fechaFactura || '') >= m.fecha)) {
        var conF = f.pagadoFinal + (f.percepciones || 0) / (f.cantidad || 1);
        return { con: conF, sin: conF / a, fuente: 'factura', fecha: f.fechaFactura, prov: f.proveedor, comp: f.comprobante };
      }
      if (m && m.conIva != null) return { con: m.conIva, sin: m.conIva / a, fuente: 'mano', fecha: m.fecha, nota: m.nota };
      return null;
    }
    function cargasDe(r) {
      if (!r.appKey) return [];
      return (store.cargas || []).filter(function (e) { return e.producto === r.appKey && (!r.appTipo || e.tipo === r.appTipo); })
        .sort(function (a, b) { return String(b.fecha || '').localeCompare(String(a.fecha || '')) || (b.creado || 0) - (a.creado || 0); });
    }
    // Merma y minutos: promedio de las últimas N cargas sin "Dato raro"; si hay menos de MIN_CARGAS, la referencia.
    function mt(r, soloRef) {
      var todas = soloRef ? [] : cargasDe(r), raro = store.esRaro || function () { return false; };
      var ult = todas.slice(0, C.CARGAS + 6), usadas = [], marcadas = [];
      ult.forEach(function (e) { if (usadas.length >= C.CARGAS) return; if (raro(e)) marcadas.push(e); else usadas.push(e); });
      var out = { merma: r.ref.merma || 0, minutos: r.ref.minutos || 0, fuente: 'ref', n: usadas.length, usadas: usadas, raras: marcadas };
      if (usadas.length >= C.MIN_CARGAS) {
        var sm = 0, sn = 0, smi = 0, sni = 0;
        usadas.forEach(function (e) {
          if (r.appTipo === 'pizzita') { var u = e.unidades - (e.descarte || 0); if (u > 0) { smi += e.minutos / u; sni++; } }
          else {
            var kf = e.kgFracc != null ? e.kgFracc : (e.kgPieza - (e.merma || 0));
            if (e.kgPieza > 0) { sm += (e.merma || (e.kgPieza - kf)) / e.kgPieza * 100; sn++; }
            if (kf > 0) { smi += e.minutos / kf; sni++; }
          }
        });
        if (r.appTipo !== 'pizzita' && sn) out.merma = sm / sn;
        if (sni) out.minutos = smi / sni;
        out.fuente = 'cargas';
      }
      return out;
    }
    function costo(r, soloRef) {
      var t = mt(r, soloRef), m = Math.min(Math.max(t.merma || 0, 0), 95) / 100, sinI = 0, conI = 0, lin = [], falta = [];
      r.lineas.forEach(function (l) {
        var ins = byIns[l.ins], p = precio(ins), q = l.cant * (l.merma ? 1 / (1 - m) : 1);
        if (!p) falta.push(ins ? ins.nombre : l.ins);
        var s = p ? p.sin * q : 0, c = p ? p.con * q : 0;
        sinI += s; conI += c; lin.push({ l: l, ins: ins, p: p, q: q, sin: s, con: c });
      });
      var mo = t.minutos / 60 * C.HORA, am = r.amort || 0;
      var base = r.base ? precio(byIns[r.base]) : null;
      return { mt: t, lin: lin, insSin: sinI, insCon: conI, mo: mo, amort: am, sin: sinI + mo + am, con: conI + mo + am, falta: falta, baseSin: base ? base.sin : null };
    }
    function costoCanal(r, k, c) { c = c || costo(r); return k.canal === 'pieza' ? c.baseSin : c.sin; }
    function redondeo(r) { return (C.REDONDEO || {})[r.rinde] || 10; }
    function sugerido(r, k, c) { var cs = costoCanal(r, k, c); if (cs == null) return null; var red = redondeo(r); return Math.ceil(cs * (k.markup || 1) * 1.21 / red) * red; }
    return { D: D, byIns: byIns, precio: precio, compras: compras, costo: costo, costoCanal: costoCanal, sugerido: sugerido, mt: mt, cargasDe: cargasDe };
  }

  // ---------- estilos ----------
  var CSS = '\
:root{--tc-bg:#f6f5f1;--tc-card:#fff;--tc-ink:#1d1c1a;--tc-mut:#6d6a63;--tc-line:#e4e1d8;--tc-acc:#b40000;--tc-acc2:#7a0d0d;--tc-ok:#1f7a3f;--tc-warn:#a65d00;--tc-soft:#f1efe8;--tc-c1:#fff8d9;--tc-c2:#ffefd9;--tc-c3:#fbe7e6}\
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--tc-bg:#16150f;--tc-card:#211f19;--tc-ink:#efece4;--tc-mut:#a7a296;--tc-line:#38352c;--tc-acc:#ff5a4e;--tc-acc2:#ff8a7f;--tc-ok:#5fcf8a;--tc-warn:#f0a63c;--tc-soft:#2a2820;--tc-c1:#2b2914;--tc-c2:#2f2414;--tc-c3:#2f1d1c;color-scheme:dark}}\
:root[data-theme="dark"]{--tc-bg:#16150f;--tc-card:#211f19;--tc-ink:#efece4;--tc-mut:#a7a296;--tc-line:#38352c;--tc-acc:#ff5a4e;--tc-acc2:#ff8a7f;--tc-ok:#5fcf8a;--tc-warn:#f0a63c;--tc-soft:#2a2820;--tc-c1:#2b2914;--tc-c2:#2f2414;--tc-c3:#2f1d1c;color-scheme:dark}\
.tc{font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--tc-ink);background:var(--tc-bg);max-width:980px;margin:0 auto;padding-block:0 60px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}\
.tc *{box-sizing:border-box}.tc h2{font-size:18px;margin:18px 0 8px}.tc h3{font-size:15px;margin:14px 0 6px}\
.tc-tabs{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;display:flex;gap:4px;background:var(--tc-bg);padding:10px 0 8px;overflow-x:auto}\
.tc-tabs button{flex:1 0 auto;border:1px solid var(--tc-line);background:var(--tc-card);color:var(--tc-ink);border-radius:999px;padding:9px 14px;font:600 14px/1 inherit;cursor:pointer}\
.tc-tabs button.on{background:var(--tc-acc);border-color:var(--tc-acc);color:#fff}\
.tc-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0 10px}.tc-bar .sp{flex:1}\
.tc input,.tc select,.tc textarea{font:inherit;color:var(--tc-ink);background:var(--tc-card);border:1px solid var(--tc-line);border-radius:10px;padding:9px 10px;min-width:0}\
.tc input[type=search]{flex:1 1 180px}\
.tc .b{border:1px solid var(--tc-line);background:var(--tc-card);color:var(--tc-ink);border-radius:10px;padding:9px 12px;font:600 14px/1.1 inherit;cursor:pointer}\
.tc .b.p{background:var(--tc-acc);border-color:var(--tc-acc);color:#fff}.tc .b.s{padding:5px 9px;font-size:13px}.tc .b.g{background:transparent}\
.tc .card{background:var(--tc-card);border:1px solid var(--tc-line);border-radius:14px;padding:12px;margin:8px 0}\
.tc .row{display:flex;gap:10px;align-items:flex-start}.tc .row .grow{flex:1;min-width:0}\
.tc .t{font-weight:650}.tc .mut{color:var(--tc-mut);font-size:13px}.tc .r{text-align:right}.tc .big{font-size:17px;font-weight:700}\
.tc .tag{display:inline-block;font-size:11.5px;font-weight:650;padding:2px 7px;border-radius:999px;background:var(--tc-soft);color:var(--tc-mut);margin:2px 4px 0 0;white-space:nowrap}\
.tc .tag.ok{color:var(--tc-ok)}.tc .tag.w{color:var(--tc-warn)}.tc .tag.a{color:var(--tc-acc)}\
.tc .grp{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--tc-mut);margin:16px 0 4px}\
.tc table{width:100%;border-collapse:collapse;font-size:14px}.tc th{font-size:12px;color:var(--tc-mut);font-weight:650;text-align:left;padding:6px 6px;border-bottom:1px solid var(--tc-line)}\
.tc td{padding:7px 6px;border-bottom:1px solid var(--tc-line);vertical-align:top}.tc td.r,.tc th.r{text-align:right;white-space:nowrap}\
.tc .cod{font:700 15px/1.1 ui-monospace,Menlo,Consolas,monospace}\
.tc .pend{border:2px solid var(--tc-acc);}\
.tc .note{background:var(--tc-soft);border-radius:10px;padding:9px 11px;font-size:13px;color:var(--tc-mut);margin:8px 0}\
.tc .sheet{position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center}\
.tc .sheet>div{background:var(--tc-bg);width:100%;max-width:720px;max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;padding:14px 14px 24px}\
@media (min-width:760px){.tc .sheet{align-items:center}.tc .sheet>div{border-radius:18px}}\
.tc .f{display:flex;flex-direction:column;gap:3px;margin:8px 0}.tc .f label{font-size:12.5px;font-weight:650;color:var(--tc-mut)}\
.tc .f2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tc .f3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}\
.tc .ln{display:grid;grid-template-columns:1fr 86px auto auto;gap:6px;align-items:center;margin:5px 0}\
.tc .chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 6px}.tc .chips .b.on{background:var(--tc-ink);border-color:var(--tc-ink);color:var(--tc-bg)}\
.tc details.lv{background:var(--tc-card);border:1px solid var(--tc-line);border-radius:14px;margin:10px 0;overflow:hidden}\
.tc details.lv>summary{display:flex;gap:10px;align-items:baseline;padding:12px 14px;cursor:pointer;list-style:none}\
.tc details.lv>summary::-webkit-details-marker{display:none}\
.tc details.lv>summary::before{content:"▸";color:var(--tc-mut);transition:transform .15s}.tc details.lv[open]>summary::before{transform:rotate(90deg)}\
.tc .lv-t{font-weight:750;font-size:16px}\
.tc .lv-grid{border-top:1px solid var(--tc-line)}\
.tc .lv-row{display:grid;grid-template-columns:minmax(150px,1.3fr) repeat(var(--n),minmax(0,1fr));border-bottom:1px solid var(--tc-line)}\
.tc .lv-row:last-child{border-bottom:none}\
.tc .lv-name{padding:10px 12px;min-width:0}\
.tc .lv-cell{padding:9px 10px;border-left:1px solid var(--tc-line);min-width:0;cursor:pointer;font-variant-numeric:tabular-nums}\
.tc .lv-cell.vacio{cursor:default}\
.tc .lv-cell:hover:not(.vacio),.tc .lv-cell:focus-visible{outline:2px solid var(--tc-acc);outline-offset:-2px}\
.tc .lv-min{background:var(--tc-c1)}.tc .lv-may{background:var(--tc-c2)}.tc .lv-pieza{background:var(--tc-c3)}\
.tc .lv-head .lv-cell{cursor:default}.tc .lv-head .lv-name{font-size:12px;color:var(--tc-mut);font-weight:650;align-self:end}\
.tc .lv-lab{font-size:12px;font-weight:750;letter-spacing:.04em;text-transform:uppercase}.tc .lv-sub{font-size:11px;color:var(--tc-mut)}\
.tc .lv-ph{display:none}\
.tc .lv-pre{font-size:17px;font-weight:750;margin-top:2px}.tc .lv-cos{font-size:12.5px;color:var(--tc-mut)}\
@media (max-width:620px){.tc .lv-row{grid-template-columns:repeat(var(--n),minmax(0,1fr))}.tc .lv-name{grid-column:1/-1;padding-bottom:4px}\
.tc .lv-head{display:none}.tc .lv-ph{display:block;font-size:10.5px}.tc .lv-cell{border-left:none;border-right:1px solid var(--tc-line);padding:7px 8px}.tc .lv-cell:last-child{border-right:none}.tc .lv-pre{font-size:15px}.tc .lv-cos{font-size:11.5px}}\
.tc .toast{position:fixed;left:0;right:0;bottom:0;z-index:60;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px));padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));pointer-events:none}.tc .toast .msg{max-width:560px;margin:0 auto;box-shadow:0 4px 18px rgba(0,0,0,.18);background:var(--tc-card);border:1px solid var(--tc-line)}\
.tc .toast .msg.ok,.tc .toast .msg.er{background:var(--tc-card)}\
.tc .msg{padding:9px 11px;border-radius:10px;margin:8px 0;font-size:14px}.tc .msg.ok{background:rgba(31,122,63,.12);color:var(--tc-ok)}.tc .msg.er{background:rgba(180,0,0,.1);color:var(--tc-acc)}\
.tc .kv{display:grid;grid-template-columns:1fr auto;gap:2px 10px;font-size:14px}.tc .kv .tot{font-weight:750;border-top:1px solid var(--tc-line);padding-top:4px}\
.tc .pencil{border:none;background:none;color:var(--tc-acc);cursor:pointer;font-size:14px;padding:0 4px}\
.tc .diff-up{color:var(--tc-acc);font-weight:700}.tc .diff-dn{color:var(--tc-ok);font-weight:700}\
@media (max-width:620px){.tc .hide-s{display:none}.tc table{font-size:13px}.tc td,.tc th{padding:6px 4px}}\
@media print{body *{visibility:hidden}.tc-print,.tc-print *{visibility:visible}.tc-print{position:absolute;left:0;top:0;width:100%;color:#000;background:#fff;font:11pt/1.3 Arial,sans-serif}\
.tc-print table{width:100%;border-collapse:collapse}.tc-print th,.tc-print td{border-bottom:1px solid #bbb;padding:4px 6px;text-align:left}.tc-print .r{text-align:right}.tc-print h1{font-size:16pt;margin:0 0 4px}}';

  // ---------- app ----------
  function mount(root, store) {
    if (!document.getElementById('tc-css')) { var st = el('style'); st.id = 'tc-css'; st.textContent = CSS; document.head.appendChild(st); }
    root.innerHTML = ''; root.classList.add('tc');
    var M = Motor(store), tab = 'lis', q = '', verPausados = false;
    try { tab = localStorage.getItem('tc-tab') || 'lis'; } catch (e) {}
    var tabs = el('div', 'tc-tabs'), body = el('div'), toast = el('div', 'toast');
    TABS.forEach(function (t) { var b = el('button', null, t[1]); b.type = 'button'; b.dataset.t = t[0]; b.onclick = function () { tab = t[0]; try { localStorage.setItem('tc-tab', tab); } catch (e) {} render(); }; tabs.appendChild(b); });
    root.appendChild(tabs); root.appendChild(toast); root.appendChild(body);

    function D() { return store.doc; }
    function refresh() { M = Motor(store); render(); }
    function aviso(t, ok) { toast.innerHTML = ''; var m = el('div', 'msg ' + (ok === false ? 'er' : 'ok'), t); toast.appendChild(m); setTimeout(function () { if (m.parentNode) m.remove(); }, 4500); }
    function guardar(nuevo, msg) {
      nuevo.actualizado = ahora();
      return Promise.resolve(store.save(nuevo, msg)).then(function () { store.doc = nuevo; refresh(); aviso('Guardado: ' + msg); return true; },
        function (e) { aviso('No se guardó: ' + (e && e.message || e), false); return false; });
    }
    function sheet(titulo, build) {
      var s = el('div', 'sheet'), c = el('div'); s.appendChild(c);
      var h = el('div', 'row'); var t = el('h2', 'grow', titulo); t.style.margin = '2px 0 6px'; h.appendChild(t);
      var x = el('button', 'b g', '✕'); x.type = 'button'; x.onclick = close; h.appendChild(x); c.appendChild(h);
      function close() { s.remove(); }
      s.addEventListener('click', function (e) { if (e.target === s) close(); });
      build(c, close); root.appendChild(s); return close;
    }
    function field(p, lab, inp) { var f = el('div', 'f'); f.appendChild(el('label', null, lab)); f.appendChild(inp); p.appendChild(f); return inp; }
    function input(v, ph, mode) { var i = el('input'); i.value = v == null ? '' : v; if (ph) i.placeholder = ph; if (mode) { i.inputMode = mode; } return i; }
    function select(opts, v) { var s = el('select'); opts.forEach(function (o) { var par = Array.isArray(o), op = el('option', null, par ? o[1] : o); op.value = par ? o[0] : o; s.appendChild(op); }); s.value = v; return s; }
    function bar(p) { var b = el('div', 'tc-bar'); p.appendChild(b); return b; }
    function btn(txt, cls, fn) { var b = el('button', 'b ' + (cls || ''), txt); b.type = 'button'; b.onclick = fn; return b; }
    function buscador(b, ph) { var s = el('input'); s.type = 'search'; s.placeholder = ph; s.value = q; s.oninput = function () { q = s.value; var pos = s.selectionStart; render(); var n = $('input[type=search]', body); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }; b.appendChild(s); }
    function match(t) { return !q || String(t).toLowerCase().indexOf(q.toLowerCase()) >= 0; }

    function render() {
      [].forEach.call(tabs.children, function (b) { b.classList.toggle('on', b.dataset.t === tab); });
      body.innerHTML = '';
      ({ ins: vInsumos, rec: vRecetas, pre: vPrecios, lis: vLista })[tab]();
    }

    // ===== PESTAÑA 1 · INSUMOS =====
    function vInsumos() {
      var b = bar(body); buscador(b, 'Buscar insumo');
      b.appendChild(btn(verPausados ? 'Ocultar pausados' : 'Ver pausados', 'g s', function () { verPausados = !verPausados; render(); }));
      b.appendChild(btn('+ Nuevo insumo', 'p', function () { editInsumo(null); }));
      body.appendChild(el('div', 'note', 'Precio automático: la última factura de COSTOS_MATERIA_PRIMA_TOGO (copia al ' + (store.comprasAl || '—') + '). Lo que no entra por factura queda "a mano" hasta que llegue una. Sin IVA = con IVA ÷ (1 + alícuota).'));
      TIPOS_INS.forEach(function (tp) {
        var L = D().insumos.filter(function (i) { return i.tipo === tp && (verPausados || i.activo !== false) && match(i.nombre + ' ' + (i.codigoMP || '') + ' ' + i.id); });
        if (!L.length) return;
        body.appendChild(el('div', 'grp', tp + (tp === 'Provisorio' ? ' (totales a reemplazar por receta)' : '')));
        L.forEach(function (i) {
          var p = M.precio(i), c = el('div', 'card'), r = el('div', 'row'); c.appendChild(r);
          var g = el('div', 'grow'); r.appendChild(g);
          g.appendChild(el('div', 't', i.nombre));
          var tg = el('div'); g.appendChild(tg);
          tg.appendChild(el('span', 'tag', i.codigoMP || i.id));
          tg.appendChild(el('span', 'tag', 'IVA ' + pct(i.alic, 1)));
          if (p) tg.appendChild(el('span', 'tag ' + (p.fuente === 'factura' ? 'ok' : 'w'), p.fuente === 'factura' ? 'Factura ' + fdate(p.fecha) + ' · ' + (p.prov || '') : 'A mano · ' + fdate(p.fecha)));
          if (i.activo === false) tg.appendChild(el('span', 'tag a', 'Pausado'));
          var hist = M.compras(i).slice(0, 3);
          if (hist.length) {
            var h = el('div', 'mut'); h.style.marginTop = '5px';
            h.textContent = 'Últimas compras: ' + hist.map(function (x, k) {
              var prev = hist[k + 1], d = prev ? (x.pagadoFinal / prev.pagadoFinal - 1) : null;
              return fdate(x.fechaFactura) + ' ' + money(x.pagadoFinal) + (d != null ? ' (' + (d >= 0 ? '+' : '') + pct(d, 0) + ')' : '');
            }).join(' · ');
            g.appendChild(h);
          }
          var pr = el('div', 'r'); r.appendChild(pr);
          pr.appendChild(el('div', 'big', p ? m2(p.sin) : 'Sin precio'));
          pr.appendChild(el('div', 'mut', p ? 'sin IVA / ' + i.unidad : ''));
          pr.appendChild(el('div', 'mut', p ? m2(p.con) + ' con IVA' : ''));
          c.style.cursor = 'pointer'; c.onclick = function () { editInsumo(i); };
          body.appendChild(c);
        });
      });
    }
    function editInsumo(i0) {
      var nuevo = !i0, i = i0 ? clone(i0) : { id: '', nombre: '', tipo: 'Ingrediente', unidad: 'kg', alic: 0.21, codigoMP: null, manual: { conIva: null, fecha: hoy(), nota: '' }, activo: true };
      sheet(nuevo ? 'Nuevo insumo' : i.nombre, function (c, close) {
        var nom = field(c, 'Nombre', input(i.nombre));
        var g = el('div', 'f3'); c.appendChild(g);
        var tp = field(g, 'Tipo', select(TIPOS_INS, i.tipo));
        var un = field(g, 'Unidad', select([['kg', 'kg'], ['u', 'unidad']], i.unidad));
        var al = field(g, 'Alícuota IVA', select([['0.21', '21%'], ['0.105', '10,5%'], ['0', 'Sin IVA']], String(i.alic)));
        var cod = field(c, 'Código de materia prima (de COSTOS_MATERIA_PRIMA_TOGO, si tiene)', input(i.codigoMP || '', 'MP-F01'));
        var p = M.precio(i0 || i);
        if (p && p.fuente === 'factura') c.appendChild(el('div', 'note', 'Precio vigente por factura: ' + m2(p.con) + ' con IVA (' + fdate(p.fecha) + ', ' + (p.prov || '') + '). Si cargás un precio a mano con fecha más nueva, pasa a valer ese hasta la próxima factura.'));
        c.appendChild(el('h3', null, 'Precio a mano'));
        var g2 = el('div', 'f2'); c.appendChild(g2);
        var a = function () { return 1 + Number(al.value); };
        var pc = field(g2, 'Con IVA', input(i.manual && i.manual.conIva != null ? i.manual.conIva.toFixed(2).replace('.', ',') : '', '0,00', 'decimal'));
        var ps = field(g2, 'Sin IVA', input(i.manual && i.manual.conIva != null ? (i.manual.conIva / a()).toFixed(2).replace('.', ',') : '', '0,00', 'decimal'));
        pc.oninput = function () { var v = num(pc.value); ps.value = v == null ? '' : (v / a()).toFixed(2).replace('.', ','); };
        ps.oninput = function () { var v = num(ps.value); pc.value = v == null ? '' : (v * a()).toFixed(2).replace('.', ','); };
        al.onchange = function () { pc.oninput(); };
        var g3 = el('div', 'f2'); c.appendChild(g3);
        var fe = field(g3, 'Fecha del precio', input(i.manual && i.manual.fecha || hoy())); fe.type = 'date';
        var no = field(g3, 'Nota', input(i.manual && i.manual.nota || '', 'presentación, proveedor…'));
        var b = bar(c);
        b.appendChild(btn('Guardar', 'p', function () {
          if (!nom.value.trim()) return aviso('Falta el nombre.', false);
          var d = clone(D()), it = nuevo ? null : d.insumos.find(function (x) { return x.id === i.id; });
          if (nuevo) {
            var pre = PREF[tp.value] || 'INS-', n = 1;
            while (d.insumos.some(function (x) { return x.id === pre + String(n).padStart(2, '0'); })) n++;
            it = { id: pre + String(n).padStart(2, '0'), activo: true }; d.insumos.push(it);
          }
          it.nombre = nom.value.trim(); it.tipo = tp.value; it.unidad = un.value; it.alic = Number(al.value); it.codigoMP = cod.value.trim() || null;
          var v = num(pc.value);
          var old = it.manual || {};
          it.manual = { conIva: v, fecha: fe.value || hoy(), nota: no.value.trim() };
          if (old.conIva != null && v != null && Math.abs(old.conIva - v) > 0.005) { d.cambios.push({ fecha: ahora(), tipo: 'insumo', id: it.id, nombre: it.nombre, anterior: old.conIva, nuevo: v, quien: store.usuario }); }
          guardar(d, (nuevo ? 'insumo nuevo ' : 'insumo ') + it.nombre).then(function (ok) { if (ok) close(); });
        }));
        if (!nuevo) b.appendChild(btn(i.activo === false ? 'Reactivar' : 'Pausar', 'g', function () {
          var d = clone(D()), it = d.insumos.find(function (x) { return x.id === i.id; }); it.activo = it.activo === false;
          guardar(d, (it.activo ? 'reactivado ' : 'pausado ') + it.nombre).then(function (ok) { if (ok) close(); });
        }));
        var usos = D().recetas.filter(function (r) { return r.lineas.some(function (l) { return l.ins === i.id; }); });
        if (usos.length) c.appendChild(el('div', 'mut', 'Lo usan: ' + usos.map(function (r) { return r.nombre; }).join(', ')));
      });
    }

    // ===== PESTAÑA 2 · RECETAS =====
    function vRecetas() {
      var b = bar(body); buscador(b, 'Buscar elaborado');
      b.appendChild(btn(verPausados ? 'Ocultar pausados' : 'Ver pausados', 'g s', function () { verPausados = !verPausados; render(); }));
      b.appendChild(btn('+ Nuevo', 'p', function () { editReceta(null); }));
      TIPOS_REC.forEach(function (tp) {
        var L = D().recetas.filter(function (r) { return (r.tipo === tp || (tp === 'Otro' && TIPOS_REC.indexOf(r.tipo) < 0)) && (verPausados || r.activo !== false) && match(r.nombre); });
        if (!L.length) return;
        body.appendChild(el('div', 'grp', tp));
        L.forEach(function (r) {
          var c0 = M.costo(r), c = el('div', 'card'), row = el('div', 'row'); c.appendChild(row);
          var g = el('div', 'grow'); row.appendChild(g);
          g.appendChild(el('div', 't', r.nombre));
          var tg = el('div'); g.appendChild(tg);
          tg.appendChild(el('span', 'tag', r.rindeDesc || ('por ' + r.rinde)));
          tg.appendChild(el('span', 'tag ' + (c0.mt.fuente === 'cargas' ? 'ok' : 'w'), c0.mt.fuente === 'cargas' ? 'Merma y tiempo: ' + c0.mt.n + ' cargas' : 'Merma y tiempo: referencia'));
          if (c0.falta.length) tg.appendChild(el('span', 'tag a', 'Sin precio: ' + c0.falta.join(', ')));
          if (r.activo === false) tg.appendChild(el('span', 'tag a', 'Pausado'));
          var pr = el('div', 'r'); row.appendChild(pr);
          pr.appendChild(el('div', 'big', m2(c0.sin)));
          pr.appendChild(el('div', 'mut', 'costo sin IVA'));
          pr.appendChild(el('div', 'mut', m2(c0.con) + ' con IVA'));
          c.style.cursor = 'pointer'; c.onclick = function () { fichaReceta(r); };
          body.appendChild(c);
        });
      });
    }
    function fichaReceta(r) {
      var c0 = M.costo(r);
      sheet(r.nombre, function (c, close) {
        c.appendChild(el('div', 'mut', r.tipo + ' · rinde: ' + (r.rindeDesc || r.rinde)));
        c.appendChild(el('h3', null, 'Insumos (por ' + (r.rinde === 'kg' ? 'kg' : r.rinde === 'pack' ? 'pack' : 'unidad') + ')'));
        var t = el('table'), th = el('tr'); ['Insumo', 'Cantidad', 'Sin IVA', 'Con IVA'].forEach(function (h, k) { th.appendChild(el('th', k ? 'r' : null, h)); }); t.appendChild(th);
        c0.lin.forEach(function (x) {
          var tr = el('tr'), td = el('td'); td.appendChild(el('div', null, x.ins ? x.ins.nombre : x.l.ins));
          var sub = x.p ? (x.p.fuente === 'factura' ? 'factura ' + fdate(x.p.fecha) : 'a mano') + ' · ' + m2(x.p.sin) + '/' + (x.ins.unidad) + ' sin IVA' : 'sin precio';
          if (x.l.merma) sub += ' · con merma';
          td.appendChild(el('div', 'mut', sub)); tr.appendChild(td);
          tr.appendChild(el('td', 'r', cant(x.q, x.ins && x.ins.unidad)));
          tr.appendChild(el('td', 'r', m2(x.sin))); tr.appendChild(el('td', 'r', m2(x.con))); t.appendChild(tr);
        });
        c.appendChild(t);
        var kv = el('div', 'kv'); kv.style.marginTop = '10px'; c.appendChild(kv);
        function k(a, b, cl) { kv.appendChild(el('div', cl, a)); kv.appendChild(el('div', 'r ' + (cl || ''), b)); }
        k('Insumos y envase (sin IVA)', m2(c0.insSin));
        k('Mano de obra: ' + c0.mt.minutos.toLocaleString('es-AR', { maximumFractionDigits: 2 }) + ' min × $' + D().constantes.HORA.toLocaleString('es-AR') + '/h (sin IVA)', m2(c0.mo));
        if (c0.amort) k('Amortización (sin IVA)', m2(c0.amort));
        k('COSTO SIN IVA', m2(c0.sin), 'tot');
        k('Costo con IVA (insumos con IVA + mano de obra + amortización)', m2(c0.con), 'mut');
        c.appendChild(el('h3', null, 'Merma y tiempo'));
        var t2 = c0.mt;
        var n = el('div', 'note');
        n.textContent = (t2.fuente === 'cargas'
          ? 'Promedio de las últimas ' + t2.n + ' cargas (sin datos raros): merma ' + t2.merma.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + '%, ' + t2.minutos.toLocaleString('es-AR', { maximumFractionDigits: 2 }) + ' min por ' + r.rinde + '.'
          : 'Referencia (hay ' + t2.n + ' cargas; hacen falta ' + D().constantes.MIN_CARGAS + '): merma ' + (r.ref.merma || 0).toLocaleString('es-AR') + '%, ' + (r.ref.minutos || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 }) + ' min por ' + r.rinde + '.') + (r.ref.nota ? ' ' + r.ref.nota + '.' : '');
        c.appendChild(n);
        if (t2.usadas.length || t2.raras.length) {
          var tl = el('table'), h2 = el('tr'); ['Fecha', 'Kg pieza', 'Merma', 'Min', ''].forEach(function (h, k2) { h2.appendChild(el('th', k2 ? 'r' : null, h)); }); tl.appendChild(h2);
          t2.usadas.concat(t2.raras).forEach(function (e) {
            var tr = el('tr'); tr.appendChild(el('td', null, fdate(e.fecha)));
            tr.appendChild(el('td', 'r', e.kgPieza != null ? e.kgPieza.toLocaleString('es-AR') : (e.unidades + ' u')));
            tr.appendChild(el('td', 'r', e.kgPieza ? pct((e.merma || 0) / e.kgPieza) : (e.descarte || 0) + ' desc.'));
            tr.appendChild(el('td', 'r', String(e.minutos))); tr.appendChild(el('td', 'r', t2.raras.indexOf(e) >= 0 ? 'Dato raro: no cuenta' : '✓')); tl.appendChild(tr);
          });
          c.appendChild(tl);
        }
        c.appendChild(el('h3', null, 'Códigos y precios'));
        var tc = el('table'), hc = el('tr'); ['Código', 'Canal', 'Costo sin IVA', 'Sugerido', 'Actual'].forEach(function (h, k2) { hc.appendChild(el('th', k2 > 1 ? 'r' : null, h)); }); tc.appendChild(hc);
        r.canales.forEach(function (kk) {
          var cs = M.costoCanal(r, kk, c0), sg = M.sugerido(r, kk, c0), tr = el('tr');
          [[kk.codigo || '—', 'cod'], [CANAL_C[kk.canal] + ' ×' + String(kk.markup).replace('.', ','), null], [m2(cs), 'r'], [money(sg), 'r'], [money(kk.actual), 'r t']].forEach(function (v) { tr.appendChild(el('td', v[1], v[0])); });
          tc.appendChild(tr);
        });
        c.appendChild(tc);
        var b = bar(c);
        b.appendChild(btn('Editar', 'p', function () { close(); editReceta(r); }));
        b.appendChild(btn('Copiar de este', '', function () { close(); var x = clone(r); x.id = null; x.nombre = r.nombre + ' (copia)'; x.canales.forEach(function (k2) { k2.codigo = ''; k2.actual = null; k2.cambio = null; }); x.appKey = null; editReceta(x, true); }));
        b.appendChild(btn(r.activo === false ? 'Reactivar' : 'Pausar', 'g', function () {
          var d = clone(D()), it = d.recetas.find(function (x) { return x.id === r.id; }); it.activo = it.activo === false;
          guardar(d, (it.activo ? 'reactivado ' : 'pausado ') + it.nombre).then(function (ok) { if (ok) close(); });
        }));
      });
    }
    function editReceta(r0, esCopia) {
      var nuevo = !r0 || esCopia;
      var r = r0 ? clone(r0) : { id: null, nombre: '', tipo: 'Otro', rinde: 'u', rindeDesc: '', appTipo: null, appKey: null, base: null, lineas: [], ref: { merma: 0, minutos: 0, nota: '' }, amort: 0, canales: [{ canal: 'min', codigo: '', markup: D().constantes.MARKUP.min, actual: null, fuenteActual: '', balanza: '', cambio: null }], activo: true };
      sheet(nuevo ? 'Nuevo elaborado' : 'Editar · ' + r.nombre, function (c, close) {
        var nom = field(c, 'Nombre', input(r.nombre));
        var g = el('div', 'f3'); c.appendChild(g);
        var tp = field(g, 'Tipo', select(TIPOS_REC, r.tipo));
        var rd = field(g, 'Se vende por', select([['kg', 'kg'], ['u', 'unidad'], ['pack', 'pack']], r.rinde));
        var rdd = field(g, 'Presentación', input(r.rindeDesc, 'pack ×6, bandeja 300 g…'));
        c.appendChild(el('h3', null, 'Insumos por ' + 'unidad de venta'));
        var box = el('div'); c.appendChild(box);
        var opts = D().insumos.filter(function (i) { return i.activo !== false; }).map(function (i) { return [i.id, i.nombre + ' (' + i.unidad + ')']; });
        function lineas() {
          box.innerHTML = '';
          r.lineas.forEach(function (l, k) {
            var w = el('div', 'ln');
            var s = select(opts, l.ins); s.onchange = function () { l.ins = s.value; };
            var qn = input(String(l.cant).replace('.', ','), 'cant.', 'decimal'); qn.oninput = function () { l.cant = num(qn.value) || 0; };
            var lb = el('label', 'mut'); var ck = el('input'); ck.type = 'checkbox'; ck.checked = !!l.merma; ck.onchange = function () { l.merma = ck.checked; }; lb.appendChild(ck); lb.appendChild(document.createTextNode(' merma'));
            var x = btn('✕', 'g s', function () { r.lineas.splice(k, 1); lineas(); });
            [s, qn, lb, x].forEach(function (z) { w.appendChild(z); }); box.appendChild(w);
          });
          var add = btn('+ Agregar insumo', 's', function () { r.lineas.push({ ins: opts[0][0], cant: 1, merma: false }); lineas(); }); box.appendChild(add);
          box.appendChild(el('div', 'mut', 'Cantidad en la unidad del insumo (kg o unidades) para 1 ' + (rd.value === 'kg' ? 'kg' : rd.value === 'pack' ? 'pack' : 'unidad') + ' vendido. "merma" = esa cantidad se agranda por la merma.'));
        }
        lineas();
        c.appendChild(el('h3', null, 'Merma, tiempo y amortización de referencia'));
        c.appendChild(el('div', 'mut', 'Se usan mientras haya menos de ' + D().constantes.MIN_CARGAS + ' cargas del elaborador; después manda el promedio de las últimas ' + D().constantes.CARGAS + '.'));
        var g2 = el('div', 'f3'); c.appendChild(g2);
        var mm = field(g2, 'Merma %', input(String(r.ref.merma || 0).replace('.', ','), '0', 'decimal'));
        var mi = field(g2, 'Minutos por unidad de venta', input(String(r.ref.minutos || 0).replace('.', ','), '0', 'decimal'));
        var am = field(g2, 'Amortización $ sin IVA', input(String(r.amort || 0).replace('.', ','), '0', 'decimal'));
        c.appendChild(el('h3', null, 'Códigos del sistema'));
        var cbox = el('div'); c.appendChild(cbox);
        function canales() {
          cbox.innerHTML = '';
          r.canales.forEach(function (k, j) {
            var w = el('div', 'f3'); w.style.alignItems = 'end';
            var cn = field(w, 'Canal', select([['min', 'Minorista'], ['may', 'Mayorista'], ['pieza', 'Pieza']], k.canal)); cn.onchange = function () { k.canal = cn.value; k.markup = D().constantes.MARKUP[cn.value]; mk.value = String(k.markup).replace('.', ','); };
            var cd = field(w, 'Código', input(k.codigo || '', '1008')); cd.oninput = function () { k.codigo = cd.value.trim(); };
            var mk = field(w, 'Markup (×)', input(String(k.markup).replace('.', ','), '1,6', 'decimal')); mk.oninput = function () { k.markup = num(mk.value) || 1; };
            var w2 = el('div', 'f3'); w2.style.alignItems = 'end';
            var bz = field(w2, 'Código de balanza', input(k.balanza || '', 'si va por kg')); bz.oninput = function () { k.balanza = bz.value.trim(); };
            var pa = field(w2, 'Precio actual con IVA', input(k.actual != null ? String(k.actual).replace('.', ',') : '', 'del sistema', 'decimal')); pa.oninput = function () { k.actual = num(pa.value); k.fuenteActual = 'a mano ' + fdate(hoy()); };
            var x = btn('Quitar canal', 'g s', function () { r.canales.splice(j, 1); canales(); }); w2.appendChild(x);
            var card = el('div', 'card'); card.appendChild(w); card.appendChild(w2); cbox.appendChild(card);
          });
          cbox.appendChild(btn('+ Agregar código', 's', function () { r.canales.push({ canal: 'may', codigo: '', markup: D().constantes.MARKUP.may, actual: null, fuenteActual: '', balanza: '', cambio: null }); canales(); }));
        }
        canales();
        if (!nuevo && r.appKey) c.appendChild(el('div', 'mut', 'Nombre en la app de empleados: ' + r.appKey));
        var b = bar(c);
        b.appendChild(btn('Guardar', 'p', function () {
          if (!nom.value.trim()) return aviso('Falta el nombre.', false);
          if (!r.lineas.length) return aviso('Cargá al menos un insumo.', false);
          var d = clone(D());
          r.nombre = nom.value.trim(); r.tipo = tp.value; r.rinde = rd.value; r.rindeDesc = rdd.value.trim();
          r.ref.merma = num(mm.value) || 0; r.ref.minutos = num(mi.value) || 0; r.amort = num(am.value) || 0;
          if (nuevo) {
            var n = 1; while (d.recetas.some(function (x) { return x.id === 'R-N' + String(n).padStart(3, '0'); })) n++;
            r.id = 'R-N' + String(n).padStart(3, '0'); r.activo = true;
            if (!r.appKey) { r.appKey = r.nombre; r.appTipo = r.tipo === 'Al vacío' ? 'vacio' : r.tipo === 'Queso en film' ? 'queso' : 'pizzita'; }
            d.recetas.push(r);
          } else { var k = d.recetas.findIndex(function (x) { return x.id === r.id; }); d.recetas[k] = r; }
          guardar(d, (nuevo ? 'elaborado nuevo ' : 'receta ') + r.nombre).then(function (ok) { if (ok) close(); });
        }));
      });
    }

    // ===== PESTAÑA 3 · PRECIOS =====
    function filas() {
      var out = [];
      D().recetas.forEach(function (r) {
        if (r.activo === false) return;
        var c0 = M.costo(r);
        r.canales.forEach(function (k) {
          var cs = M.costoCanal(r, k, c0), sg = M.sugerido(r, k, c0);
          var dif = (k.actual != null && sg) ? (sg / k.actual - 1) : null;
          out.push({ r: r, k: k, c: c0, cs: cs, sg: sg, dif: dif, real: (k.actual != null && cs) ? k.actual / 1.21 / cs : null });
        });
      });
      return out;
    }
    function vPrecios() {
      var b = bar(body); buscador(b, 'Buscar código o producto');
      body.appendChild(el('div', 'note', 'Sugerido = costo sin IVA × markup del canal × 1,21, redondeado hacia arriba ($100 por kg, $10 por unidad). La app nunca cambia el precio: lo cambiás vos con "Cambiar" y queda pendiente de cargar en el sistema y la balanza. Diferencia = cuánto tendría que subir (+) o bajar (−) el precio actual para llegar al sugerido.'));
      var F = filas().filter(function (x) { return match(x.k.codigo + ' ' + x.r.nombre); });
      F.sort(function (a, b) { return (b.dif == null ? -1 : Math.abs(b.dif)) - (a.dif == null ? -1 : Math.abs(a.dif)); });
      F.forEach(function (x) {
        var c = el('div', 'card'), row = el('div', 'row'); c.appendChild(row);
        var g = el('div', 'grow'); row.appendChild(g);
        var t = el('div', 't'); t.appendChild(el('span', 'cod', x.k.codigo || 'sin código')); t.appendChild(document.createTextNode('  ' + x.r.nombre)); g.appendChild(t);
        g.appendChild(el('div', 'mut', CANAL[x.k.canal] + ' · costo ' + m2(x.cs) + ' sin IVA'));
        var mkl = el('div', 'mut'); mkl.appendChild(document.createTextNode('Markup ×' + String(x.k.markup).replace('.', ',') + ' '));
        var pen = el('button', 'pencil', '✎'); pen.type = 'button'; pen.title = 'Cambiar markup'; pen.onclick = function () { editMarkup(x); }; mkl.appendChild(pen);
        if (x.real) mkl.appendChild(document.createTextNode(' · real ×' + x.real.toLocaleString('es-AR', { maximumFractionDigits: 2 })));
        g.appendChild(mkl);
        if (x.c.mt.fuente !== 'cargas') g.appendChild(el('span', 'tag w', 'costo con merma y tiempo de referencia'));
        if (x.c.falta.length) g.appendChild(el('span', 'tag a', 'falta precio de insumo'));
        var pr = el('div', 'r'); row.appendChild(pr);
        pr.appendChild(el('div', 'mut', 'Sugerido'));
        pr.appendChild(el('div', 'big', money(x.sg)));
        pr.appendChild(el('div', 'mut', 'Actual ' + money(x.k.actual)));
        if (x.dif != null) pr.appendChild(el('div', x.dif > 0 ? 'diff-up' : 'diff-dn', (x.dif > 0 ? '+' : '') + pct(x.dif)));
        var bb = el('div', 'tc-bar'); bb.style.margin = '8px 0 0';
        if (x.k.codigo) bb.appendChild(btn('Cambiar precio', 's', function () { cambiarPrecio(x); }));
        else bb.appendChild(btn('Falta el código: cargarlo', 's', function () { editReceta(x.r); }));
        if (x.k.actual != null && x.k.codigo) bb.appendChild(btn('Mandar solo el costo nuevo', 's g', function () { mandarCosto(x); }));
        c.appendChild(bb);
        body.appendChild(c);
      });
    }
    function editMarkup(x) {
      sheet('Markup · ' + (x.k.codigo || '') + ' ' + x.r.nombre, function (c, close) {
        var i = field(c, 'Markup sobre el costo sin IVA (×)', input(String(x.k.markup).replace('.', ','), '1,6', 'decimal'));
        var prev = el('div', 'note'); c.appendChild(prev);
        function upd() { var m = num(i.value) || 0, red = (D().constantes.REDONDEO || {})[x.r.rinde] || 10; prev.textContent = 'Sugerido: ' + money(Math.ceil(x.cs * m * 1.21 / red) * red) + ' con IVA (propuesta del canal: ×' + String(D().constantes.MARKUP[x.k.canal]).replace('.', ',') + ').'; }
        i.oninput = upd; upd();
        bar(c).appendChild(btn('Guardar', 'p', function () {
          var m = num(i.value); if (!m || m < 1) return aviso('Markup inválido (tiene que ser 1 o más).', false);
          var d = clone(D()), k = d.recetas.find(function (r) { return r.id === x.r.id; }).canales.find(function (k2) { return k2.codigo === x.k.codigo && k2.canal === x.k.canal; });
          d.cambios.push({ fecha: ahora(), tipo: 'markup', id: x.r.id, codigo: x.k.codigo, anterior: k.markup, nuevo: m, quien: store.usuario });
          k.markup = m; guardar(d, 'markup ' + (x.k.codigo || x.r.nombre)).then(function (ok) { if (ok) close(); });
        }));
      });
    }
    function cambiarPrecio(x) {
      sheet('Cambiar precio · ' + (x.k.codigo || '') + ' ' + x.r.nombre, function (c, close) {
        c.appendChild(el('div', 'kv')).innerHTML = '';
        var kv = $('.kv', c);
        [['Costo sin IVA', m2(x.cs)], ['Sugerido con IVA', money(x.sg)], ['Precio actual con IVA', money(x.k.actual) + (x.k.fuenteActual ? ' (' + x.k.fuenteActual + ')' : '')]].forEach(function (p) { kv.appendChild(el('div', null, p[0])); kv.appendChild(el('div', 'r', p[1])); });
        var i = field(c, 'Precio nuevo con IVA', input(x.sg != null ? String(x.sg) : '', '0', 'decimal'));
        var info = el('div', 'note'); c.appendChild(info);
        function upd() { var v = num(i.value); info.textContent = v ? 'Markup real: ×' + (v / 1.21 / x.cs).toLocaleString('es-AR', { maximumFractionDigits: 2 }) + (x.k.actual ? ' · cambio ' + ((v / x.k.actual - 1) >= 0 ? '+' : '') + pct(v / x.k.actual - 1) : '') + '. Queda en "pendiente de cargar" con el costo sin IVA de hoy.' : ''; }
        i.oninput = upd; upd();
        bar(c).appendChild(btn('Confirmar cambio', 'p', function () {
          var v = num(i.value); if (!v) return aviso('Poné el precio nuevo.', false);
          if (!x.k.codigo) return aviso('Este canal no tiene código del sistema: cargalo en la receta primero.', false);
          var d = clone(D()), r = d.recetas.find(function (y) { return y.id === x.r.id; }), k = r.canales.find(function (k2) { return k2.codigo === x.k.codigo && k2.canal === x.k.canal; });
          d.cambios.push({ fecha: ahora(), tipo: 'precio', id: r.id, codigo: k.codigo, producto: r.nombre, canal: k.canal, anterior: k.actual, nuevo: v, costoSin: round2(x.cs), quien: store.usuario });
          k.actual = v; k.fuenteActual = 'cambiado ' + fdate(hoy()); k.cambio = hoy();
          var pe = { fecha: ahora(), codigo: k.codigo, producto: r.nombre, canal: k.canal, costoSin: round2(x.cs), precioCon: v, anterior: x.k.actual, balanza: k.balanza || '', pidio: store.usuario, hecho: null };
          guardar(d, 'precio ' + k.codigo + ' → ' + money(v)).then(function (ok) { if (!ok) return; close(); return pendAdd(pe).then(function () { tab = 'lis'; render(); }); });
        }));
      });
    }
    function mandarCosto(x) {
      var d = clone(D()), r = d.recetas.find(function (y) { return y.id === x.r.id; }), k = r.canales.find(function (k2) { return k2.codigo === x.k.codigo && k2.canal === x.k.canal; });
      if (!k.codigo) return aviso('Este canal no tiene código del sistema.', false);
      pendAdd({ fecha: ahora(), codigo: k.codigo, producto: r.nombre, canal: k.canal, costoSin: round2(x.cs), precioCon: k.actual, anterior: k.actual, balanza: k.balanza || '', soloCosto: true, pidio: store.usuario, hecho: null })
        .then(function () { aviso('Costo de ' + k.codigo + ' mandado a cargar.'); render(); });
    }
    function round2(v) { return v == null ? null : Math.round(v * 100) / 100; }
    // Pendientes de cargar en el sistema: los guarda la página (store.pend) donde los ve también quien carga precios.
    var PEND = store.pend || { lista: [], list: function () { return this.lista; },
      add: function (p) { this.lista = this.lista.filter(function (x) { return x.codigo !== p.codigo || x.hecho; }); this.lista.push(p); return Promise.resolve(); },
      done: function (p, quien) { p.hecho = ahora(); p.quien = quien; return Promise.resolve(); } };
    function pendList() { return (PEND.list() || []).slice(); }
    function pendAdd(p) { return Promise.resolve(PEND.add(p)).catch(function (e) { aviso('El precio se guardó, pero no pude dejarlo pendiente de cargar: ' + (e && e.message || e), false); }); }

    // ===== PESTAÑA 4 · LISTA VIGENTE =====
    function vLista() {
      var P = pendList().filter(function (p) { return !p.hecho; }).sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
      var h = el('h2', null, 'Pendiente de cargar en el sistema y la balanza'); body.appendChild(h);
      if (!P.length) body.appendChild(el('div', 'note', 'Nada pendiente. Cuando cambies un precio en la pestaña Precios aparece acá, para que lo carguen vos o Gonzalo.'));
      P.forEach(function (p) {
        var c = el('div', 'card pend'), row = el('div', 'row'); c.appendChild(row);
        var g = el('div', 'grow'); row.appendChild(g);
        g.appendChild(el('div', 'cod', p.codigo)); g.appendChild(el('div', 't', p.producto));
        g.appendChild(el('div', 'mut', CANAL_C[p.canal] + (p.balanza ? ' · balanza ' + p.balanza : '') + ' · pedido ' + p.fecha.slice(8, 10) + '/' + p.fecha.slice(5, 7) + (p.soloCosto ? ' · solo costo' : '')));
        var pr = el('div', 'r'); row.appendChild(pr);
        pr.appendChild(el('div', 'mut', 'Costo sin IVA')); pr.appendChild(el('div', 'big', m2(p.costoSin)));
        pr.appendChild(el('div', 'mut', 'Precio con IVA')); pr.appendChild(el('div', 'big', money(p.precioCon)));
        if (p.anterior != null && !p.soloCosto) pr.appendChild(el('div', 'mut', 'antes ' + money(p.anterior)));
        var bb = el('div', 'tc-bar'); bb.style.margin = '8px 0 0';
        bb.appendChild(btn('✓ Cargado en sistema y balanza', 'p s', function () {
          Promise.resolve(PEND.done(p, store.usuario)).then(function () { aviso('Marcado como cargado: ' + p.codigo); render(); }, function (e) { aviso('No se pudo marcar: ' + (e && e.message || e), false); });
        }));
        c.appendChild(bb); body.appendChild(c);
      });
      var b = bar(body); b.style.marginTop = '18px';
      var t2 = el('h2', 'sp', 'Lista vigente'); t2.style.margin = '0'; b.appendChild(t2);
      b.appendChild(btn('PDF interno', 's', function () { imprimir(true); }));
      b.appendChild(btn('PDF clientes', 's', function () { imprimir(false); }));
      b.appendChild(btn('Excel', 's', excel));
      var b2 = bar(body); buscador(b2, 'Buscar código o producto');
      var F = filas().filter(function (x) { return match(x.k.codigo + ' ' + x.r.nombre); });
      // agrupar: tipo -> producto -> canal
      var porTipo = {}, orden = [];
      F.forEach(function (x) {
        var g = porTipo[x.r.tipo]; if (!g) { g = porTipo[x.r.tipo] = { prods: {}, lista: [] }; orden.push(x.r.tipo); }
        var p = g.prods[x.r.id]; if (!p) { p = g.prods[x.r.id] = { r: x.r, c: x.c, k: {} }; g.lista.push(p); }
        if (!p.k[x.k.canal]) p.k[x.k.canal] = x; else p.k[x.k.canal + '2'] = x;
      });
      var chips = el('div', 'chips'); body.appendChild(chips);
      var solo = null; try { solo = localStorage.getItem('tc-lis-solo'); } catch (e) {}
      if (solo && orden.indexOf(solo) < 0) solo = null;
      [null].concat(orden).forEach(function (tp) {
        var b = btn(tp || 'Todos', 's' + (solo === tp ? ' on' : ''), function () { try { tp ? localStorage.setItem('tc-lis-solo', tp) : localStorage.removeItem('tc-lis-solo'); } catch (e) {} render(); });
        chips.appendChild(b);
      });
      var pendCod = {}; P.forEach(function (p) { pendCod[p.codigo] = 1; });
      var cerr = {}; try { cerr = JSON.parse(localStorage.getItem('tc-lis-cerr') || '{}'); } catch (e) {}
      orden.forEach(function (tp) {
        if (solo && solo !== tp) return;
        var g = porTipo[tp], det = el('details', 'lv'); det.open = !cerr[tp];
        det.addEventListener('toggle', function () { cerr[tp] = !det.open; try { localStorage.setItem('tc-lis-cerr', JSON.stringify(cerr)); } catch (e) {} });
        var sm = el('summary'); sm.appendChild(el('span', 'lv-t', tp)); sm.appendChild(el('span', 'mut', g.lista.length + (g.lista.length === 1 ? ' producto' : ' productos'))); det.appendChild(sm);
        var canales = ['min', 'may', 'pieza'].filter(function (k) { return g.lista.some(function (p) { return p.k[k]; }); });
        var grid = el('div', 'lv-grid'); grid.style.setProperty('--n', canales.length); det.appendChild(grid);
        var hd = el('div', 'lv-row lv-head'); hd.appendChild(el('div', 'lv-name', 'Producto'));
        canales.forEach(function (k) { var h = el('div', 'lv-cell lv-' + k); h.appendChild(el('div', 'lv-lab', CANAL_C[k])); h.appendChild(el('div', 'lv-sub', 'código · precio con IVA · costo sin IVA')); hd.appendChild(h); });
        grid.appendChild(hd);
        g.lista.forEach(function (p) {
          var row = el('div', 'lv-row'), nm = el('div', 'lv-name');
          nm.appendChild(el('div', 't', p.r.nombre));
          nm.appendChild(el('div', 'mut', p.r.rinde === 'kg' ? 'precio por kg' : (p.r.rindeDesc || p.r.rinde)));
          row.appendChild(nm);
          canales.forEach(function (k) {
            var x = p.k[k], c = el('div', 'lv-cell lv-' + k);
            c.appendChild(el('div', 'lv-lab lv-ph', CANAL_C[k]));
            if (!x) { c.appendChild(el('div', 'mut', '—')); c.classList.add('vacio'); row.appendChild(c); return; }
            c.appendChild(el('div', 'cod', x.k.codigo || 'sin código'));
            c.appendChild(el('div', 'lv-pre', money(x.k.actual)));
            c.appendChild(el('div', 'lv-cos', 'costo ' + m2(x.cs)));
            var extra = [];
            if (x.k.balanza) extra.push('bal. ' + x.k.balanza);
            if (x.k.cambio) extra.push('cambió ' + fdate(x.k.cambio));
            if (extra.length) c.appendChild(el('div', 'lv-cos', extra.join(' · ')));
            if (pendCod[x.k.codigo]) c.appendChild(el('span', 'tag a', 'pendiente de cargar'));
            c.title = 'Tocá para cambiar el precio';
            c.tabIndex = 0; c.setAttribute('role', 'button');
            c.onclick = function () { if (x.k.codigo) cambiarPrecio(x); else editReceta(x.r); };
            c.onkeydown = function (e) { if (e.key === 'Enter') c.onclick(); };
            row.appendChild(c);
          });
          grid.appendChild(row);
        });
        body.appendChild(det);
      });
      body.appendChild(el('div', 'mut', 'Tocá un código para cambiar su precio. El costo es sin IVA y el precio con IVA, como se cargan en el sistema.'));
      var cm = (D().cambios || []).filter(function (c) { return c.tipo === 'precio'; }).slice(-15).reverse();
      if (cm.length) {
        body.appendChild(el('h3', null, 'Últimos cambios de precio'));
        cm.forEach(function (c) { body.appendChild(el('div', 'mut', c.fecha.slice(8, 10) + '/' + c.fecha.slice(5, 7) + ' · ' + c.codigo + ' ' + c.producto + ': ' + money(c.anterior) + ' → ' + money(c.nuevo) + ' (' + c.quien + ')')); });
      }
    }
    function imprimir(interno) {
      var F = filas(), w = el('div', 'tc-print');
      w.appendChild(el('h1', null, interno ? 'TOGO · Lista de precios interna' : 'TOGO · Lista de precios'));
      w.appendChild(el('div', null, 'Actualizada ' + fdate(hoy()) + (interno ? ' · uso interno, con costos' : ' · precios con IVA incluido')));
      var t = el('table'), th = el('tr');
      (interno ? ['Código', 'Producto', 'Canal', 'Costo sin IVA', 'Precio con IVA', 'Markup real'] : ['Código', 'Producto', 'Presentación', 'Precio con IVA']).forEach(function (h, k) { th.appendChild(el('th', (interno ? k > 2 : k > 2) ? 'r' : null, h)); });
      t.appendChild(th);
      F.forEach(function (x) {
        if (!interno && (x.k.actual == null || !x.k.codigo)) return;
        var tr = el('tr'), cells = interno
          ? [x.k.codigo || '—', x.r.nombre, CANAL_C[x.k.canal], m2(x.cs), money(x.k.actual), x.real ? '×' + x.real.toFixed(2).replace('.', ',') : '—']
          : [x.k.codigo, x.r.nombre, CANAL_C[x.k.canal] + ' · ' + (x.r.rinde === 'kg' ? 'por kg' : x.r.rindeDesc || ''), money(x.k.actual)];
        cells.forEach(function (v, k) { tr.appendChild(el('td', k > 2 ? 'r' : null, v)); }); t.appendChild(tr);
      });
      w.appendChild(t); document.body.appendChild(w);
      setTimeout(function () { window.print(); setTimeout(function () { w.remove(); }, 500); }, 50);
    }
    function excel() {
      Promise.resolve(store.loadExcel ? store.loadExcel() : W.ExcelJS).then(function (X) {
        if (!X) throw new Error('sin conexión');
        excel2(X);
      }).catch(function (e) { aviso('No cargó el generador de Excel (' + (e && e.message || e) + ').', false); });
    }
    function excel2(X) {
      var wb = new X.Workbook(), ws = wb.addWorksheet('LISTA VIGENTE');
      ws.columns = [{ header: 'Código', width: 10 }, { header: 'Producto', width: 34 }, { header: 'Tipo', width: 14 }, { header: 'Canal', width: 11 }, { header: 'Presentación', width: 22 },
        { header: 'Costo sin IVA', width: 14 }, { header: 'Costo con IVA', width: 14 }, { header: 'Precio con IVA', width: 14 }, { header: 'Precio sugerido', width: 14 }, { header: 'Markup real', width: 11 }, { header: 'Balanza', width: 10 }, { header: 'Último cambio', width: 13 }, { header: 'Merma y tiempo', width: 16 }];
      filas().forEach(function (x) {
        ws.addRow([x.k.codigo || '', x.r.nombre, x.r.tipo, CANAL_C[x.k.canal], x.r.rinde === 'kg' ? 'por kg' : (x.r.rindeDesc || x.r.rinde), round2(x.cs), round2(x.k.canal === 'pieza' ? x.cs * 1.21 : x.c.con), x.k.actual, x.sg, x.real ? Math.round(x.real * 100) / 100 : null, x.k.balanza || '', x.k.cambio || '', x.c.mt.fuente === 'cargas' ? x.c.mt.n + ' cargas' : 'referencia']);
      });
      ws.getRow(1).font = { bold: true }; [6, 7, 8, 9].forEach(function (k) { ws.getColumn(k).numFmt = '"$"#,##0.00'; });
      var wp = wb.addWorksheet('PENDIENTE DE CARGAR'); wp.columns = [{ header: 'Pedido', width: 17 }, { header: 'Código', width: 10 }, { header: 'Producto', width: 34 }, { header: 'Costo sin IVA', width: 14 }, { header: 'Precio con IVA', width: 14 }, { header: 'Cargado', width: 17 }, { header: 'Quién', width: 12 }];
      pendList().forEach(function (p) { wp.addRow([p.fecha, p.codigo, p.producto, p.costoSin, p.precioCon, p.hecho || '', p.quien || '']); }); wp.getRow(1).font = { bold: true };
      var wc = wb.addWorksheet('CAMBIOS'); wc.columns = [{ header: 'Fecha', width: 17 }, { header: 'Qué', width: 10 }, { header: 'Código', width: 10 }, { header: 'Producto / insumo', width: 34 }, { header: 'Anterior', width: 13 }, { header: 'Nuevo', width: 13 }, { header: 'Quién', width: 12 }];
      (D().cambios || []).forEach(function (c) { wc.addRow([c.fecha, c.tipo, c.codigo || c.id, c.producto || c.nombre || '', c.anterior, c.nuevo, c.quien]); }); wc.getRow(1).font = { bold: true };
      var wi = wb.addWorksheet('INSUMOS'); wi.columns = [{ header: 'Id', width: 9 }, { header: 'Insumo', width: 36 }, { header: 'Tipo', width: 12 }, { header: 'Unidad', width: 7 }, { header: 'Alícuota', width: 9 }, { header: 'Con IVA', width: 13 }, { header: 'Sin IVA', width: 13 }, { header: 'Fuente', width: 30 }];
      D().insumos.forEach(function (i) { var p = M.precio(i); wi.addRow([i.id, i.nombre, i.tipo, i.unidad, i.alic, p ? round2(p.con) : null, p ? round2(p.sin) : null, p ? (p.fuente === 'factura' ? 'Factura ' + p.fecha + ' ' + (p.prov || '') : 'A mano ' + (p.fecha || '')) : '']); }); wi.getRow(1).font = { bold: true };
      wb.xlsx.writeBuffer().then(function (buf) {
        var a = el('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        a.download = 'TOGO_LISTA_VIGENTE_' + hoy() + '.xlsx'; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 100);
        aviso('Bajado TOGO_LISTA_VIGENTE_' + hoy() + '.xlsx. Guardalo en TODO CLAUDE › ELABORACIONES.');
      });
    }

    render();
    return { refresh: refresh };
  }

  W.TogoCostos = { mount: mount, Motor: Motor };
})(window);
