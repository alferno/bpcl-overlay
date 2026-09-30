import Dn from "node:os";
import Fn, { EventEmitter as Wn } from "node:events";
import zn from "node:diagnostics_channel";
import Vn from "fs";
import Rt from "events";
import Kn from "util";
import Nt from "path";
import Dt from "assert";
import Ft from "worker_threads";
import Mn from "module";
import Un from "node:path";
import Jn from "url";
import Gn from "buffer";
var Wt = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {};
function qn(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
function qf(e) {
  if (e.__esModule) return e;
  var t = e.default;
  if (typeof t == "function") {
    var n = function r() {
      return this instanceof r ? Reflect.construct(t, arguments, this.constructor) : t.apply(this, arguments);
    };
    n.prototype = t.prototype;
  } else n = {};
  return Object.defineProperty(n, "__esModule", { value: !0 }), Object.keys(e).forEach(function(r) {
    var i = Object.getOwnPropertyDescriptor(e, r);
    Object.defineProperty(n, r, i.get ? i : {
      enumerable: !0,
      get: function() {
        return e[r];
      }
    });
  }), n;
}
var M = { exports: {} };
const le = (e) => e && typeof e.message == "string", zt = (e) => {
  if (!e) return;
  const t = e.cause;
  if (typeof t == "function") {
    const n = e.cause();
    return le(n) ? n : void 0;
  } else
    return le(t) ? t : void 0;
}, Vt = (e, t) => {
  if (!le(e)) return "";
  const n = e.stack || "";
  if (t.has(e))
    return n + `
causes have become circular...`;
  const r = zt(e);
  return r ? (t.add(e), n + `
caused by: ` + Vt(r, t)) : n;
}, Hn = (e) => Vt(e, /* @__PURE__ */ new Set()), Kt = (e, t, n) => {
  if (!le(e)) return "";
  const r = n ? "" : e.message || "";
  if (t.has(e))
    return r + ": ...";
  const i = zt(e);
  if (i) {
    t.add(e);
    const s = typeof e.cause == "function";
    return r + (s ? "" : ": ") + Kt(i, t, s);
  } else
    return r;
}, Xn = (e) => Kt(e, /* @__PURE__ */ new Set());
var Mt = {
  isErrorLike: le,
  stackWithCauses: Hn,
  messageWithCauses: Xn
};
const Yn = Symbol("circular-ref-tag"), ze = Symbol("pino-raw-err-ref"), Ut = Object.create({}, {
  type: {
    enumerable: !0,
    writable: !0,
    value: void 0
  },
  message: {
    enumerable: !0,
    writable: !0,
    value: void 0
  },
  stack: {
    enumerable: !0,
    writable: !0,
    value: void 0
  },
  aggregateErrors: {
    enumerable: !0,
    writable: !0,
    value: void 0
  },
  raw: {
    enumerable: !1,
    get: function() {
      return this[ze];
    },
    set: function(e) {
      this[ze] = e;
    }
  }
});
Object.defineProperty(Ut, ze, {
  writable: !0,
  value: {}
});
var Jt = {
  pinoErrProto: Ut,
  pinoErrorSymbols: {
    seen: Yn
  }
}, Qn = Ve;
const { messageWithCauses: Zn, stackWithCauses: er, isErrorLike: ct } = Mt, { pinoErrProto: tr, pinoErrorSymbols: nr } = Jt, { seen: Ce } = nr, { toString: rr } = Object.prototype;
function Ve(e) {
  if (!ct(e))
    return e;
  e[Ce] = void 0;
  const t = Object.create(tr);
  t.type = rr.call(e.constructor) === "[object Function]" ? e.constructor.name : e.name, t.message = Zn(e), t.stack = er(e), Array.isArray(e.errors) && (t.aggregateErrors = e.errors.map((n) => Ve(n)));
  for (const n in e)
    if (t[n] === void 0) {
      const r = e[n];
      ct(r) ? n !== "cause" && !Object.prototype.hasOwnProperty.call(r, Ce) && (t[n] = Ve(r)) : t[n] = r;
    }
  return delete e[Ce], t.raw = e, t;
}
var ir = pe;
const { isErrorLike: Te } = Mt, { pinoErrProto: sr, pinoErrorSymbols: or } = Jt, { seen: ae } = or, { toString: fr } = Object.prototype;
function pe(e) {
  if (!Te(e))
    return e;
  e[ae] = void 0;
  const t = Object.create(sr);
  t.type = fr.call(e.constructor) === "[object Function]" ? e.constructor.name : e.name, t.message = e.message, t.stack = e.stack, Array.isArray(e.errors) && (t.aggregateErrors = e.errors.map((n) => pe(n))), Te(e.cause) && !Object.prototype.hasOwnProperty.call(e.cause, ae) && (t.cause = pe(e.cause));
  for (const n in e)
    if (t[n] === void 0) {
      const r = e[n];
      Te(r) ? Object.prototype.hasOwnProperty.call(r, ae) || (t[n] = pe(r)) : t[n] = r;
    }
  return delete e[ae], t.raw = e, t;
}
var lr = {
  mapHttpRequest: ur,
  reqSerializer: qt
};
const Ke = Symbol("pino-raw-req-ref"), Gt = Object.create({}, {
  id: {
    enumerable: !0,
    writable: !0,
    value: ""
  },
  method: {
    enumerable: !0,
    writable: !0,
    value: ""
  },
  url: {
    enumerable: !0,
    writable: !0,
    value: ""
  },
  query: {
    enumerable: !0,
    writable: !0,
    value: ""
  },
  params: {
    enumerable: !0,
    writable: !0,
    value: ""
  },
  headers: {
    enumerable: !0,
    writable: !0,
    value: {}
  },
  remoteAddress: {
    enumerable: !0,
    writable: !0,
    value: ""
  },
  remotePort: {
    enumerable: !0,
    writable: !0,
    value: ""
  },
  raw: {
    enumerable: !1,
    get: function() {
      return this[Ke];
    },
    set: function(e) {
      this[Ke] = e;
    }
  }
});
Object.defineProperty(Gt, Ke, {
  writable: !0,
  value: {}
});
function qt(e) {
  const t = e.info || e.socket, n = Object.create(Gt);
  if (n.id = typeof e.id == "function" ? e.id() : e.id || (e.info ? e.info.id : void 0), n.method = e.method, e.originalUrl)
    n.url = e.originalUrl;
  else {
    const r = e.path;
    n.url = typeof r == "string" ? r : e.url ? e.url.path || e.url : void 0;
  }
  return e.query && (n.query = e.query), e.params && (n.params = e.params), n.headers = e.headers, n.remoteAddress = t && t.remoteAddress, n.remotePort = t && t.remotePort, n.raw = e.raw || e, n;
}
function ur(e) {
  return {
    req: qt(e)
  };
}
var cr = {
  mapHttpResponse: ar,
  resSerializer: Xt
};
const Me = Symbol("pino-raw-res-ref"), Ht = Object.create({}, {
  statusCode: {
    enumerable: !0,
    writable: !0,
    value: 0
  },
  headers: {
    enumerable: !0,
    writable: !0,
    value: ""
  },
  raw: {
    enumerable: !1,
    get: function() {
      return this[Me];
    },
    set: function(e) {
      this[Me] = e;
    }
  }
});
Object.defineProperty(Ht, Me, {
  writable: !0,
  value: {}
});
function Xt(e) {
  const t = Object.create(Ht);
  return t.statusCode = e.headersSent ? e.statusCode : null, t.headers = e.getHeaders ? e.getHeaders() : e._headers, t.raw = e, t;
}
function ar(e) {
  return {
    res: Xt(e)
  };
}
const ke = Qn, hr = ir, he = lr, de = cr;
var Yt = {
  err: ke,
  errWithCause: hr,
  mapHttpRequest: he.mapHttpRequest,
  mapHttpResponse: de.mapHttpResponse,
  req: he.reqSerializer,
  res: de.resSerializer,
  wrapErrorSerializer: function(t) {
    return t === ke ? t : function(r) {
      return t(ke(r));
    };
  },
  wrapRequestSerializer: function(t) {
    return t === he.reqSerializer ? t : function(r) {
      return t(he.reqSerializer(r));
    };
  },
  wrapResponseSerializer: function(t) {
    return t === de.resSerializer ? t : function(r) {
      return t(de.resSerializer(r));
    };
  }
};
function dr(e, t) {
  return t;
}
var Qt = function() {
  const t = Error.prepareStackTrace;
  Error.prepareStackTrace = dr;
  const n = new Error().stack;
  if (Error.prepareStackTrace = t, !Array.isArray(n))
    return;
  const r = n.slice(2), i = [];
  for (const s of r)
    s && i.push(s.getFileName());
  return i;
};
function Ue(e) {
  if (e === null || typeof e != "object")
    return e;
  if (e instanceof Date)
    return new Date(e.getTime());
  if (e instanceof Array) {
    const t = [];
    for (let n = 0; n < e.length; n++)
      t[n] = Ue(e[n]);
    return t;
  }
  if (typeof e == "object") {
    const t = Object.create(Object.getPrototypeOf(e));
    for (const n in e)
      Object.prototype.hasOwnProperty.call(e, n) && (t[n] = Ue(e[n]));
    return t;
  }
  return e;
}
function Zt(e) {
  const t = [];
  let n = "", r = !1, i = !1, s = "";
  for (let u = 0; u < e.length; u++) {
    const d = e[u];
    !r && d === "." ? n && (t.push(n), n = "") : d === "[" ? (n && (t.push(n), n = ""), r = !0) : d === "]" && r ? (t.push(n), n = "", r = !1, i = !1) : (d === '"' || d === "'") && r ? i ? d === s ? (i = !1, s = "") : n += d : (i = !0, s = d) : n += d;
  }
  return n && t.push(n), t;
}
function en(e, t, n) {
  let r = e;
  for (let s = 0; s < t.length - 1; s++) {
    const u = t[s];
    if (typeof r != "object" || r === null || !(u in r) || typeof r[u] != "object" || r[u] === null)
      return !1;
    r = r[u];
  }
  const i = t[t.length - 1];
  if (i === "*") {
    if (Array.isArray(r))
      for (let s = 0; s < r.length; s++)
        r[s] = n;
    else if (typeof r == "object" && r !== null)
      for (const s in r)
        Object.prototype.hasOwnProperty.call(r, s) && (r[s] = n);
  } else
    typeof r == "object" && r !== null && i in r && Object.prototype.hasOwnProperty.call(r, i) && (r[i] = n);
  return !0;
}
function tn(e, t) {
  let n = e;
  for (let i = 0; i < t.length - 1; i++) {
    const s = t[i];
    if (typeof n != "object" || n === null || !(s in n) || typeof n[s] != "object" || n[s] === null)
      return !1;
    n = n[s];
  }
  const r = t[t.length - 1];
  if (r === "*") {
    if (Array.isArray(n))
      for (let i = 0; i < n.length; i++)
        n[i] = void 0;
    else if (typeof n == "object" && n !== null)
      for (const i in n)
        Object.prototype.hasOwnProperty.call(n, i) && delete n[i];
  } else
    typeof n == "object" && n !== null && r in n && Object.prototype.hasOwnProperty.call(n, r) && delete n[r];
  return !0;
}
const Se = Symbol("PATH_NOT_FOUND");
function yr(e, t) {
  let n = e;
  for (const r of t) {
    if (n == null || typeof n != "object" || n === null || !(r in n))
      return Se;
    n = n[r];
  }
  return n;
}
function mr(e, t) {
  let n = e;
  for (const r of t) {
    if (n == null || typeof n != "object" || n === null)
      return;
    n = n[r];
  }
  return n;
}
function gr(e, t, n, r = !1) {
  for (const i of t) {
    const s = Zt(i);
    if (s.includes("*"))
      nn(e, s, n, i, r);
    else if (r)
      tn(e, s);
    else {
      const u = yr(e, s);
      if (u === Se)
        continue;
      const d = typeof n == "function" ? n(u, s) : n;
      en(e, s, d);
    }
  }
}
function nn(e, t, n, r, i = !1) {
  const s = t.indexOf("*");
  if (s === t.length - 1) {
    const u = t.slice(0, -1);
    let d = e;
    for (const o of u) {
      if (d == null || typeof d != "object" || d === null) return;
      d = d[o];
    }
    if (Array.isArray(d))
      if (i)
        for (let o = 0; o < d.length; o++)
          d[o] = void 0;
      else
        for (let o = 0; o < d.length; o++) {
          const c = [...u, o.toString()], l = typeof n == "function" ? n(d[o], c) : n;
          d[o] = l;
        }
    else if (typeof d == "object" && d !== null)
      if (i) {
        const o = [];
        for (const c in d)
          Object.prototype.hasOwnProperty.call(d, c) && o.push(c);
        for (const c of o)
          delete d[c];
      } else
        for (const o in d) {
          const c = [...u, o], l = typeof n == "function" ? n(d[o], c) : n;
          d[o] = l;
        }
  } else
    pr(e, t, n, s, r, i);
}
function pr(e, t, n, r, i, s = !1) {
  const u = t.slice(0, r), d = t.slice(r + 1), o = [];
  function c(l, y) {
    if (y === u.length) {
      if (Array.isArray(l))
        for (let b = 0; b < l.length; b++)
          o[y] = b.toString(), c(l[b], y + 1);
      else if (typeof l == "object" && l !== null)
        for (const b in l)
          o[y] = b, c(l[b], y + 1);
    } else if (y < u.length) {
      const b = u[y];
      l && typeof l == "object" && l !== null && b in l && (o[y] = b, c(l[b], y + 1));
    } else if (d.includes("*"))
      nn(l, d, typeof n == "function" ? (g, p) => {
        const B = [...o.slice(0, y), ...p];
        return n(g, B);
      } : n, i, s);
    else if (s)
      tn(l, d);
    else {
      const b = typeof n == "function" ? n(mr(l, d), [...o.slice(0, y), ...d]) : n;
      en(l, d, b);
    }
  }
  if (u.length === 0)
    c(e, 0);
  else {
    let l = e;
    for (let y = 0; y < u.length; y++) {
      const b = u[y];
      if (l == null || typeof l != "object" || l === null) return;
      l = l[b], o[y] = b;
    }
    l != null && c(l, u.length);
  }
}
function Sr(e) {
  if (e.length === 0)
    return null;
  const t = /* @__PURE__ */ new Map();
  for (const n of e) {
    const r = Zt(n);
    let i = t;
    for (let s = 0; s < r.length; s++) {
      const u = r[s];
      i.has(u) || i.set(u, /* @__PURE__ */ new Map()), i = i.get(u);
    }
  }
  return t;
}
function br(e, t) {
  if (!t)
    return e;
  function n(r, i, s = 0) {
    if (!i || i.size === 0 || r === null || typeof r != "object")
      return r;
    if (r instanceof Date)
      return new Date(r.getTime());
    if (Array.isArray(r)) {
      const d = [];
      for (let o = 0; o < r.length; o++) {
        const c = o.toString();
        i.has(c) || i.has("*") ? d[o] = n(r[o], i.get(c) || i.get("*")) : d[o] = r[o];
      }
      return d;
    }
    const u = Object.create(Object.getPrototypeOf(r));
    for (const d in r)
      Object.prototype.hasOwnProperty.call(r, d) && (i.has(d) || i.has("*") ? u[d] = n(r[d], i.get(d) || i.get("*")) : u[d] = r[d]);
    return u;
  }
  return n(e, t);
}
function wr(e) {
  if (typeof e != "string")
    throw new Error("Paths must be (non-empty) strings");
  if (e === "")
    throw new Error("Invalid redaction path ()");
  if (e.includes(".."))
    throw new Error(`Invalid redaction path (${e})`);
  if (e.includes(","))
    throw new Error(`Invalid redaction path (${e})`);
  let t = 0, n = !1, r = "";
  for (let i = 0; i < e.length; i++) {
    const s = e[i];
    if ((s === '"' || s === "'") && t > 0)
      n ? s === r && (n = !1, r = "") : (n = !0, r = s);
    else if (s === "[" && !n)
      t++;
    else if (s === "]" && !n && (t--, t < 0))
      throw new Error(`Invalid redaction path (${e})`);
  }
  if (t !== 0)
    throw new Error(`Invalid redaction path (${e})`);
}
function $r(e) {
  if (!Array.isArray(e))
    throw new TypeError("paths must be an array");
  for (const t of e)
    wr(t);
}
function _r(e = {}) {
  const {
    paths: t = [],
    censor: n = "[REDACTED]",
    serialize: r = JSON.stringify,
    strict: i = !0,
    remove: s = !1
  } = e;
  $r(t);
  const u = Sr(t);
  return function(o) {
    if (i && (o === null || typeof o != "object") && (o == null || typeof o != "object"))
      return r ? r(o) : o;
    const c = br(o, u), l = o;
    let y = n;
    return typeof n == "function" && (y = n), gr(c, t, y, s), r === !1 ? (c.restore = function() {
      return Ue(l);
    }, c) : typeof r == "function" ? r(c) : JSON.stringify(c);
  };
}
var Er = _r;
const vr = Symbol("pino.setLevel"), Or = Symbol("pino.getLevel"), xr = Symbol("pino.levelVal"), Lr = Symbol("pino.levelComp"), Ar = Symbol("pino.useLevelLabels"), Cr = Symbol("pino.useOnlyCustomLevels"), Tr = Symbol("pino.mixin"), kr = Symbol("pino.lsCache"), Br = Symbol("pino.chindings"), Pr = Symbol("pino.asJson"), jr = Symbol("pino.write"), Ir = Symbol("pino.redactFmt"), Rr = Symbol("pino.time"), Nr = Symbol("pino.timeSliceIndex"), Dr = Symbol("pino.stream"), Fr = Symbol("pino.stringify"), Wr = Symbol("pino.stringifySafe"), zr = Symbol("pino.stringifiers"), Vr = Symbol("pino.end"), Kr = Symbol("pino.formatOpts"), Mr = Symbol("pino.messageKey"), Ur = Symbol("pino.errorKey"), Jr = Symbol("pino.nestedKey"), Gr = Symbol("pino.nestedKeyStr"), qr = Symbol("pino.mixinMergeStrategy"), Hr = Symbol("pino.msgPrefix"), Xr = Symbol("pino.wildcardFirst"), Yr = Symbol.for("pino.serializers"), Qr = Symbol.for("pino.formatters"), Zr = Symbol.for("pino.hooks"), ei = Symbol.for("pino.metadata");
var ue = {
  setLevelSym: vr,
  getLevelSym: Or,
  levelValSym: xr,
  levelCompSym: Lr,
  useLevelLabelsSym: Ar,
  mixinSym: Tr,
  lsCacheSym: kr,
  chindingsSym: Br,
  asJsonSym: Pr,
  writeSym: jr,
  serializersSym: Yr,
  redactFmtSym: Ir,
  timeSym: Rr,
  timeSliceIndexSym: Nr,
  streamSym: Dr,
  stringifySym: Fr,
  stringifySafeSym: Wr,
  stringifiersSym: zr,
  endSym: Vr,
  formatOptsSym: Kr,
  messageKeySym: Mr,
  errorKeySym: Ur,
  nestedKeySym: Jr,
  wildcardFirstSym: Xr,
  needsMetadataGsym: ei,
  useOnlyCustomLevelsSym: Cr,
  formattersSym: Qr,
  hooksSym: Zr,
  nestedKeyStrSym: Gr,
  mixinMergeStrategySym: qr,
  msgPrefixSym: Hr
};
const at = Er, { redactFmtSym: ti, wildcardFirstSym: ye } = ue, Be = /[^.[\]]+|\[([^[\]]*?)\]/g, ht = "[Redacted]", dt = !1;
function ni(e, t) {
  const { paths: n, censor: r, remove: i } = ri(e), s = n.reduce((o, c) => {
    Be.lastIndex = 0;
    const l = Be.exec(c), y = Be.exec(c);
    let b = l[1] !== void 0 ? l[1].replace(/^(?:"|'|`)(.*)(?:"|'|`)$/, "$1") : l[0];
    if (b === "*" && (b = ye), y === null)
      return o[b] = null, o;
    if (o[b] === null)
      return o;
    const { index: g } = y, p = `${c.substr(g, c.length - 1)}`;
    return o[b] = o[b] || [], b !== ye && o[b].length === 0 && o[b].push(...o[ye] || []), b === ye && Object.keys(o).forEach(function(B) {
      o[B] && o[B].push(p);
    }), o[b].push(p), o;
  }, {}), u = {
    [ti]: at({ paths: n, censor: r, serialize: t, strict: dt, remove: i })
  }, d = (...o) => t(typeof r == "function" ? r(...o) : r);
  return [...Object.keys(s), ...Object.getOwnPropertySymbols(s)].reduce((o, c) => {
    if (s[c] === null)
      o[c] = (l) => d(l, [c]);
    else {
      const l = typeof r == "function" ? (y, b) => r(y, [c, ...b]) : r;
      o[c] = at({
        paths: s[c],
        censor: l,
        serialize: t,
        strict: dt,
        remove: i
      });
    }
    return o;
  }, u);
}
function ri(e) {
  if (Array.isArray(e))
    return e = { paths: e, censor: ht }, e;
  let { paths: t, censor: n = ht, remove: r } = e;
  if (Array.isArray(t) === !1)
    throw Error("pino – redact must contain an array of strings");
  return r === !0 && (n = void 0), { paths: t, censor: n, remove: r };
}
var rn = ni;
const ii = () => "", si = () => `,"time":${Date.now()}`, oi = () => `,"time":${Math.round(Date.now() / 1e3)}`, fi = () => `,"time":"${new Date(Date.now()).toISOString()}"`, li = 1000000n, yt = 1000000000n, ui = BigInt(Date.now()) * li, ci = process.hrtime.bigint(), ai = () => {
  const e = process.hrtime.bigint() - ci, t = ui + e, n = t / yt, r = t % yt, i = Number(n * 1000n + r / 1000000n), s = new Date(i), u = s.getUTCFullYear(), d = (s.getUTCMonth() + 1).toString().padStart(2, "0"), o = s.getUTCDate().toString().padStart(2, "0"), c = s.getUTCHours().toString().padStart(2, "0"), l = s.getUTCMinutes().toString().padStart(2, "0"), y = s.getUTCSeconds().toString().padStart(2, "0");
  return `,"time":"${u}-${d}-${o}T${c}:${l}:${y}.${r.toString().padStart(9, "0")}Z"`;
};
var hi = { nullTime: ii, epochTime: si, unixTime: oi, isoTime: fi, isoTimeNano: ai };
function di(e) {
  try {
    return JSON.stringify(e);
  } catch {
    return '"[Circular]"';
  }
}
var yi = mi;
function mi(e, t, n) {
  var r = n && n.stringify || di, i = 1;
  if (typeof e == "object" && e !== null) {
    var s = t.length + i;
    if (s === 1) return e;
    var u = new Array(s);
    u[0] = r(e);
    for (var d = 1; d < s; d++)
      u[d] = r(t[d]);
    return u.join(" ");
  }
  if (typeof e != "string")
    return e;
  var o = t.length;
  if (o === 0) return e;
  for (var c = "", l = 1 - i, y = -1, b = e && e.length || 0, g = 0; g < b; ) {
    if (e.charCodeAt(g) === 37 && g + 1 < b) {
      switch (y = y > -1 ? y : 0, e.charCodeAt(g + 1)) {
        case 100:
        case 102:
          if (l >= o || t[l] == null) break;
          y < g && (c += e.slice(y, g)), c += Number(t[l]), y = g + 2, g++;
          break;
        case 105:
          if (l >= o || t[l] == null) break;
          y < g && (c += e.slice(y, g)), c += Math.floor(Number(t[l])), y = g + 2, g++;
          break;
        case 79:
        case 111:
        case 106:
          if (l >= o || t[l] === void 0) break;
          y < g && (c += e.slice(y, g));
          var p = typeof t[l];
          if (p === "string") {
            c += "'" + t[l] + "'", y = g + 2, g++;
            break;
          }
          if (p === "function") {
            c += t[l].name || "<anonymous>", y = g + 2, g++;
            break;
          }
          c += r(t[l]), y = g + 2, g++;
          break;
        case 115:
          if (l >= o)
            break;
          y < g && (c += e.slice(y, g)), c += String(t[l]), y = g + 2, g++;
          break;
        case 37:
          y < g && (c += e.slice(y, g)), c += "%", y = g + 2, g++, l--;
          break;
      }
      ++l;
    }
    ++g;
  }
  return y === -1 ? e : (y < b && (c += e.slice(y)), c);
}
var Je = { exports: {} };
if (typeof SharedArrayBuffer < "u" && typeof Atomics < "u") {
  let t = function(n) {
    if ((n > 0 && n < 1 / 0) === !1)
      throw typeof n != "number" && typeof n != "bigint" ? TypeError("sleep: ms must be a number") : RangeError("sleep: ms must be a number that is greater than 0 but less than Infinity");
    Atomics.wait(e, 0, 0, Number(n));
  };
  const e = new Int32Array(new SharedArrayBuffer(4));
  Je.exports = t;
} else {
  let e = function(t) {
    if ((t > 0 && t < 1 / 0) === !1)
      throw typeof t != "number" && typeof t != "bigint" ? TypeError("sleep: ms must be a number") : RangeError("sleep: ms must be a number that is greater than 0 but less than Infinity");
  };
  Je.exports = e;
}
var sn = Je.exports;
const j = Vn, gi = Rt, pi = Kn.inherits, mt = Nt, rt = sn, Si = Dt, $e = 100, _e = Buffer.allocUnsafe(0), bi = 16 * 1024, gt = "buffer", pt = "utf8", [wi, $i] = (process.versions.node || "0.0").split(".").map(Number), _i = wi >= 22 && $i >= 7;
function on(e, t) {
  t._opening = !0, t._writing = !0, t._asyncDrainScheduled = !1;
  function n(s, u) {
    if (s) {
      t._reopening = !1, t._writing = !1, t._opening = !1, t.sync ? process.nextTick(() => {
        t.listenerCount("error") > 0 && t.emit("error", s);
      }) : t.emit("error", s);
      return;
    }
    const d = t._reopening;
    t.fd = u, t.file = e, t._reopening = !1, t._opening = !1, t._writing = !1, t.sync ? process.nextTick(() => t.emit("ready")) : t.emit("ready"), !t.destroyed && (!t._writing && t._len > t.minLength || t._flushPending ? t._actualWrite() : d && process.nextTick(() => t.emit("drain")));
  }
  const r = t.append ? "a" : "w", i = t.mode;
  if (t.sync)
    try {
      t.mkdir && j.mkdirSync(mt.dirname(e), { recursive: !0 });
      const s = j.openSync(e, r, i);
      n(null, s);
    } catch (s) {
      throw n(s), s;
    }
  else t.mkdir ? j.mkdir(mt.dirname(e), { recursive: !0 }, (s) => {
    if (s) return n(s);
    j.open(e, r, i, n);
  }) : j.open(e, r, i, n);
}
function q(e) {
  if (!(this instanceof q))
    return new q(e);
  let { fd: t, dest: n, minLength: r, maxLength: i, maxWrite: s, periodicFlush: u, sync: d, append: o = !0, mkdir: c, retryEAGAIN: l, fsync: y, contentMode: b, mode: g } = e || {};
  t = t || n, this._len = 0, this.fd = -1, this._bufs = [], this._lens = [], this._writing = !1, this._ending = !1, this._reopening = !1, this._asyncDrainScheduled = !1, this._flushPending = !1, this._hwm = Math.max(r || 0, 16387), this.file = null, this.destroyed = !1, this.minLength = r || 0, this.maxLength = i || 0, this.maxWrite = s || bi, this._periodicFlush = u || 0, this._periodicFlushTimer = void 0, this.sync = d || !1, this.writable = !0, this._fsync = y || !1, this.append = o || !1, this.mode = g, this.retryEAGAIN = l || (() => !0), this.mkdir = c || !1;
  let p, B;
  if (b === gt)
    this._writingBuf = _e, this.write = Oi, this.flush = Li, this.flushSync = Ci, this._actualWrite = ki, p = () => j.writeSync(this.fd, this._writingBuf), B = () => j.write(this.fd, this._writingBuf, this.release);
  else if (b === void 0 || b === pt)
    this._writingBuf = "", this.write = vi, this.flush = xi, this.flushSync = Ai, this._actualWrite = Ti, p = () => Buffer.isBuffer(this._writingBuf) ? j.writeSync(this.fd, this._writingBuf) : j.writeSync(this.fd, this._writingBuf, "utf8"), B = () => Buffer.isBuffer(this._writingBuf) ? j.write(this.fd, this._writingBuf, this.release) : j.write(this.fd, this._writingBuf, "utf8", this.release);
  else
    throw new Error(`SonicBoom supports "${pt}" and "${gt}", but passed ${b}`);
  if (typeof t == "number")
    this.fd = t, process.nextTick(() => this.emit("ready"));
  else if (typeof t == "string")
    on(t, this);
  else
    throw new Error("SonicBoom supports only file descriptors and files");
  if (this.minLength >= this.maxWrite)
    throw new Error(`minLength should be smaller than maxWrite (${this.maxWrite})`);
  this.release = (P, F) => {
    if (P) {
      if ((P.code === "EAGAIN" || P.code === "EBUSY") && this.retryEAGAIN(P, this._writingBuf.length, this._len - this._writingBuf.length))
        if (this.sync)
          try {
            rt($e), this.release(void 0, 0);
          } catch (S) {
            this.release(S);
          }
        else
          setTimeout(B, $e);
      else
        this._writing = !1, this.emit("error", P);
      return;
    }
    this.emit("write", F);
    const m = Ge(this._writingBuf, this._len, F);
    if (this._len = m.len, this._writingBuf = m.writingBuf, this._writingBuf.length) {
      if (!this.sync) {
        B();
        return;
      }
      try {
        do {
          const S = p(), L = Ge(this._writingBuf, this._len, S);
          this._len = L.len, this._writingBuf = L.writingBuf;
        } while (this._writingBuf.length);
      } catch (S) {
        this.release(S);
        return;
      }
    }
    this._fsync && j.fsyncSync(this.fd);
    const h = this._len;
    this._reopening ? (this._writing = !1, this._reopening = !1, this.reopen()) : h > this.minLength ? this._actualWrite() : this._ending ? h > 0 ? this._actualWrite() : (this._writing = !1, Le(this)) : (this._writing = !1, this.sync ? this._asyncDrainScheduled || (this._asyncDrainScheduled = !0, process.nextTick(Ei, this)) : this.emit("drain"));
  }, this.on("newListener", function(P) {
    P === "drain" && (this._asyncDrainScheduled = !1);
  }), this._periodicFlush !== 0 && (this._periodicFlushTimer = setInterval(() => this.flush(null), this._periodicFlush), this._periodicFlushTimer.unref());
}
function Ge(e, t, n) {
  return typeof e == "string" && (e = Buffer.from(e)), t = Math.max(t - n, 0), e = e.subarray(n), { writingBuf: e, len: t };
}
function Ei(e) {
  e.listenerCount("drain") > 0 && (e._asyncDrainScheduled = !1, e.emit("drain"));
}
pi(q, gi);
function fn(e, t) {
  return e.length === 0 ? _e : e.length === 1 ? e[0] : Buffer.concat(e, t);
}
function vi(e) {
  if (this.destroyed)
    throw new Error("SonicBoom destroyed");
  e = "" + e;
  const t = Buffer.byteLength(e), n = this._len + t, r = this._bufs;
  return this.maxLength && n > this.maxLength ? (this.emit("drop", e), this._len < this._hwm) : (r.length === 0 || Buffer.byteLength(r[r.length - 1]) + t > this.maxWrite ? r.push(e) : r[r.length - 1] += e, this._len = n, !this._writing && this._len >= this.minLength && this._actualWrite(), this._len < this._hwm);
}
function Oi(e) {
  if (this.destroyed)
    throw new Error("SonicBoom destroyed");
  const t = this._len + e.length, n = this._bufs, r = this._lens;
  return this.maxLength && t > this.maxLength ? (this.emit("drop", e), this._len < this._hwm) : (n.length === 0 || r[r.length - 1] + e.length > this.maxWrite ? (n.push([e]), r.push(e.length)) : (n[n.length - 1].push(e), r[r.length - 1] += e.length), this._len = t, !this._writing && this._len >= this.minLength && this._actualWrite(), this._len < this._hwm);
}
function ln(e) {
  this._flushPending = !0;
  const t = () => {
    if (this._fsync)
      this._flushPending = !1, e();
    else
      try {
        j.fsync(this.fd, (r) => {
          this._flushPending = !1, e(r);
        });
      } catch (r) {
        e(r);
      }
    this.off("error", n);
  }, n = (r) => {
    this._flushPending = !1, e(r), this.off("drain", t);
  };
  this.once("drain", t), this.once("error", n);
}
function xi(e) {
  if (e != null && typeof e != "function")
    throw new Error("flush cb must be a function");
  if (this.destroyed) {
    const t = new Error("SonicBoom destroyed");
    if (e) {
      e(t);
      return;
    }
    throw t;
  }
  if (this.minLength <= 0) {
    e == null || e();
    return;
  }
  e && ln.call(this, e), !this._writing && (this._bufs.length === 0 && this._bufs.push(""), this._actualWrite());
}
function Li(e) {
  if (e != null && typeof e != "function")
    throw new Error("flush cb must be a function");
  if (this.destroyed) {
    const t = new Error("SonicBoom destroyed");
    if (e) {
      e(t);
      return;
    }
    throw t;
  }
  if (this.minLength <= 0) {
    e == null || e();
    return;
  }
  e && ln.call(this, e), !this._writing && (this._bufs.length === 0 && (this._bufs.push([]), this._lens.push(0)), this._actualWrite());
}
q.prototype.reopen = function(e) {
  if (this.destroyed)
    throw new Error("SonicBoom destroyed");
  if (this._opening) {
    this.once("ready", () => {
      this.reopen(e);
    });
    return;
  }
  if (this._ending)
    return;
  if (!this.file)
    throw new Error("Unable to reopen a file descriptor, you must pass a file to SonicBoom");
  if (e && (this.file = e), this._reopening = !0, this._writing)
    return;
  const t = this.fd;
  this.once("ready", () => {
    t !== this.fd && j.close(t, (n) => {
      if (n)
        return this.emit("error", n);
    });
  }), on(this.file, this);
};
q.prototype.end = function() {
  if (this.destroyed)
    throw new Error("SonicBoom destroyed");
  if (this._opening) {
    this.once("ready", () => {
      this.end();
    });
    return;
  }
  this._ending || (this._ending = !0, !this._writing && (this._len > 0 && this.fd >= 0 ? this._actualWrite() : Le(this)));
};
function Ai() {
  if (this.destroyed)
    throw new Error("SonicBoom destroyed");
  if (this.fd < 0)
    throw new Error("sonic boom is not ready yet");
  !this._writing && this._writingBuf.length > 0 && (this._bufs.unshift(this._writingBuf), this._writingBuf = "");
  let e = "";
  for (; this._bufs.length || e.length; ) {
    e.length <= 0 && (e = this._bufs[0]);
    try {
      const t = Buffer.isBuffer(e) ? j.writeSync(this.fd, e) : j.writeSync(this.fd, e, "utf8"), n = Ge(e, this._len, t);
      e = n.writingBuf, this._len = n.len, e.length <= 0 && this._bufs.shift();
    } catch (t) {
      if ((t.code === "EAGAIN" || t.code === "EBUSY") && !this.retryEAGAIN(t, e.length, this._len - e.length))
        throw t;
      rt($e);
    }
  }
  try {
    j.fsyncSync(this.fd);
  } catch {
  }
}
function Ci() {
  if (this.destroyed)
    throw new Error("SonicBoom destroyed");
  if (this.fd < 0)
    throw new Error("sonic boom is not ready yet");
  !this._writing && this._writingBuf.length > 0 && (this._bufs.unshift([this._writingBuf]), this._writingBuf = _e);
  let e = _e;
  for (; this._bufs.length || e.length; ) {
    e.length <= 0 && (e = fn(this._bufs[0], this._lens[0]));
    try {
      const t = j.writeSync(this.fd, e);
      e = e.subarray(t), this._len = Math.max(this._len - t, 0), e.length <= 0 && (this._bufs.shift(), this._lens.shift());
    } catch (t) {
      if ((t.code === "EAGAIN" || t.code === "EBUSY") && !this.retryEAGAIN(t, e.length, this._len - e.length))
        throw t;
      rt($e);
    }
  }
}
q.prototype.destroy = function() {
  this.destroyed || Le(this);
};
function Ti() {
  const e = this.release;
  if (this._writing = !0, this._writingBuf = this._writingBuf.length ? this._writingBuf : this._bufs.shift() || "", this.sync)
    try {
      const t = Buffer.isBuffer(this._writingBuf) ? j.writeSync(this.fd, this._writingBuf) : j.writeSync(this.fd, this._writingBuf, "utf8");
      e(null, t);
    } catch (t) {
      e(t);
    }
  else
    j.write(this.fd, this._writingBuf, e);
}
function ki() {
  const e = this.release;
  if (this._writing = !0, this._writingBuf = this._writingBuf.length ? this._writingBuf : fn(this._bufs.shift(), this._lens.shift()), this.sync)
    try {
      const t = j.writeSync(this.fd, this._writingBuf);
      e(null, t);
    } catch (t) {
      e(t);
    }
  else
    _i && (this._writingBuf = Buffer.from(this._writingBuf)), j.write(this.fd, this._writingBuf, e);
}
function Le(e) {
  if (e.fd === -1) {
    e.once("ready", Le.bind(null, e));
    return;
  }
  e._periodicFlushTimer !== void 0 && clearInterval(e._periodicFlushTimer), e.destroyed = !0, e._bufs = [], e._lens = [], Si(typeof e.fd == "number", `sonic.fd must be a number, got ${typeof e.fd}`);
  try {
    j.fsync(e.fd, t);
  } catch {
  }
  function t() {
    e.fd !== 1 && e.fd !== 2 ? j.close(e.fd, n) : n();
  }
  function n(r) {
    if (r) {
      e.emit("error", r);
      return;
    }
    e._ending && !e._writing && e.emit("finish"), e.emit("close");
  }
}
q.SonicBoom = q;
q.default = q;
var Bi = q;
const G = {
  exit: [],
  beforeExit: []
}, un = {
  exit: Ii,
  beforeExit: Ri
};
let oe;
function Pi() {
  oe === void 0 && (oe = new FinalizationRegistry(Ni));
}
function ji(e) {
  G[e].length > 0 || process.on(e, un[e]);
}
function cn(e) {
  G[e].length > 0 || (process.removeListener(e, un[e]), G.exit.length === 0 && G.beforeExit.length === 0 && (oe = void 0));
}
function Ii() {
  an("exit");
}
function Ri() {
  an("beforeExit");
}
function an(e) {
  for (const t of G[e]) {
    const n = t.deref(), r = t.fn;
    n !== void 0 && r(n, e);
  }
  G[e] = [];
}
function Ni(e) {
  for (const t of ["exit", "beforeExit"]) {
    const n = G[t].indexOf(e);
    G[t].splice(n, n + 1), cn(t);
  }
}
function hn(e, t, n) {
  if (t === void 0)
    throw new Error("the object can't be undefined");
  ji(e);
  const r = new WeakRef(t);
  r.fn = n, Pi(), oe.register(t, r), G[e].push(r);
}
function Di(e, t) {
  hn("exit", e, t);
}
function Fi(e, t) {
  hn("beforeExit", e, t);
}
function Wi(e) {
  if (oe !== void 0) {
    oe.unregister(e);
    for (const t of ["exit", "beforeExit"])
      G[t] = G[t].filter((n) => {
        const r = n.deref();
        return r && r !== e;
      }), cn(t);
  }
}
var dn = {
  register: Di,
  registerBeforeExit: Fi,
  unregister: Wi
};
const zi = "3.1.0", Vi = {
  version: zi
}, St = 1e3;
function Ki(e, t, n, r, i) {
  const s = Date.now() + r;
  let u = Atomics.load(e, t);
  if (u === n) {
    i(null, "ok");
    return;
  }
  let d = u;
  const o = (c) => {
    Date.now() > s ? i(null, "timed-out") : setTimeout(() => {
      d = u, u = Atomics.load(e, t), u === d ? o(c >= St ? St : c * 2) : u === n ? i(null, "ok") : i(null, "not-equal");
    }, c);
  };
  o(1);
}
var Mi = { wait: Ki };
const Ui = 4, Ji = 8;
var Gi = {
  WRITE_INDEX: Ui,
  READ_INDEX: Ji
};
const { version: qi } = Vi, { EventEmitter: Hi } = Rt, { Worker: Xi } = Ft, { join: Yi } = Nt, { pathToFileURL: Qi } = Jn, { wait: Zi } = Mi, {
  WRITE_INDEX: K,
  READ_INDEX: Q
} = Gi, es = Gn, ts = Dt, f = Symbol("kImpl"), ns = es.constants.MAX_STRING_LENGTH;
class qe {
  constructor(t) {
    this._value = t;
  }
  deref() {
    return this._value;
  }
}
class bt {
  register() {
  }
  unregister() {
  }
}
const rs = process.env.NODE_V8_COVERAGE ? bt : Wt.FinalizationRegistry || bt, is = process.env.NODE_V8_COVERAGE ? qe : Wt.WeakRef || qe, yn = new rs((e) => {
  e.exited || e.terminate();
});
function ss(e, t) {
  const { filename: n, workerData: r } = t, s = ("__bundlerPathsOverrides" in globalThis ? globalThis.__bundlerPathsOverrides : {})["thread-stream-worker"] || Yi(__dirname, "lib", "worker.js"), u = new Xi(s, {
    ...t.workerOpts,
    trackUnmanagedFds: !1,
    workerData: {
      filename: n.indexOf("file://") === 0 ? n : Qi(n).href,
      dataBuf: e[f].dataBuf,
      stateBuf: e[f].stateBuf,
      workerData: {
        $context: {
          threadStreamVersion: qi
        },
        ...r
      }
    }
  });
  return u.stream = new qe(e), u.on("message", os), u.on("exit", gn), yn.register(e, u), u;
}
function mn(e) {
  ts(!e[f].sync), e[f].needDrain && (e[f].needDrain = !1, e.emit("drain"));
}
function be(e) {
  const t = Atomics.load(e[f].state, K);
  let n = e[f].data.length - t;
  if (n > 0) {
    if (e[f].buf.length === 0) {
      e[f].flushing = !1, e[f].ending ? it(e) : e[f].needDrain && process.nextTick(mn, e);
      return;
    }
    let r = e[f].buf.slice(0, n), i = Buffer.byteLength(r);
    i <= n ? (e[f].buf = e[f].buf.slice(n), Ee(e, r, be.bind(null, e))) : e.flush(() => {
      if (!e.destroyed) {
        for (Atomics.store(e[f].state, Q, 0), Atomics.store(e[f].state, K, 0); i > e[f].data.length; )
          n = n / 2, r = e[f].buf.slice(0, n), i = Buffer.byteLength(r);
        e[f].buf = e[f].buf.slice(n), Ee(e, r, be.bind(null, e));
      }
    });
  } else if (n === 0) {
    if (t === 0 && e[f].buf.length === 0)
      return;
    e.flush(() => {
      Atomics.store(e[f].state, Q, 0), Atomics.store(e[f].state, K, 0), be(e);
    });
  } else
    Z(e, new Error("overwritten"));
}
function os(e) {
  const t = this.stream.deref();
  if (t === void 0) {
    this.exited = !0, this.terminate();
    return;
  }
  switch (e.code) {
    case "READY":
      this.stream = new is(t), t.flush(() => {
        t[f].ready = !0, t.emit("ready");
      });
      break;
    case "ERROR":
      Z(t, e.err);
      break;
    case "EVENT":
      Array.isArray(e.args) ? t.emit(e.name, ...e.args) : t.emit(e.name, e.args);
      break;
    case "WARNING":
      process.emitWarning(e.err);
      break;
    default:
      Z(t, new Error("this should not happen: " + e.code));
  }
}
function gn(e) {
  const t = this.stream.deref();
  t !== void 0 && (yn.unregister(t), t.worker.exited = !0, t.worker.off("exit", gn), Z(t, e !== 0 ? new Error("the worker thread exited") : null));
}
let fs = class extends Hi {
  constructor(t = {}) {
    if (super(), t.bufferSize < 4)
      throw new Error("bufferSize must at least fit a 4-byte utf-8 char");
    this[f] = {}, this[f].stateBuf = new SharedArrayBuffer(128), this[f].state = new Int32Array(this[f].stateBuf), this[f].dataBuf = new SharedArrayBuffer(t.bufferSize || 4 * 1024 * 1024), this[f].data = Buffer.from(this[f].dataBuf), this[f].sync = t.sync || !1, this[f].ending = !1, this[f].ended = !1, this[f].needDrain = !1, this[f].destroyed = !1, this[f].flushing = !1, this[f].ready = !1, this[f].finished = !1, this[f].errored = null, this[f].closed = !1, this[f].buf = "", this.worker = ss(this, t), this.on("message", (n, r) => {
      this.worker.postMessage(n, r);
    });
  }
  write(t) {
    if (this[f].destroyed)
      return He(this, new Error("the worker has exited")), !1;
    if (this[f].ending)
      return He(this, new Error("the worker is ending")), !1;
    if (this[f].flushing && this[f].buf.length + t.length >= ns)
      try {
        Pe(this), this[f].flushing = !0;
      } catch (n) {
        return Z(this, n), !1;
      }
    if (this[f].buf += t, this[f].sync)
      try {
        return Pe(this), !0;
      } catch (n) {
        return Z(this, n), !1;
      }
    return this[f].flushing || (this[f].flushing = !0, setImmediate(be, this)), this[f].needDrain = this[f].data.length - this[f].buf.length - Atomics.load(this[f].state, K) <= 0, !this[f].needDrain;
  }
  end() {
    this[f].destroyed || (this[f].ending = !0, it(this));
  }
  flush(t) {
    if (this[f].destroyed) {
      typeof t == "function" && process.nextTick(t, new Error("the worker has exited"));
      return;
    }
    const n = Atomics.load(this[f].state, K);
    Zi(this[f].state, Q, n, 1 / 0, (r, i) => {
      if (r) {
        Z(this, r), process.nextTick(t, r);
        return;
      }
      if (i === "not-equal") {
        this.flush(t);
        return;
      }
      process.nextTick(t);
    });
  }
  flushSync() {
    this[f].destroyed || (Pe(this), Xe(this));
  }
  unref() {
    this.worker.unref();
  }
  ref() {
    this.worker.ref();
  }
  get ready() {
    return this[f].ready;
  }
  get destroyed() {
    return this[f].destroyed;
  }
  get closed() {
    return this[f].closed;
  }
  get writable() {
    return !this[f].destroyed && !this[f].ending;
  }
  get writableEnded() {
    return this[f].ending;
  }
  get writableFinished() {
    return this[f].finished;
  }
  get writableNeedDrain() {
    return this[f].needDrain;
  }
  get writableObjectMode() {
    return !1;
  }
  get writableErrored() {
    return this[f].errored;
  }
};
function He(e, t) {
  setImmediate(() => {
    e.emit("error", t);
  });
}
function Z(e, t) {
  e[f].destroyed || (e[f].destroyed = !0, t && (e[f].errored = t, He(e, t)), e.worker.exited ? setImmediate(() => {
    e[f].closed = !0, e.emit("close");
  }) : e.worker.terminate().catch(() => {
  }).then(() => {
    e[f].closed = !0, e.emit("close");
  }));
}
function Ee(e, t, n) {
  const r = Atomics.load(e[f].state, K), i = Buffer.byteLength(t);
  return e[f].data.write(t, r), Atomics.store(e[f].state, K, r + i), Atomics.notify(e[f].state, K), n(), !0;
}
function it(e) {
  if (!(e[f].ended || !e[f].ending || e[f].flushing)) {
    e[f].ended = !0;
    try {
      e.flushSync();
      let t = Atomics.load(e[f].state, Q);
      Atomics.store(e[f].state, K, -1), Atomics.notify(e[f].state, K);
      let n = 0;
      for (; t !== -1; ) {
        if (Atomics.wait(e[f].state, Q, t, 1e3), t = Atomics.load(e[f].state, Q), t === -2) {
          Z(e, new Error("end() failed"));
          return;
        }
        if (++n === 10) {
          Z(e, new Error("end() took too long (10s)"));
          return;
        }
      }
      process.nextTick(() => {
        e[f].finished = !0, e.emit("finish");
      });
    } catch (t) {
      Z(e, t);
    }
  }
}
function Pe(e) {
  const t = () => {
    e[f].ending ? it(e) : e[f].needDrain && process.nextTick(mn, e);
  };
  for (e[f].flushing = !1; e[f].buf.length !== 0; ) {
    const n = Atomics.load(e[f].state, K);
    let r = e[f].data.length - n;
    if (r === 0) {
      Xe(e), Atomics.store(e[f].state, Q, 0), Atomics.store(e[f].state, K, 0);
      continue;
    } else if (r < 0)
      throw new Error("overwritten");
    let i = e[f].buf.slice(0, r), s = Buffer.byteLength(i);
    if (s <= r)
      e[f].buf = e[f].buf.slice(r), Ee(e, i, t);
    else {
      for (Xe(e), Atomics.store(e[f].state, Q, 0), Atomics.store(e[f].state, K, 0); s > e[f].buf.length; )
        r = r / 2, i = e[f].buf.slice(0, r), s = Buffer.byteLength(i);
      e[f].buf = e[f].buf.slice(r), Ee(e, i, t);
    }
  }
}
function Xe(e) {
  if (e[f].flushing)
    throw new Error("unable to flush while flushing");
  const t = Atomics.load(e[f].state, K);
  let n = 0;
  for (; ; ) {
    const r = Atomics.load(e[f].state, Q);
    if (r === -2)
      throw Error("_flushSync failed");
    if (r !== t)
      Atomics.wait(e[f].state, Q, r, 1e3);
    else
      break;
    if (++n === 10)
      throw new Error("_flushSync took too long (10s)");
  }
}
var ls = fs;
const { createRequire: us } = Mn, cs = Qt, { join: je, isAbsolute: as, sep: hs } = Un, ds = sn, Ie = dn, ys = ls;
function ms(e) {
  Ie.register(e, ps), Ie.registerBeforeExit(e, Ss), e.on("close", function() {
    Ie.unregister(e);
  });
}
function gs(e, t, n, r) {
  const i = new ys({
    filename: e,
    workerData: t,
    workerOpts: n,
    sync: r
  });
  i.on("ready", s), i.on("close", function() {
    process.removeListener("exit", u);
  }), process.on("exit", u);
  function s() {
    process.removeListener("exit", u), i.unref(), n.autoEnd !== !1 && ms(i);
  }
  function u() {
    i.closed || (i.flushSync(), ds(100), i.end());
  }
  return i;
}
function ps(e) {
  e.ref(), e.flushSync(), e.end(), e.once("close", function() {
    e.unref();
  });
}
function Ss(e) {
  e.flushSync();
}
function bs(e) {
  const { pipeline: t, targets: n, levels: r, dedupe: i, worker: s = {}, caller: u = cs(), sync: d = !1 } = e, o = {
    ...e.options
  }, c = typeof u == "string" ? [u] : u, l = "__bundlerPathsOverrides" in globalThis ? globalThis.__bundlerPathsOverrides : {};
  let y = e.target;
  if (y && n)
    throw new Error("only one of target or targets can be specified");
  return n ? (y = l["pino-worker"] || je(__dirname, "worker.js"), o.targets = n.filter((g) => g.target).map((g) => ({
    ...g,
    target: b(g.target)
  })), o.pipelines = n.filter((g) => g.pipeline).map((g) => g.pipeline.map((p) => ({
    ...p,
    level: g.level,
    // duplicate the pipeline `level` property defined in the upper level
    target: b(p.target)
  })))) : t && (y = l["pino-worker"] || je(__dirname, "worker.js"), o.pipelines = [t.map((g) => ({
    ...g,
    target: b(g.target)
  }))]), r && (o.levels = r), i && (o.dedupe = i), o.pinoWillSendConfig = !0, gs(b(y), o, s, d);
  function b(g) {
    if (g = l[g] || g, as(g) || g.indexOf("file://") === 0)
      return g;
    if (g === "pino/file")
      return je(__dirname, "..", "file.js");
    let p;
    for (const B of c)
      try {
        const P = B === "node:repl" ? process.cwd() + hs : B;
        p = us(P).resolve(g);
        break;
      } catch {
        continue;
      }
    if (!p)
      throw new Error(`unable to determine transport target for "${g}"`);
    return p;
  }
}
var pn = bs;
const wt = zn, $t = yi, { mapHttpRequest: ws, mapHttpResponse: $s } = Yt, Ye = Bi, _t = dn, {
  lsCacheSym: _s,
  chindingsSym: Sn,
  writeSym: Et,
  serializersSym: bn,
  formatOptsSym: vt,
  endSym: Es,
  stringifiersSym: wn,
  stringifySym: $n,
  stringifySafeSym: st,
  wildcardFirstSym: _n,
  nestedKeySym: vs,
  formattersSym: En,
  messageKeySym: Os,
  errorKeySym: xs,
  nestedKeyStrSym: Ls,
  msgPrefixSym: me
} = ue, { isMainThread: As } = Ft, Cs = pn;
let ve;
typeof wt.tracingChannel == "function" ? ve = wt.tracingChannel("pino_asJson") : ve = {
  hasSubscribers: !1,
  traceSync(e, t, n, ...r) {
    return e.call(n, ...r);
  }
};
function se() {
}
function Ts(e, t) {
  if (!t) return n;
  return function(...i) {
    t.call(this, i, n, e);
  };
  function n(r, ...i) {
    if (typeof r == "object") {
      let s = r;
      r !== null && (r.method && r.headers && r.socket ? r = ws(r) : typeof r.setHeader == "function" && (r = $s(r)));
      let u;
      s === null && i.length === 0 ? u = [null] : (s = i.shift(), u = i), typeof this[me] == "string" && s !== void 0 && s !== null && (s = this[me] + s), this[Et](r, $t(s, u, this[vt]), e);
    } else {
      let s = r === void 0 ? i.shift() : r;
      typeof this[me] == "string" && s !== void 0 && s !== null && (s = this[me] + s), this[Et](null, $t(s, i, this[vt]), e);
    }
  }
}
function Re(e) {
  let t = "", n = 0, r = !1, i = 255;
  const s = e.length;
  if (s > 100)
    return JSON.stringify(e);
  for (var u = 0; u < s && i >= 32; u++)
    i = e.charCodeAt(u), (i === 34 || i === 92) && (t += e.slice(n, u) + "\\", n = u, r = !0);
  return r ? t += e.slice(n) : t = e, i < 32 ? JSON.stringify(e) : '"' + t + '"';
}
function ks(e, t, n, r) {
  if (ve.hasSubscribers === !1)
    return Ot.call(this, e, t, n, r);
  const i = { instance: this, arguments };
  return ve.traceSync(Ot, i, this, e, t, n, r);
}
function Ot(e, t, n, r) {
  const i = this[$n], s = this[st], u = this[wn], d = this[Es], o = this[Sn], c = this[bn], l = this[En], y = this[Os], b = this[xs];
  let g = this[_s][n] + r;
  g = g + o;
  let p;
  l.log && (e = l.log(e));
  const B = u[_n];
  let P = "";
  for (const m in e)
    if (p = e[m], Object.prototype.hasOwnProperty.call(e, m) && p !== void 0) {
      c[m] ? p = c[m](p) : m === b && c.err && (p = c.err(p));
      const h = u[m] || B;
      switch (typeof p) {
        case "undefined":
        case "function":
          continue;
        case "number":
          Number.isFinite(p) === !1 && (p = null);
        case "boolean":
          h && (p = h(p));
          break;
        case "string":
          p = (h || Re)(p);
          break;
        default:
          p = (h || i)(p, s);
      }
      if (p === void 0) continue;
      const S = Re(m);
      P += "," + S + ":" + p;
    }
  let F = "";
  if (t !== void 0) {
    p = c[y] ? c[y](t) : t;
    const m = u[y] || B;
    switch (typeof p) {
      case "function":
        break;
      case "number":
        Number.isFinite(p) === !1 && (p = null);
      case "boolean":
        m && (p = m(p)), F = ',"' + y + '":' + p;
        break;
      case "string":
        p = (m || Re)(p), F = ',"' + y + '":' + p;
        break;
      default:
        p = (m || i)(p, s), F = ',"' + y + '":' + p;
    }
  }
  return this[vs] && P ? g + this[Ls] + P.slice(1) + "}" + F + d : g + P + F + d;
}
function Bs(e, t) {
  let n, r = e[Sn];
  const i = e[$n], s = e[st], u = e[wn], d = u[_n], o = e[bn], c = e[En].bindings;
  t = c(t);
  for (const l in t)
    if (n = t[l], ((l.length < 5 || l !== "level" && l !== "serializers" && l !== "formatters" && l !== "customLevels") && t.hasOwnProperty(l) && n !== void 0) === !0) {
      if (n = o[l] ? o[l](n) : n, n = (u[l] || d || i)(n, s), n === void 0) continue;
      r += ',"' + l + '":' + n;
    }
  return r;
}
function Ps(e) {
  return e.write !== e.constructor.prototype.write;
}
function we(e) {
  const t = new Ye(e);
  return t.on("error", n), !e.sync && As && (_t.register(t, js), t.on("close", function() {
    _t.unregister(t);
  })), t;
  function n(r) {
    if (r.code === "EPIPE") {
      t.write = se, t.end = se, t.flushSync = se, t.destroy = se;
      return;
    }
    t.removeListener("error", n), t.emit("error", r);
  }
}
function js(e, t) {
  e.destroyed || (t === "beforeExit" ? (e.flush(), e.on("drain", function() {
    e.end();
  })) : e.flushSync());
}
function Is(e) {
  return function(n, r, i = {}, s) {
    if (typeof i == "string")
      s = we({ dest: i }), i = {};
    else if (typeof s == "string") {
      if (i && i.transport)
        throw Error("only one of option.transport or stream can be specified");
      s = we({ dest: s });
    } else if (i instanceof Ye || i.writable || i._writableState)
      s = i, i = {};
    else if (i.transport) {
      if (i.transport instanceof Ye || i.transport.writable || i.transport._writableState)
        throw Error("option.transport do not allow stream, please pass to option directly. e.g. pino(transport)");
      if (i.transport.targets && i.transport.targets.length && i.formatters && typeof i.formatters.level == "function")
        throw Error("option.transport.targets do not allow custom level formatters");
      let o;
      i.customLevels && (o = i.useOnlyCustomLevels ? i.customLevels : Object.assign({}, i.levels, i.customLevels)), s = Cs({ caller: r, ...i.transport, levels: o });
    }
    if (i = Object.assign({}, e, i), i.serializers = Object.assign({}, e.serializers, i.serializers), i.formatters = Object.assign({}, e.formatters, i.formatters), i.prettyPrint)
      throw new Error("prettyPrint option is no longer supported, see the pino-pretty package (https://github.com/pinojs/pino-pretty)");
    const { enabled: u, onChild: d } = i;
    return u === !1 && (i.level = "silent"), d || (i.onChild = se), s || (Ps(process.stdout) ? s = process.stdout : s = we({ fd: process.stdout.fd || 1 })), { opts: i, stream: s };
  };
}
function Rs(e, t) {
  try {
    return JSON.stringify(e);
  } catch {
    try {
      return (t || this[st])(e);
    } catch {
      return '"[unable to serialize, circular reference is too complex to analyze]"';
    }
  }
}
function Ns(e, t, n) {
  return {
    level: e,
    bindings: t,
    log: n
  };
}
function Ds(e) {
  const t = Number(e);
  return typeof e == "string" && Number.isFinite(t) ? t : e === void 0 ? 1 : e;
}
var ot = {
  noop: se,
  buildSafeSonicBoom: we,
  asChindings: Bs,
  asJson: ks,
  genLog: Ts,
  createArgsNormalizer: Is,
  stringify: Rs,
  buildFormatters: Ns,
  normalizeDestFileDescriptor: Ds
};
const Fs = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60
}, Ws = {
  ASC: "ASC",
  DESC: "DESC"
};
var ft = {
  DEFAULT_LEVELS: Fs,
  SORTING_ORDER: Ws
};
const {
  lsCacheSym: zs,
  levelValSym: Qe,
  useOnlyCustomLevelsSym: Vs,
  streamSym: Ks,
  formattersSym: Ms,
  hooksSym: Us,
  levelCompSym: vn
} = ue, { noop: Js, genLog: ie } = ot, { DEFAULT_LEVELS: Y, SORTING_ORDER: On } = ft, Gs = {
  fatal: (e) => {
    const t = ie(Y.fatal, e);
    return function(...n) {
      const r = this[Ks];
      if (t.call(this, ...n), typeof r.flushSync == "function")
        try {
          r.flushSync();
        } catch {
        }
    };
  },
  error: (e) => ie(Y.error, e),
  warn: (e) => ie(Y.warn, e),
  info: (e) => ie(Y.info, e),
  debug: (e) => ie(Y.debug, e),
  trace: (e) => ie(Y.trace, e)
}, lt = Object.keys(Y).reduce((e, t) => (e[Y[t]] = t, e), {}), qs = Object.keys(lt).reduce((e, t) => (e[t] = '{"level":' + Number(t), e), {});
function Hs(e) {
  const t = e[Ms].level, { labels: n } = e.levels, r = {};
  for (const i in n) {
    const s = t(n[i], Number(i));
    r[i] = JSON.stringify(s).slice(0, -1);
  }
  return e[zs] = r, e;
}
function Xs(e, t) {
  if (t)
    return !1;
  switch (e) {
    case "fatal":
    case "error":
    case "warn":
    case "info":
    case "debug":
    case "trace":
      return !0;
    default:
      return !1;
  }
}
function Ys(e) {
  const { labels: t, values: n } = this.levels;
  if (typeof e == "number") {
    if (t[e] === void 0) throw Error("unknown level value" + e);
    e = t[e];
  }
  if (n[e] === void 0) throw Error("unknown level " + e);
  const r = this[Qe], i = this[Qe] = n[e], s = this[Vs], u = this[vn], d = this[Us].logMethod;
  for (const o in n) {
    if (u(n[o], i) === !1) {
      this[o] = Js;
      continue;
    }
    this[o] = Xs(o, s) ? Gs[o](d) : ie(n[o], d);
  }
  this.emit(
    "level-change",
    e,
    i,
    t[r],
    r,
    this
  );
}
function Qs(e) {
  const { levels: t, levelVal: n } = this;
  return t && t.labels ? t.labels[n] : "";
}
function Zs(e) {
  const { values: t } = this.levels, n = t[e];
  return n !== void 0 && this[vn](n, this[Qe]);
}
function eo(e, t, n) {
  return e === On.DESC ? t <= n : t >= n;
}
function to(e) {
  return typeof e == "string" ? eo.bind(null, e) : e;
}
function no(e = null, t = !1) {
  const n = e ? Object.keys(e).reduce((s, u) => (s[e[u]] = u, s), {}) : null, r = Object.assign(
    Object.create(Object.prototype, { Infinity: { value: "silent" } }),
    t ? null : lt,
    n
  ), i = Object.assign(
    Object.create(Object.prototype, { silent: { value: 1 / 0 } }),
    t ? null : Y,
    e
  );
  return { labels: r, values: i };
}
function ro(e, t, n) {
  if (typeof e == "number") {
    if (![].concat(
      Object.keys(t || {}).map((s) => t[s]),
      n ? [] : Object.keys(lt).map((s) => +s),
      1 / 0
    ).includes(e))
      throw Error(`default level:${e} must be included in custom levels`);
    return;
  }
  const r = Object.assign(
    Object.create(Object.prototype, { silent: { value: 1 / 0 } }),
    n ? null : Y,
    t
  );
  if (!(e in r))
    throw Error(`default level:${e} must be included in custom levels`);
}
function io(e, t) {
  const { labels: n, values: r } = e;
  for (const i in t) {
    if (i in r)
      throw Error("levels cannot be overridden");
    if (t[i] in n)
      throw Error("pre-existing level values cannot be used for new levels");
  }
}
function so(e) {
  if (typeof e != "function" && !(typeof e == "string" && Object.values(On).includes(e)))
    throw new Error('Levels comparison should be one of "ASC", "DESC" or "function" type');
}
var xn = {
  initialLsCache: qs,
  genLsCache: Hs,
  getLevel: Qs,
  setLevel: Ys,
  isLevelEnabled: Zs,
  mappings: no,
  assertNoLevelCollisions: io,
  assertDefaultLevelFound: ro,
  genLevelComparison: to,
  assertLevelComparison: so
}, Ln = { version: "9.14.0" };
const { EventEmitter: oo } = Fn, {
  lsCacheSym: fo,
  levelValSym: lo,
  setLevelSym: Oe,
  getLevelSym: xt,
  chindingsSym: xe,
  parsedChindingsSym: uo,
  mixinSym: co,
  asJsonSym: An,
  writeSym: ao,
  mixinMergeStrategySym: ho,
  timeSym: yo,
  timeSliceIndexSym: mo,
  streamSym: Cn,
  serializersSym: re,
  formattersSym: fe,
  errorKeySym: go,
  messageKeySym: po,
  useOnlyCustomLevelsSym: So,
  needsMetadataGsym: bo,
  redactFmtSym: wo,
  stringifySym: $o,
  formatOptsSym: _o,
  stringifiersSym: Eo,
  msgPrefixSym: Ze,
  hooksSym: vo
} = ue, {
  getLevel: Oo,
  setLevel: xo,
  isLevelEnabled: Lo,
  mappings: Ao,
  initialLsCache: Co,
  genLsCache: To,
  assertNoLevelCollisions: ko
} = xn, {
  asChindings: et,
  asJson: Bo,
  buildFormatters: Ne,
  stringify: Lt,
  noop: Tn
} = ot, {
  version: Po
} = Ln, jo = rn, Io = class {
}, kn = {
  constructor: Io,
  child: No,
  bindings: Do,
  setBindings: Fo,
  flush: Vo,
  isLevelEnabled: Lo,
  version: Po,
  get level() {
    return this[xt]();
  },
  set level(e) {
    this[Oe](e);
  },
  get levelVal() {
    return this[lo];
  },
  set levelVal(e) {
    throw Error("levelVal is read-only");
  },
  get msgPrefix() {
    return this[Ze];
  },
  get [Symbol.toStringTag]() {
    return "Pino";
  },
  [fo]: Co,
  [ao]: zo,
  [An]: Bo,
  [xt]: Oo,
  [Oe]: xo
};
Object.setPrototypeOf(kn, oo.prototype);
var Ro = function() {
  return Object.create(kn);
};
const ge = (e) => e;
function No(e, t) {
  if (!e)
    throw Error("missing bindings for child Pino");
  const n = this[re], r = this[fe], i = Object.create(this);
  if (t == null)
    return i[fe].bindings !== ge && (i[fe] = Ne(
      r.level,
      ge,
      r.log
    )), i[xe] = et(i, e), i[Oe](this.level), this.onChild !== Tn && this.onChild(i), i;
  if (t.hasOwnProperty("serializers") === !0) {
    i[re] = /* @__PURE__ */ Object.create(null);
    for (const l in n)
      i[re][l] = n[l];
    const o = Object.getOwnPropertySymbols(n);
    for (var s = 0; s < o.length; s++) {
      const l = o[s];
      i[re][l] = n[l];
    }
    for (const l in t.serializers)
      i[re][l] = t.serializers[l];
    const c = Object.getOwnPropertySymbols(t.serializers);
    for (var u = 0; u < c.length; u++) {
      const l = c[u];
      i[re][l] = t.serializers[l];
    }
  } else i[re] = n;
  if (t.hasOwnProperty("formatters")) {
    const { level: o, bindings: c, log: l } = t.formatters;
    i[fe] = Ne(
      o || r.level,
      c || ge,
      l || r.log
    );
  } else
    i[fe] = Ne(
      r.level,
      ge,
      r.log
    );
  if (t.hasOwnProperty("customLevels") === !0 && (ko(this.levels, t.customLevels), i.levels = Ao(t.customLevels, i[So]), To(i)), typeof t.redact == "object" && t.redact !== null || Array.isArray(t.redact)) {
    i.redact = t.redact;
    const o = jo(i.redact, Lt), c = { stringify: o[wo] };
    i[$o] = Lt, i[Eo] = o, i[_o] = c;
  }
  typeof t.msgPrefix == "string" && (i[Ze] = (this[Ze] || "") + t.msgPrefix), i[xe] = et(i, e);
  const d = t.level || this.level;
  return i[Oe](d), this.onChild(i), i;
}
function Do() {
  const t = `{${this[xe].substr(1)}}`, n = JSON.parse(t);
  return delete n.pid, delete n.hostname, n;
}
function Fo(e) {
  const t = et(this, e);
  this[xe] = t, delete this[uo];
}
function Wo(e, t) {
  return Object.assign(t, e);
}
function zo(e, t, n) {
  const r = this[yo](), i = this[co], s = this[go], u = this[po], d = this[ho] || Wo;
  let o;
  const c = this[vo].streamWrite;
  e == null ? o = {} : e instanceof Error ? (o = { [s]: e }, t === void 0 && (t = e.message)) : (o = e, t === void 0 && e[u] === void 0 && e[s] && (t = e[s].message)), i && (o = d(o, i(o, n, this)));
  const l = this[An](o, t, n, r), y = this[Cn];
  y[bo] === !0 && (y.lastLevel = n, y.lastObj = o, y.lastMsg = t, y.lastTime = r.slice(this[mo]), y.lastLogger = this), y.write(c ? c(l) : l);
}
function Vo(e) {
  if (e != null && typeof e != "function")
    throw Error("callback must be a function");
  const t = this[Cn];
  typeof t.flush == "function" ? t.flush(e || Tn) : e && e();
}
var tt = { exports: {} };
(function(e, t) {
  const { hasOwnProperty: n } = Object.prototype, r = F();
  r.configure = F, r.stringify = r, r.default = r, t.stringify = r, t.configure = F, e.exports = r;
  const i = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
  function s(m) {
    return m.length < 5e3 && !i.test(m) ? `"${m}"` : JSON.stringify(m);
  }
  function u(m, h) {
    if (m.length > 200 || h)
      return m.sort(h);
    for (let S = 1; S < m.length; S++) {
      const L = m[S];
      let C = S;
      for (; C !== 0 && m[C - 1] > L; )
        m[C] = m[C - 1], C--;
      m[C] = L;
    }
    return m;
  }
  const d = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(
      Object.getPrototypeOf(
        new Int8Array()
      )
    ),
    Symbol.toStringTag
  ).get;
  function o(m) {
    return d.call(m) !== void 0 && m.length !== 0;
  }
  function c(m, h, S) {
    m.length < S && (S = m.length);
    const L = h === "," ? "" : " ";
    let C = `"0":${L}${m[0]}`;
    for (let W = 1; W < S; W++)
      C += `${h}"${W}":${L}${m[W]}`;
    return C;
  }
  function l(m) {
    if (n.call(m, "circularValue")) {
      const h = m.circularValue;
      if (typeof h == "string")
        return `"${h}"`;
      if (h == null)
        return h;
      if (h === Error || h === TypeError)
        return {
          toString() {
            throw new TypeError("Converting circular structure to JSON");
          }
        };
      throw new TypeError('The "circularValue" argument must be of type string or the value null or undefined');
    }
    return '"[Circular]"';
  }
  function y(m) {
    let h;
    if (n.call(m, "deterministic") && (h = m.deterministic, typeof h != "boolean" && typeof h != "function"))
      throw new TypeError('The "deterministic" argument must be of type boolean or comparator function');
    return h === void 0 ? !0 : h;
  }
  function b(m, h) {
    let S;
    if (n.call(m, h) && (S = m[h], typeof S != "boolean"))
      throw new TypeError(`The "${h}" argument must be of type boolean`);
    return S === void 0 ? !0 : S;
  }
  function g(m, h) {
    let S;
    if (n.call(m, h)) {
      if (S = m[h], typeof S != "number")
        throw new TypeError(`The "${h}" argument must be of type number`);
      if (!Number.isInteger(S))
        throw new TypeError(`The "${h}" argument must be an integer`);
      if (S < 1)
        throw new RangeError(`The "${h}" argument must be >= 1`);
    }
    return S === void 0 ? 1 / 0 : S;
  }
  function p(m) {
    return m === 1 ? "1 item" : `${m} items`;
  }
  function B(m) {
    const h = /* @__PURE__ */ new Set();
    for (const S of m)
      (typeof S == "string" || typeof S == "number") && h.add(String(S));
    return h;
  }
  function P(m) {
    if (n.call(m, "strict")) {
      const h = m.strict;
      if (typeof h != "boolean")
        throw new TypeError('The "strict" argument must be of type boolean');
      if (h)
        return (S) => {
          let L = `Object can not safely be stringified. Received type ${typeof S}`;
          throw typeof S != "function" && (L += ` (${S.toString()})`), new Error(L);
        };
    }
  }
  function F(m) {
    m = { ...m };
    const h = P(m);
    h && (m.bigint === void 0 && (m.bigint = !1), "circularValue" in m || (m.circularValue = Error));
    const S = l(m), L = b(m, "bigint"), C = y(m), W = typeof C == "function" ? C : void 0, T = g(m, "maximumDepth"), v = g(m, "maximumBreadth");
    function ee(N, a, w, E, _, x) {
      let $ = a[N];
      switch (typeof $ == "object" && $ !== null && typeof $.toJSON == "function" && ($ = $.toJSON(N)), $ = E.call(a, N, $), typeof $) {
        case "string":
          return s($);
        case "object": {
          if ($ === null)
            return "null";
          if (w.indexOf($) !== -1)
            return S;
          let O = "", I = ",";
          const R = x;
          if (Array.isArray($)) {
            if ($.length === 0)
              return "[]";
            if (T < w.length + 1)
              return '"[Array]"';
            w.push($), _ !== "" && (x += _, O += `
${x}`, I = `,
${x}`);
            const V = Math.min($.length, v);
            let H = 0;
            for (; H < V - 1; H++) {
              const ce = ee(String(H), $, w, E, _, x);
              O += ce !== void 0 ? ce : "null", O += I;
            }
            const X = ee(String(H), $, w, E, _, x);
            if (O += X !== void 0 ? X : "null", $.length - 1 > v) {
              const ce = $.length - v - 1;
              O += `${I}"... ${p(ce)} not stringified"`;
            }
            return _ !== "" && (O += `
${R}`), w.pop(), `[${O}]`;
          }
          let k = Object.keys($);
          const D = k.length;
          if (D === 0)
            return "{}";
          if (T < w.length + 1)
            return '"[Object]"';
          let A = "", z = "";
          _ !== "" && (x += _, I = `,
${x}`, A = " ");
          const J = Math.min(D, v);
          C && !o($) && (k = u(k, W)), w.push($);
          for (let V = 0; V < J; V++) {
            const H = k[V], X = ee(H, $, w, E, _, x);
            X !== void 0 && (O += `${z}${s(H)}:${A}${X}`, z = I);
          }
          if (D > v) {
            const V = D - v;
            O += `${z}"...":${A}"${p(V)} not stringified"`, z = I;
          }
          return _ !== "" && z.length > 1 && (O = `
${x}${O}
${R}`), w.pop(), `{${O}}`;
        }
        case "number":
          return isFinite($) ? String($) : h ? h($) : "null";
        case "boolean":
          return $ === !0 ? "true" : "false";
        case "undefined":
          return;
        case "bigint":
          if (L)
            return String($);
        default:
          return h ? h($) : void 0;
      }
    }
    function te(N, a, w, E, _, x) {
      switch (typeof a == "object" && a !== null && typeof a.toJSON == "function" && (a = a.toJSON(N)), typeof a) {
        case "string":
          return s(a);
        case "object": {
          if (a === null)
            return "null";
          if (w.indexOf(a) !== -1)
            return S;
          const $ = x;
          let O = "", I = ",";
          if (Array.isArray(a)) {
            if (a.length === 0)
              return "[]";
            if (T < w.length + 1)
              return '"[Array]"';
            w.push(a), _ !== "" && (x += _, O += `
${x}`, I = `,
${x}`);
            const D = Math.min(a.length, v);
            let A = 0;
            for (; A < D - 1; A++) {
              const J = te(String(A), a[A], w, E, _, x);
              O += J !== void 0 ? J : "null", O += I;
            }
            const z = te(String(A), a[A], w, E, _, x);
            if (O += z !== void 0 ? z : "null", a.length - 1 > v) {
              const J = a.length - v - 1;
              O += `${I}"... ${p(J)} not stringified"`;
            }
            return _ !== "" && (O += `
${$}`), w.pop(), `[${O}]`;
          }
          w.push(a);
          let R = "";
          _ !== "" && (x += _, I = `,
${x}`, R = " ");
          let k = "";
          for (const D of E) {
            const A = te(D, a[D], w, E, _, x);
            A !== void 0 && (O += `${k}${s(D)}:${R}${A}`, k = I);
          }
          return _ !== "" && k.length > 1 && (O = `
${x}${O}
${$}`), w.pop(), `{${O}}`;
        }
        case "number":
          return isFinite(a) ? String(a) : h ? h(a) : "null";
        case "boolean":
          return a === !0 ? "true" : "false";
        case "undefined":
          return;
        case "bigint":
          if (L)
            return String(a);
        default:
          return h ? h(a) : void 0;
      }
    }
    function U(N, a, w, E, _) {
      switch (typeof a) {
        case "string":
          return s(a);
        case "object": {
          if (a === null)
            return "null";
          if (typeof a.toJSON == "function") {
            if (a = a.toJSON(N), typeof a != "object")
              return U(N, a, w, E, _);
            if (a === null)
              return "null";
          }
          if (w.indexOf(a) !== -1)
            return S;
          const x = _;
          if (Array.isArray(a)) {
            if (a.length === 0)
              return "[]";
            if (T < w.length + 1)
              return '"[Array]"';
            w.push(a), _ += E;
            let A = `
${_}`;
            const z = `,
${_}`, J = Math.min(a.length, v);
            let V = 0;
            for (; V < J - 1; V++) {
              const X = U(String(V), a[V], w, E, _);
              A += X !== void 0 ? X : "null", A += z;
            }
            const H = U(String(V), a[V], w, E, _);
            if (A += H !== void 0 ? H : "null", a.length - 1 > v) {
              const X = a.length - v - 1;
              A += `${z}"... ${p(X)} not stringified"`;
            }
            return A += `
${x}`, w.pop(), `[${A}]`;
          }
          let $ = Object.keys(a);
          const O = $.length;
          if (O === 0)
            return "{}";
          if (T < w.length + 1)
            return '"[Object]"';
          _ += E;
          const I = `,
${_}`;
          let R = "", k = "", D = Math.min(O, v);
          o(a) && (R += c(a, I, v), $ = $.slice(a.length), D -= a.length, k = I), C && ($ = u($, W)), w.push(a);
          for (let A = 0; A < D; A++) {
            const z = $[A], J = U(z, a[z], w, E, _);
            J !== void 0 && (R += `${k}${s(z)}: ${J}`, k = I);
          }
          if (O > v) {
            const A = O - v;
            R += `${k}"...": "${p(A)} not stringified"`, k = I;
          }
          return k !== "" && (R = `
${_}${R}
${x}`), w.pop(), `{${R}}`;
        }
        case "number":
          return isFinite(a) ? String(a) : h ? h(a) : "null";
        case "boolean":
          return a === !0 ? "true" : "false";
        case "undefined":
          return;
        case "bigint":
          if (L)
            return String(a);
        default:
          return h ? h(a) : void 0;
      }
    }
    function ne(N, a, w) {
      switch (typeof a) {
        case "string":
          return s(a);
        case "object": {
          if (a === null)
            return "null";
          if (typeof a.toJSON == "function") {
            if (a = a.toJSON(N), typeof a != "object")
              return ne(N, a, w);
            if (a === null)
              return "null";
          }
          if (w.indexOf(a) !== -1)
            return S;
          let E = "";
          const _ = a.length !== void 0;
          if (_ && Array.isArray(a)) {
            if (a.length === 0)
              return "[]";
            if (T < w.length + 1)
              return '"[Array]"';
            w.push(a);
            const R = Math.min(a.length, v);
            let k = 0;
            for (; k < R - 1; k++) {
              const A = ne(String(k), a[k], w);
              E += A !== void 0 ? A : "null", E += ",";
            }
            const D = ne(String(k), a[k], w);
            if (E += D !== void 0 ? D : "null", a.length - 1 > v) {
              const A = a.length - v - 1;
              E += `,"... ${p(A)} not stringified"`;
            }
            return w.pop(), `[${E}]`;
          }
          let x = Object.keys(a);
          const $ = x.length;
          if ($ === 0)
            return "{}";
          if (T < w.length + 1)
            return '"[Object]"';
          let O = "", I = Math.min($, v);
          _ && o(a) && (E += c(a, ",", v), x = x.slice(a.length), I -= a.length, O = ","), C && (x = u(x, W)), w.push(a);
          for (let R = 0; R < I; R++) {
            const k = x[R], D = ne(k, a[k], w);
            D !== void 0 && (E += `${O}${s(k)}:${D}`, O = ",");
          }
          if ($ > v) {
            const R = $ - v;
            E += `${O}"...":"${p(R)} not stringified"`;
          }
          return w.pop(), `{${E}}`;
        }
        case "number":
          return isFinite(a) ? String(a) : h ? h(a) : "null";
        case "boolean":
          return a === !0 ? "true" : "false";
        case "undefined":
          return;
        case "bigint":
          if (L)
            return String(a);
        default:
          return h ? h(a) : void 0;
      }
    }
    function Ae(N, a, w) {
      if (arguments.length > 1) {
        let E = "";
        if (typeof w == "number" ? E = " ".repeat(Math.min(w, 10)) : typeof w == "string" && (E = w.slice(0, 10)), a != null) {
          if (typeof a == "function")
            return ee("", { "": N }, [], a, E, "");
          if (Array.isArray(a))
            return te("", N, [], B(a), E, "");
        }
        if (E.length !== 0)
          return U("", N, [], E, "");
      }
      return ne("", N, []);
    }
    return Ae;
  }
})(tt, tt.exports);
var Ko = tt.exports, De, At;
function Mo() {
  if (At) return De;
  At = 1;
  const e = Symbol.for("pino.metadata"), { DEFAULT_LEVELS: t } = ft, n = t.info;
  function r(o, c) {
    o = o || [], c = c || { dedupe: !1 };
    const l = Object.create(t);
    l.silent = 1 / 0, c.levels && typeof c.levels == "object" && Object.keys(c.levels).forEach((h) => {
      l[h] = c.levels[h];
    });
    const y = {
      write: b,
      add: B,
      remove: P,
      emit: g,
      flushSync: p,
      end: F,
      minLevel: 0,
      lastId: 0,
      streams: [],
      clone: m,
      [e]: !0,
      streamLevels: l
    };
    return Array.isArray(o) ? o.forEach(B, y) : B.call(y, o), o = null, y;
    function b(h) {
      let S;
      const L = this.lastLevel, { streams: C } = this;
      let W = 0, T;
      for (let v = s(C.length, c.dedupe); d(v, C.length, c.dedupe); v = u(v, c.dedupe))
        if (S = C[v], S.level <= L) {
          if (W !== 0 && W !== S.level)
            break;
          if (T = S.stream, T[e]) {
            const { lastTime: ee, lastMsg: te, lastObj: U, lastLogger: ne } = this;
            T.lastLevel = L, T.lastTime = ee, T.lastMsg = te, T.lastObj = U, T.lastLogger = ne;
          }
          T.write(h), c.dedupe && (W = S.level);
        } else if (!c.dedupe)
          break;
    }
    function g(...h) {
      for (const { stream: S } of this.streams)
        typeof S.emit == "function" && S.emit(...h);
    }
    function p() {
      for (const { stream: h } of this.streams)
        typeof h.flushSync == "function" && h.flushSync();
    }
    function B(h) {
      if (!h)
        return y;
      const S = typeof h.write == "function" || h.stream, L = h.write ? h : h.stream;
      if (!S)
        throw Error("stream object needs to implement either StreamEntry or DestinationStream interface");
      const { streams: C, streamLevels: W } = this;
      let T;
      typeof h.levelVal == "number" ? T = h.levelVal : typeof h.level == "string" ? T = W[h.level] : typeof h.level == "number" ? T = h.level : T = n;
      const v = {
        stream: L,
        level: T,
        levelVal: void 0,
        id: ++y.lastId
      };
      return C.unshift(v), C.sort(i), this.minLevel = C[0].level, y;
    }
    function P(h) {
      const { streams: S } = this, L = S.findIndex((C) => C.id === h);
      return L >= 0 && (S.splice(L, 1), S.sort(i), this.minLevel = S.length > 0 ? S[0].level : -1), y;
    }
    function F() {
      for (const { stream: h } of this.streams)
        typeof h.flushSync == "function" && h.flushSync(), h.end();
    }
    function m(h) {
      const S = new Array(this.streams.length);
      for (let L = 0; L < S.length; L++)
        S[L] = {
          level: h,
          stream: this.streams[L].stream
        };
      return {
        write: b,
        add: B,
        remove: P,
        minLevel: h,
        streams: S,
        clone: m,
        emit: g,
        flushSync: p,
        [e]: !0
      };
    }
  }
  function i(o, c) {
    return o.level - c.level;
  }
  function s(o, c) {
    return c ? o - 1 : 0;
  }
  function u(o, c) {
    return c ? o - 1 : o + 1;
  }
  function d(o, c, l) {
    return l ? o >= 0 : o < c;
  }
  return De = r, De;
}
const Uo = Dn, Bn = Yt, Jo = Qt, Go = rn, Pn = hi, qo = Ro, jn = ue, { configure: Ho } = Ko, { assertDefaultLevelFound: Xo, mappings: In, genLsCache: Yo, genLevelComparison: Qo, assertLevelComparison: Zo } = xn, { DEFAULT_LEVELS: Rn, SORTING_ORDER: ef } = ft, {
  createArgsNormalizer: tf,
  asChindings: nf,
  buildSafeSonicBoom: Ct,
  buildFormatters: rf,
  stringify: Fe,
  normalizeDestFileDescriptor: Tt,
  noop: sf
} = ot, { version: of } = Ln, {
  chindingsSym: kt,
  redactFmtSym: ff,
  serializersSym: Bt,
  timeSym: lf,
  timeSliceIndexSym: uf,
  streamSym: cf,
  stringifySym: Pt,
  stringifySafeSym: We,
  stringifiersSym: jt,
  setLevelSym: af,
  endSym: hf,
  formatOptsSym: df,
  messageKeySym: yf,
  errorKeySym: mf,
  nestedKeySym: gf,
  mixinSym: pf,
  levelCompSym: Sf,
  useOnlyCustomLevelsSym: bf,
  formattersSym: It,
  hooksSym: wf,
  nestedKeyStrSym: $f,
  mixinMergeStrategySym: _f,
  msgPrefixSym: Ef
} = jn, { epochTime: Nn, nullTime: vf } = Pn, { pid: Of } = process, xf = Uo.hostname(), Lf = Bn.err, Af = {
  level: "info",
  levelComparison: ef.ASC,
  levels: Rn,
  messageKey: "msg",
  errorKey: "err",
  nestedKey: null,
  enabled: !0,
  base: { pid: Of, hostname: xf },
  serializers: Object.assign(/* @__PURE__ */ Object.create(null), {
    err: Lf
  }),
  formatters: Object.assign(/* @__PURE__ */ Object.create(null), {
    bindings(e) {
      return e;
    },
    level(e, t) {
      return { level: t };
    }
  }),
  hooks: {
    logMethod: void 0,
    streamWrite: void 0
  },
  timestamp: Nn,
  name: void 0,
  redact: null,
  customLevels: null,
  useOnlyCustomLevels: !1,
  depthLimit: 5,
  edgeLimit: 100
}, Cf = tf(Af), Tf = Object.assign(/* @__PURE__ */ Object.create(null), Bn);
function ut(...e) {
  const t = {}, { opts: n, stream: r } = Cf(t, Jo(), ...e);
  n.level && typeof n.level == "string" && Rn[n.level.toLowerCase()] !== void 0 && (n.level = n.level.toLowerCase());
  const {
    redact: i,
    crlf: s,
    serializers: u,
    timestamp: d,
    messageKey: o,
    errorKey: c,
    nestedKey: l,
    base: y,
    name: b,
    level: g,
    customLevels: p,
    levelComparison: B,
    mixin: P,
    mixinMergeStrategy: F,
    useOnlyCustomLevels: m,
    formatters: h,
    hooks: S,
    depthLimit: L,
    edgeLimit: C,
    onChild: W,
    msgPrefix: T
  } = n, v = Ho({
    maximumDepth: L,
    maximumBreadth: C
  }), ee = rf(
    h.level,
    h.bindings,
    h.log
  ), te = Fe.bind({
    [We]: v
  }), U = i ? Go(i, te) : {}, ne = i ? { stringify: U[ff] } : { stringify: te }, Ae = "}" + (s ? `\r
` : `
`), N = nf.bind(null, {
    [kt]: "",
    [Bt]: u,
    [jt]: U,
    [Pt]: Fe,
    [We]: v,
    [It]: ee
  });
  let a = "";
  y !== null && (b === void 0 ? a = N(y) : a = N(Object.assign({}, y, { name: b })));
  const w = d instanceof Function ? d : d ? Nn : vf, E = w().indexOf(":") + 1;
  if (m && !p) throw Error("customLevels is required if useOnlyCustomLevels is set true");
  if (P && typeof P != "function") throw Error(`Unknown mixin type "${typeof P}" - expected "function"`);
  if (T && typeof T != "string") throw Error(`Unknown msgPrefix type "${typeof T}" - expected "string"`);
  Xo(g, p, m);
  const _ = In(p, m);
  typeof r.emit == "function" && r.emit("message", { code: "PINO_CONFIG", config: { levels: _, messageKey: o, errorKey: c } }), Zo(B);
  const x = Qo(B);
  return Object.assign(t, {
    levels: _,
    [Sf]: x,
    [bf]: m,
    [cf]: r,
    [lf]: w,
    [uf]: E,
    [Pt]: Fe,
    [We]: v,
    [jt]: U,
    [hf]: Ae,
    [df]: ne,
    [yf]: o,
    [mf]: c,
    [gf]: l,
    // protect against injection
    [$f]: l ? `,${JSON.stringify(l)}:{` : "",
    [Bt]: u,
    [pf]: P,
    [_f]: F,
    [kt]: a,
    [It]: ee,
    [wf]: S,
    silent: sf,
    onChild: W,
    [Ef]: T
  }), Object.setPrototypeOf(t, qo()), Yo(t), t[af](g), t;
}
M.exports = ut;
M.exports.destination = (e = process.stdout.fd) => typeof e == "object" ? (e.dest = Tt(e.dest || process.stdout.fd), Ct(e)) : Ct({ dest: Tt(e), minLength: 0 });
M.exports.transport = pn;
M.exports.multistream = Mo();
M.exports.levels = In();
M.exports.stdSerializers = Tf;
M.exports.stdTimeFunctions = Object.assign({}, Pn);
M.exports.symbols = jn;
M.exports.version = of;
M.exports.default = ut;
M.exports.pino = ut;
var kf = M.exports;
const Bf = /* @__PURE__ */ qn(kf), nt = new Wn(), Pf = {
  write(e) {
    process.stdout.write(e);
    try {
      const t = JSON.parse(e), r = `[${t.level === 30 ? "INFO" : t.level === 40 ? "WARN" : t.level === 50 ? "ERROR" : "DEBUG"}] ${t.msg || ""}`;
      nt.emit("log", r);
    } catch {
      nt.emit("log", e);
    }
  }
}, jf = Bf({
  level: process.env.LOG_LEVEL ?? "info"
}, Pf), Yf = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  logEmitter: nt,
  logger: jf
}, Symbol.toStringTag, { value: "Module" }));
export {
  qn as a,
  Yf as b,
  Wt as c,
  qf as g,
  jf as l
};
