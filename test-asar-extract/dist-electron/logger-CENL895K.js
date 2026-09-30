import Cn from "node:os";
import Tn, { EventEmitter as kn } from "node:events";
import Bn from "node:diagnostics_channel";
import Pn from "fs";
import kt from "events";
import jn from "util";
import Bt from "path";
import Pt from "assert";
import jt from "worker_threads";
import Rn from "module";
import In from "node:path";
import Dn from "url";
import Nn from "buffer";
var tt = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {};
function Fn(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
function af(e) {
  if (e.__esModule) return e;
  var t = e.default;
  if (typeof t == "function") {
    var n = function r() {
      return this instanceof r ? Reflect.construct(t, arguments, this.constructor) : t.apply(this, arguments);
    };
    n.prototype = t.prototype;
  } else n = {};
  return Object.defineProperty(n, "__esModule", { value: !0 }), Object.keys(e).forEach(function(r) {
    var s = Object.getOwnPropertyDescriptor(e, r);
    Object.defineProperty(n, r, s.get ? s : {
      enumerable: !0,
      get: function() {
        return e[r];
      }
    });
  }), n;
}
var J = { exports: {} };
const se = (e) => e && typeof e.message == "string", Rt = (e) => {
  if (!e) return;
  const t = e.cause;
  if (typeof t == "function") {
    const n = e.cause();
    return se(n) ? n : void 0;
  } else
    return se(t) ? t : void 0;
}, It = (e, t) => {
  if (!se(e)) return "";
  const n = e.stack || "";
  if (t.has(e))
    return n + `
causes have become circular...`;
  const r = Rt(e);
  return r ? (t.add(e), n + `
caused by: ` + It(r, t)) : n;
}, Wn = (e) => It(e, /* @__PURE__ */ new Set()), Dt = (e, t, n) => {
  if (!se(e)) return "";
  const r = n ? "" : e.message || "";
  if (t.has(e))
    return r + ": ...";
  const s = Rt(e);
  if (s) {
    t.add(e);
    const o = typeof e.cause == "function";
    return r + (o ? "" : ": ") + Dt(s, t, o);
  } else
    return r;
}, zn = (e) => Dt(e, /* @__PURE__ */ new Set());
var Nt = {
  isErrorLike: se,
  stackWithCauses: Wn,
  messageWithCauses: zn
};
const Vn = Symbol("circular-ref-tag"), De = Symbol("pino-raw-err-ref"), Ft = Object.create({}, {
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
      return this[De];
    },
    set: function(e) {
      this[De] = e;
    }
  }
});
Object.defineProperty(Ft, De, {
  writable: !0,
  value: {}
});
var Wt = {
  pinoErrProto: Ft,
  pinoErrorSymbols: {
    seen: Vn
  }
}, Kn = Ne;
const { messageWithCauses: Mn, stackWithCauses: qn, isErrorLike: nt } = Nt, { pinoErrProto: Un, pinoErrorSymbols: Jn } = Wt, { seen: ve } = Jn, { toString: Gn } = Object.prototype;
function Ne(e) {
  if (!nt(e))
    return e;
  e[ve] = void 0;
  const t = Object.create(Un);
  t.type = Gn.call(e.constructor) === "[object Function]" ? e.constructor.name : e.name, t.message = Mn(e), t.stack = qn(e), Array.isArray(e.errors) && (t.aggregateErrors = e.errors.map((n) => Ne(n)));
  for (const n in e)
    if (t[n] === void 0) {
      const r = e[n];
      nt(r) ? n !== "cause" && !Object.prototype.hasOwnProperty.call(r, ve) && (t[n] = Ne(r)) : t[n] = r;
    }
  return delete e[ve], t.raw = e, t;
}
var Hn = me;
const { isErrorLike: Oe } = Nt, { pinoErrProto: Xn, pinoErrorSymbols: Yn } = Wt, { seen: le } = Yn, { toString: Qn } = Object.prototype;
function me(e) {
  if (!Oe(e))
    return e;
  e[le] = void 0;
  const t = Object.create(Xn);
  t.type = Qn.call(e.constructor) === "[object Function]" ? e.constructor.name : e.name, t.message = e.message, t.stack = e.stack, Array.isArray(e.errors) && (t.aggregateErrors = e.errors.map((n) => me(n))), Oe(e.cause) && !Object.prototype.hasOwnProperty.call(e.cause, le) && (t.cause = me(e.cause));
  for (const n in e)
    if (t[n] === void 0) {
      const r = e[n];
      Oe(r) ? Object.prototype.hasOwnProperty.call(r, le) || (t[n] = me(r)) : t[n] = r;
    }
  return delete e[le], t.raw = e, t;
}
var Zn = {
  mapHttpRequest: er,
  reqSerializer: Vt
};
const Fe = Symbol("pino-raw-req-ref"), zt = Object.create({}, {
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
      return this[Fe];
    },
    set: function(e) {
      this[Fe] = e;
    }
  }
});
Object.defineProperty(zt, Fe, {
  writable: !0,
  value: {}
});
function Vt(e) {
  const t = e.info || e.socket, n = Object.create(zt);
  if (n.id = typeof e.id == "function" ? e.id() : e.id || (e.info ? e.info.id : void 0), n.method = e.method, e.originalUrl)
    n.url = e.originalUrl;
  else {
    const r = e.path;
    n.url = typeof r == "string" ? r : e.url ? e.url.path || e.url : void 0;
  }
  return e.query && (n.query = e.query), e.params && (n.params = e.params), n.headers = e.headers, n.remoteAddress = t && t.remoteAddress, n.remotePort = t && t.remotePort, n.raw = e.raw || e, n;
}
function er(e) {
  return {
    req: Vt(e)
  };
}
var tr = {
  mapHttpResponse: nr,
  resSerializer: Mt
};
const We = Symbol("pino-raw-res-ref"), Kt = Object.create({}, {
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
      return this[We];
    },
    set: function(e) {
      this[We] = e;
    }
  }
});
Object.defineProperty(Kt, We, {
  writable: !0,
  value: {}
});
function Mt(e) {
  const t = Object.create(Kt);
  return t.statusCode = e.headersSent ? e.statusCode : null, t.headers = e.getHeaders ? e.getHeaders() : e._headers, t.raw = e, t;
}
function nr(e) {
  return {
    res: Mt(e)
  };
}
const xe = Kn, rr = Hn, ue = Zn, ce = tr;
var qt = {
  err: xe,
  errWithCause: rr,
  mapHttpRequest: ue.mapHttpRequest,
  mapHttpResponse: ce.mapHttpResponse,
  req: ue.reqSerializer,
  res: ce.resSerializer,
  wrapErrorSerializer: function(t) {
    return t === xe ? t : function(r) {
      return t(xe(r));
    };
  },
  wrapRequestSerializer: function(t) {
    return t === ue.reqSerializer ? t : function(r) {
      return t(ue.reqSerializer(r));
    };
  },
  wrapResponseSerializer: function(t) {
    return t === ce.resSerializer ? t : function(r) {
      return t(ce.resSerializer(r));
    };
  }
};
function ir(e, t) {
  return t;
}
var Ut = function() {
  const t = Error.prepareStackTrace;
  Error.prepareStackTrace = ir;
  const n = new Error().stack;
  if (Error.prepareStackTrace = t, !Array.isArray(n))
    return;
  const r = n.slice(2), s = [];
  for (const o of r)
    o && s.push(o.getFileName());
  return s;
};
function ze(e) {
  if (e === null || typeof e != "object")
    return e;
  if (e instanceof Date)
    return new Date(e.getTime());
  if (e instanceof Array) {
    const t = [];
    for (let n = 0; n < e.length; n++)
      t[n] = ze(e[n]);
    return t;
  }
  if (typeof e == "object") {
    const t = Object.create(Object.getPrototypeOf(e));
    for (const n in e)
      Object.prototype.hasOwnProperty.call(e, n) && (t[n] = ze(e[n]));
    return t;
  }
  return e;
}
function Jt(e) {
  const t = [];
  let n = "", r = !1, s = !1, o = "";
  for (let d = 0; d < e.length; d++) {
    const a = e[d];
    !r && a === "." ? n && (t.push(n), n = "") : a === "[" ? (n && (t.push(n), n = ""), r = !0) : a === "]" && r ? (t.push(n), n = "", r = !1, s = !1) : (a === '"' || a === "'") && r ? s ? a === o ? (s = !1, o = "") : n += a : (s = !0, o = a) : n += a;
  }
  return n && t.push(n), t;
}
function Gt(e, t, n) {
  let r = e;
  for (let o = 0; o < t.length - 1; o++) {
    const d = t[o];
    if (typeof r != "object" || r === null || !(d in r) || typeof r[d] != "object" || r[d] === null)
      return !1;
    r = r[d];
  }
  const s = t[t.length - 1];
  if (s === "*") {
    if (Array.isArray(r))
      for (let o = 0; o < r.length; o++)
        r[o] = n;
    else if (typeof r == "object" && r !== null)
      for (const o in r)
        Object.prototype.hasOwnProperty.call(r, o) && (r[o] = n);
  } else
    typeof r == "object" && r !== null && s in r && Object.prototype.hasOwnProperty.call(r, s) && (r[s] = n);
  return !0;
}
function Ht(e, t) {
  let n = e;
  for (let s = 0; s < t.length - 1; s++) {
    const o = t[s];
    if (typeof n != "object" || n === null || !(o in n) || typeof n[o] != "object" || n[o] === null)
      return !1;
    n = n[o];
  }
  const r = t[t.length - 1];
  if (r === "*") {
    if (Array.isArray(n))
      for (let s = 0; s < n.length; s++)
        n[s] = void 0;
    else if (typeof n == "object" && n !== null)
      for (const s in n)
        Object.prototype.hasOwnProperty.call(n, s) && delete n[s];
  } else
    typeof n == "object" && n !== null && r in n && Object.prototype.hasOwnProperty.call(n, r) && delete n[r];
  return !0;
}
const ge = Symbol("PATH_NOT_FOUND");
function sr(e, t) {
  let n = e;
  for (const r of t) {
    if (n == null || typeof n != "object" || n === null || !(r in n))
      return ge;
    n = n[r];
  }
  return n;
}
function or(e, t) {
  let n = e;
  for (const r of t) {
    if (n == null || typeof n != "object" || n === null)
      return;
    n = n[r];
  }
  return n;
}
function fr(e, t, n, r = !1) {
  for (const s of t) {
    const o = Jt(s);
    if (o.includes("*"))
      Xt(e, o, n, s, r);
    else if (r)
      Ht(e, o);
    else {
      const d = sr(e, o);
      if (d === ge)
        continue;
      const a = typeof n == "function" ? n(d, o) : n;
      Gt(e, o, a);
    }
  }
}
function Xt(e, t, n, r, s = !1) {
  const o = t.indexOf("*");
  if (o === t.length - 1) {
    const d = t.slice(0, -1);
    let a = e;
    for (const f of d) {
      if (a == null || typeof a != "object" || a === null) return;
      a = a[f];
    }
    if (Array.isArray(a))
      if (s)
        for (let f = 0; f < a.length; f++)
          a[f] = void 0;
      else
        for (let f = 0; f < a.length; f++) {
          const c = [...d, f.toString()], i = typeof n == "function" ? n(a[f], c) : n;
          a[f] = i;
        }
    else if (typeof a == "object" && a !== null)
      if (s) {
        const f = [];
        for (const c in a)
          Object.prototype.hasOwnProperty.call(a, c) && f.push(c);
        for (const c of f)
          delete a[c];
      } else
        for (const f in a) {
          const c = [...d, f], i = typeof n == "function" ? n(a[f], c) : n;
          a[f] = i;
        }
  } else
    lr(e, t, n, o, r, s);
}
function lr(e, t, n, r, s, o = !1) {
  const d = t.slice(0, r), a = t.slice(r + 1), f = [];
  function c(i, y) {
    if (y === d.length) {
      if (Array.isArray(i))
        for (let $ = 0; $ < i.length; $++)
          f[y] = $.toString(), c(i[$], y + 1);
      else if (typeof i == "object" && i !== null)
        for (const $ in i)
          f[y] = $, c(i[$], y + 1);
    } else if (y < d.length) {
      const $ = d[y];
      i && typeof i == "object" && i !== null && $ in i && (f[y] = $, c(i[$], y + 1));
    } else if (a.includes("*"))
      Xt(i, a, typeof n == "function" ? (g, w) => {
        const B = [...f.slice(0, y), ...w];
        return n(g, B);
      } : n, s, o);
    else if (o)
      Ht(i, a);
    else {
      const $ = typeof n == "function" ? n(or(i, a), [...f.slice(0, y), ...a]) : n;
      Gt(i, a, $);
    }
  }
  if (d.length === 0)
    c(e, 0);
  else {
    let i = e;
    for (let y = 0; y < d.length; y++) {
      const $ = d[y];
      if (i == null || typeof i != "object" || i === null) return;
      i = i[$], f[y] = $;
    }
    i != null && c(i, d.length);
  }
}
function ur(e) {
  if (e.length === 0)
    return null;
  const t = /* @__PURE__ */ new Map();
  for (const n of e) {
    const r = Jt(n);
    let s = t;
    for (let o = 0; o < r.length; o++) {
      const d = r[o];
      s.has(d) || s.set(d, /* @__PURE__ */ new Map()), s = s.get(d);
    }
  }
  return t;
}
function cr(e, t) {
  if (!t)
    return e;
  function n(r, s, o = 0) {
    if (!s || s.size === 0 || r === null || typeof r != "object")
      return r;
    if (r instanceof Date)
      return new Date(r.getTime());
    if (Array.isArray(r)) {
      const a = [];
      for (let f = 0; f < r.length; f++) {
        const c = f.toString();
        s.has(c) || s.has("*") ? a[f] = n(r[f], s.get(c) || s.get("*")) : a[f] = r[f];
      }
      return a;
    }
    const d = Object.create(Object.getPrototypeOf(r));
    for (const a in r)
      Object.prototype.hasOwnProperty.call(r, a) && (s.has(a) || s.has("*") ? d[a] = n(r[a], s.get(a) || s.get("*")) : d[a] = r[a]);
    return d;
  }
  return n(e, t);
}
function ar(e) {
  if (typeof e != "string")
    throw new Error("Paths must be (non-empty) strings");
  if (e === "")
    throw new Error("Invalid redaction path ()");
  if (e.includes(".."))
    throw new Error(`Invalid redaction path (${e})`);
  if (e.includes(","))
    throw new Error(`Invalid redaction path (${e})`);
  let t = 0, n = !1, r = "";
  for (let s = 0; s < e.length; s++) {
    const o = e[s];
    if ((o === '"' || o === "'") && t > 0)
      n ? o === r && (n = !1, r = "") : (n = !0, r = o);
    else if (o === "[" && !n)
      t++;
    else if (o === "]" && !n && (t--, t < 0))
      throw new Error(`Invalid redaction path (${e})`);
  }
  if (t !== 0)
    throw new Error(`Invalid redaction path (${e})`);
}
function hr(e) {
  if (!Array.isArray(e))
    throw new TypeError("paths must be an array");
  for (const t of e)
    ar(t);
}
function dr(e = {}) {
  const {
    paths: t = [],
    censor: n = "[REDACTED]",
    serialize: r = JSON.stringify,
    strict: s = !0,
    remove: o = !1
  } = e;
  hr(t);
  const d = ur(t);
  return function(f) {
    if (s && (f === null || typeof f != "object") && (f == null || typeof f != "object"))
      return r ? r(f) : f;
    const c = cr(f, d), i = f;
    let y = n;
    return typeof n == "function" && (y = n), fr(c, t, y, o), r === !1 ? (c.restore = function() {
      return ze(i);
    }, c) : typeof r == "function" ? r(c) : JSON.stringify(c);
  };
}
var yr = dr;
const mr = Symbol("pino.setLevel"), gr = Symbol("pino.getLevel"), pr = Symbol("pino.levelVal"), Sr = Symbol("pino.levelComp"), wr = Symbol("pino.useLevelLabels"), br = Symbol("pino.useOnlyCustomLevels"), $r = Symbol("pino.mixin"), _r = Symbol("pino.lsCache"), Er = Symbol("pino.chindings"), vr = Symbol("pino.asJson"), Or = Symbol("pino.write"), xr = Symbol("pino.redactFmt"), Lr = Symbol("pino.time"), Ar = Symbol("pino.timeSliceIndex"), Cr = Symbol("pino.stream"), Tr = Symbol("pino.stringify"), kr = Symbol("pino.stringifySafe"), Br = Symbol("pino.stringifiers"), Pr = Symbol("pino.end"), jr = Symbol("pino.formatOpts"), Rr = Symbol("pino.messageKey"), Ir = Symbol("pino.errorKey"), Dr = Symbol("pino.nestedKey"), Nr = Symbol("pino.nestedKeyStr"), Fr = Symbol("pino.mixinMergeStrategy"), Wr = Symbol("pino.msgPrefix"), zr = Symbol("pino.wildcardFirst"), Vr = Symbol.for("pino.serializers"), Kr = Symbol.for("pino.formatters"), Mr = Symbol.for("pino.hooks"), qr = Symbol.for("pino.metadata");
var oe = {
  setLevelSym: mr,
  getLevelSym: gr,
  levelValSym: pr,
  levelCompSym: Sr,
  useLevelLabelsSym: wr,
  mixinSym: $r,
  lsCacheSym: _r,
  chindingsSym: Er,
  asJsonSym: vr,
  writeSym: Or,
  serializersSym: Vr,
  redactFmtSym: xr,
  timeSym: Lr,
  timeSliceIndexSym: Ar,
  streamSym: Cr,
  stringifySym: Tr,
  stringifySafeSym: kr,
  stringifiersSym: Br,
  endSym: Pr,
  formatOptsSym: jr,
  messageKeySym: Rr,
  errorKeySym: Ir,
  nestedKeySym: Dr,
  wildcardFirstSym: zr,
  needsMetadataGsym: qr,
  useOnlyCustomLevelsSym: br,
  formattersSym: Kr,
  hooksSym: Mr,
  nestedKeyStrSym: Nr,
  mixinMergeStrategySym: Fr,
  msgPrefixSym: Wr
};
const rt = yr, { redactFmtSym: Ur, wildcardFirstSym: ae } = oe, Le = /[^.[\]]+|\[([^[\]]*?)\]/g, it = "[Redacted]", st = !1;
function Jr(e, t) {
  const { paths: n, censor: r, remove: s } = Gr(e), o = n.reduce((f, c) => {
    Le.lastIndex = 0;
    const i = Le.exec(c), y = Le.exec(c);
    let $ = i[1] !== void 0 ? i[1].replace(/^(?:"|'|`)(.*)(?:"|'|`)$/, "$1") : i[0];
    if ($ === "*" && ($ = ae), y === null)
      return f[$] = null, f;
    if (f[$] === null)
      return f;
    const { index: g } = y, w = `${c.substr(g, c.length - 1)}`;
    return f[$] = f[$] || [], $ !== ae && f[$].length === 0 && f[$].push(...f[ae] || []), $ === ae && Object.keys(f).forEach(function(B) {
      f[B] && f[B].push(w);
    }), f[$].push(w), f;
  }, {}), d = {
    [Ur]: rt({ paths: n, censor: r, serialize: t, strict: st, remove: s })
  }, a = (...f) => t(typeof r == "function" ? r(...f) : r);
  return [...Object.keys(o), ...Object.getOwnPropertySymbols(o)].reduce((f, c) => {
    if (o[c] === null)
      f[c] = (i) => a(i, [c]);
    else {
      const i = typeof r == "function" ? (y, $) => r(y, [c, ...$]) : r;
      f[c] = rt({
        paths: o[c],
        censor: i,
        serialize: t,
        strict: st,
        remove: s
      });
    }
    return f;
  }, d);
}
function Gr(e) {
  if (Array.isArray(e))
    return e = { paths: e, censor: it }, e;
  let { paths: t, censor: n = it, remove: r } = e;
  if (Array.isArray(t) === !1)
    throw Error("pino – redact must contain an array of strings");
  return r === !0 && (n = void 0), { paths: t, censor: n, remove: r };
}
var Yt = Jr;
const Hr = () => "", Xr = () => `,"time":${Date.now()}`, Yr = () => `,"time":${Math.round(Date.now() / 1e3)}`, Qr = () => `,"time":"${new Date(Date.now()).toISOString()}"`, Zr = 1000000n, ot = 1000000000n, ei = BigInt(Date.now()) * Zr, ti = process.hrtime.bigint(), ni = () => {
  const e = process.hrtime.bigint() - ti, t = ei + e, n = t / ot, r = t % ot, s = Number(n * 1000n + r / 1000000n), o = new Date(s), d = o.getUTCFullYear(), a = (o.getUTCMonth() + 1).toString().padStart(2, "0"), f = o.getUTCDate().toString().padStart(2, "0"), c = o.getUTCHours().toString().padStart(2, "0"), i = o.getUTCMinutes().toString().padStart(2, "0"), y = o.getUTCSeconds().toString().padStart(2, "0");
  return `,"time":"${d}-${a}-${f}T${c}:${i}:${y}.${r.toString().padStart(9, "0")}Z"`;
};
var ri = { nullTime: Hr, epochTime: Xr, unixTime: Yr, isoTime: Qr, isoTimeNano: ni };
function ii(e) {
  try {
    return JSON.stringify(e);
  } catch {
    return '"[Circular]"';
  }
}
var si = oi;
function oi(e, t, n) {
  var r = n && n.stringify || ii, s = 1;
  if (typeof e == "object" && e !== null) {
    var o = t.length + s;
    if (o === 1) return e;
    var d = new Array(o);
    d[0] = r(e);
    for (var a = 1; a < o; a++)
      d[a] = r(t[a]);
    return d.join(" ");
  }
  if (typeof e != "string")
    return e;
  var f = t.length;
  if (f === 0) return e;
  for (var c = "", i = 1 - s, y = -1, $ = e && e.length || 0, g = 0; g < $; ) {
    if (e.charCodeAt(g) === 37 && g + 1 < $) {
      switch (y = y > -1 ? y : 0, e.charCodeAt(g + 1)) {
        case 100:
        case 102:
          if (i >= f || t[i] == null) break;
          y < g && (c += e.slice(y, g)), c += Number(t[i]), y = g + 2, g++;
          break;
        case 105:
          if (i >= f || t[i] == null) break;
          y < g && (c += e.slice(y, g)), c += Math.floor(Number(t[i])), y = g + 2, g++;
          break;
        case 79:
        case 111:
        case 106:
          if (i >= f || t[i] === void 0) break;
          y < g && (c += e.slice(y, g));
          var w = typeof t[i];
          if (w === "string") {
            c += "'" + t[i] + "'", y = g + 2, g++;
            break;
          }
          if (w === "function") {
            c += t[i].name || "<anonymous>", y = g + 2, g++;
            break;
          }
          c += r(t[i]), y = g + 2, g++;
          break;
        case 115:
          if (i >= f)
            break;
          y < g && (c += e.slice(y, g)), c += String(t[i]), y = g + 2, g++;
          break;
        case 37:
          y < g && (c += e.slice(y, g)), c += "%", y = g + 2, g++, i--;
          break;
      }
      ++i;
    }
    ++g;
  }
  return y === -1 ? e : (y < $ && (c += e.slice(y)), c);
}
var he = { exports: {} }, ft;
function Qt() {
  if (ft) return he.exports;
  if (ft = 1, typeof SharedArrayBuffer < "u" && typeof Atomics < "u") {
    let t = function(n) {
      if ((n > 0 && n < 1 / 0) === !1)
        throw typeof n != "number" && typeof n != "bigint" ? TypeError("sleep: ms must be a number") : RangeError("sleep: ms must be a number that is greater than 0 but less than Infinity");
      Atomics.wait(e, 0, 0, Number(n));
    };
    const e = new Int32Array(new SharedArrayBuffer(4));
    he.exports = t;
  } else {
    let e = function(t) {
      if ((t > 0 && t < 1 / 0) === !1)
        throw typeof t != "number" && typeof t != "bigint" ? TypeError("sleep: ms must be a number") : RangeError("sleep: ms must be a number that is greater than 0 but less than Infinity");
    };
    he.exports = e;
  }
  return he.exports;
}
const N = Pn, fi = kt, li = jn.inherits, lt = Bt, He = Qt(), ui = Pt, Se = 100, we = Buffer.allocUnsafe(0), ci = 16 * 1024, ut = "buffer", ct = "utf8", [ai, hi] = (process.versions.node || "0.0").split(".").map(Number), di = ai >= 22 && hi >= 7;
function Zt(e, t) {
  t._opening = !0, t._writing = !0, t._asyncDrainScheduled = !1;
  function n(o, d) {
    if (o) {
      t._reopening = !1, t._writing = !1, t._opening = !1, t.sync ? process.nextTick(() => {
        t.listenerCount("error") > 0 && t.emit("error", o);
      }) : t.emit("error", o);
      return;
    }
    const a = t._reopening;
    t.fd = d, t.file = e, t._reopening = !1, t._opening = !1, t._writing = !1, t.sync ? process.nextTick(() => t.emit("ready")) : t.emit("ready"), !t.destroyed && (!t._writing && t._len > t.minLength || t._flushPending ? t._actualWrite() : a && process.nextTick(() => t.emit("drain")));
  }
  const r = t.append ? "a" : "w", s = t.mode;
  if (t.sync)
    try {
      t.mkdir && N.mkdirSync(lt.dirname(e), { recursive: !0 });
      const o = N.openSync(e, r, s);
      n(null, o);
    } catch (o) {
      throw n(o), o;
    }
  else t.mkdir ? N.mkdir(lt.dirname(e), { recursive: !0 }, (o) => {
    if (o) return n(o);
    N.open(e, r, s, n);
  }) : N.open(e, r, s, n);
}
function X(e) {
  if (!(this instanceof X))
    return new X(e);
  let { fd: t, dest: n, minLength: r, maxLength: s, maxWrite: o, periodicFlush: d, sync: a, append: f = !0, mkdir: c, retryEAGAIN: i, fsync: y, contentMode: $, mode: g } = e || {};
  t = t || n, this._len = 0, this.fd = -1, this._bufs = [], this._lens = [], this._writing = !1, this._ending = !1, this._reopening = !1, this._asyncDrainScheduled = !1, this._flushPending = !1, this._hwm = Math.max(r || 0, 16387), this.file = null, this.destroyed = !1, this.minLength = r || 0, this.maxLength = s || 0, this.maxWrite = o || ci, this._periodicFlush = d || 0, this._periodicFlushTimer = void 0, this.sync = a || !1, this.writable = !0, this._fsync = y || !1, this.append = f || !1, this.mode = g, this.retryEAGAIN = i || (() => !0), this.mkdir = c || !1;
  let w, B;
  if ($ === ut)
    this._writingBuf = we, this.write = gi, this.flush = Si, this.flushSync = bi, this._actualWrite = _i, w = () => N.writeSync(this.fd, this._writingBuf), B = () => N.write(this.fd, this._writingBuf, this.release);
  else if ($ === void 0 || $ === ct)
    this._writingBuf = "", this.write = mi, this.flush = pi, this.flushSync = wi, this._actualWrite = $i, w = () => Buffer.isBuffer(this._writingBuf) ? N.writeSync(this.fd, this._writingBuf) : N.writeSync(this.fd, this._writingBuf, "utf8"), B = () => Buffer.isBuffer(this._writingBuf) ? N.write(this.fd, this._writingBuf, this.release) : N.write(this.fd, this._writingBuf, "utf8", this.release);
  else
    throw new Error(`SonicBoom supports "${ct}" and "${ut}", but passed ${$}`);
  if (typeof t == "number")
    this.fd = t, process.nextTick(() => this.emit("ready"));
  else if (typeof t == "string")
    Zt(t, this);
  else
    throw new Error("SonicBoom supports only file descriptors and files");
  if (this.minLength >= this.maxWrite)
    throw new Error(`minLength should be smaller than maxWrite (${this.maxWrite})`);
  this.release = (R, I) => {
    if (R) {
      if ((R.code === "EAGAIN" || R.code === "EBUSY") && this.retryEAGAIN(R, this._writingBuf.length, this._len - this._writingBuf.length))
        if (this.sync)
          try {
            He(Se), this.release(void 0, 0);
          } catch (p) {
            this.release(p);
          }
        else
          setTimeout(B, Se);
      else
        this._writing = !1, this.emit("error", R);
      return;
    }
    this.emit("write", I);
    const m = Ve(this._writingBuf, this._len, I);
    if (this._len = m.len, this._writingBuf = m.writingBuf, this._writingBuf.length) {
      if (!this.sync) {
        B();
        return;
      }
      try {
        do {
          const p = w(), L = Ve(this._writingBuf, this._len, p);
          this._len = L.len, this._writingBuf = L.writingBuf;
        } while (this._writingBuf.length);
      } catch (p) {
        this.release(p);
        return;
      }
    }
    this._fsync && N.fsyncSync(this.fd);
    const h = this._len;
    this._reopening ? (this._writing = !1, this._reopening = !1, this.reopen()) : h > this.minLength ? this._actualWrite() : this._ending ? h > 0 ? this._actualWrite() : (this._writing = !1, Ee(this)) : (this._writing = !1, this.sync ? this._asyncDrainScheduled || (this._asyncDrainScheduled = !0, process.nextTick(yi, this)) : this.emit("drain"));
  }, this.on("newListener", function(R) {
    R === "drain" && (this._asyncDrainScheduled = !1);
  }), this._periodicFlush !== 0 && (this._periodicFlushTimer = setInterval(() => this.flush(null), this._periodicFlush), this._periodicFlushTimer.unref());
}
function Ve(e, t, n) {
  return typeof e == "string" && (e = Buffer.from(e)), t = Math.max(t - n, 0), e = e.subarray(n), { writingBuf: e, len: t };
}
function yi(e) {
  e.listenerCount("drain") > 0 && (e._asyncDrainScheduled = !1, e.emit("drain"));
}
li(X, fi);
function en(e, t) {
  return e.length === 0 ? we : e.length === 1 ? e[0] : Buffer.concat(e, t);
}
function mi(e) {
  if (this.destroyed)
    throw new Error("SonicBoom destroyed");
  e = "" + e;
  const t = Buffer.byteLength(e), n = this._len + t, r = this._bufs;
  return this.maxLength && n > this.maxLength ? (this.emit("drop", e), this._len < this._hwm) : (r.length === 0 || Buffer.byteLength(r[r.length - 1]) + t > this.maxWrite ? r.push(e) : r[r.length - 1] += e, this._len = n, !this._writing && this._len >= this.minLength && this._actualWrite(), this._len < this._hwm);
}
function gi(e) {
  if (this.destroyed)
    throw new Error("SonicBoom destroyed");
  const t = this._len + e.length, n = this._bufs, r = this._lens;
  return this.maxLength && t > this.maxLength ? (this.emit("drop", e), this._len < this._hwm) : (n.length === 0 || r[r.length - 1] + e.length > this.maxWrite ? (n.push([e]), r.push(e.length)) : (n[n.length - 1].push(e), r[r.length - 1] += e.length), this._len = t, !this._writing && this._len >= this.minLength && this._actualWrite(), this._len < this._hwm);
}
function tn(e) {
  this._flushPending = !0;
  const t = () => {
    if (this._fsync)
      this._flushPending = !1, e();
    else
      try {
        N.fsync(this.fd, (r) => {
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
function pi(e) {
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
  e && tn.call(this, e), !this._writing && (this._bufs.length === 0 && this._bufs.push(""), this._actualWrite());
}
function Si(e) {
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
  e && tn.call(this, e), !this._writing && (this._bufs.length === 0 && (this._bufs.push([]), this._lens.push(0)), this._actualWrite());
}
X.prototype.reopen = function(e) {
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
    t !== this.fd && N.close(t, (n) => {
      if (n)
        return this.emit("error", n);
    });
  }), Zt(this.file, this);
};
X.prototype.end = function() {
  if (this.destroyed)
    throw new Error("SonicBoom destroyed");
  if (this._opening) {
    this.once("ready", () => {
      this.end();
    });
    return;
  }
  this._ending || (this._ending = !0, !this._writing && (this._len > 0 && this.fd >= 0 ? this._actualWrite() : Ee(this)));
};
function wi() {
  if (this.destroyed)
    throw new Error("SonicBoom destroyed");
  if (this.fd < 0)
    throw new Error("sonic boom is not ready yet");
  !this._writing && this._writingBuf.length > 0 && (this._bufs.unshift(this._writingBuf), this._writingBuf = "");
  let e = "";
  for (; this._bufs.length || e.length; ) {
    e.length <= 0 && (e = this._bufs[0]);
    try {
      const t = Buffer.isBuffer(e) ? N.writeSync(this.fd, e) : N.writeSync(this.fd, e, "utf8"), n = Ve(e, this._len, t);
      e = n.writingBuf, this._len = n.len, e.length <= 0 && this._bufs.shift();
    } catch (t) {
      if ((t.code === "EAGAIN" || t.code === "EBUSY") && !this.retryEAGAIN(t, e.length, this._len - e.length))
        throw t;
      He(Se);
    }
  }
  try {
    N.fsyncSync(this.fd);
  } catch {
  }
}
function bi() {
  if (this.destroyed)
    throw new Error("SonicBoom destroyed");
  if (this.fd < 0)
    throw new Error("sonic boom is not ready yet");
  !this._writing && this._writingBuf.length > 0 && (this._bufs.unshift([this._writingBuf]), this._writingBuf = we);
  let e = we;
  for (; this._bufs.length || e.length; ) {
    e.length <= 0 && (e = en(this._bufs[0], this._lens[0]));
    try {
      const t = N.writeSync(this.fd, e);
      e = e.subarray(t), this._len = Math.max(this._len - t, 0), e.length <= 0 && (this._bufs.shift(), this._lens.shift());
    } catch (t) {
      if ((t.code === "EAGAIN" || t.code === "EBUSY") && !this.retryEAGAIN(t, e.length, this._len - e.length))
        throw t;
      He(Se);
    }
  }
}
X.prototype.destroy = function() {
  this.destroyed || Ee(this);
};
function $i() {
  const e = this.release;
  if (this._writing = !0, this._writingBuf = this._writingBuf.length ? this._writingBuf : this._bufs.shift() || "", this.sync)
    try {
      const t = Buffer.isBuffer(this._writingBuf) ? N.writeSync(this.fd, this._writingBuf) : N.writeSync(this.fd, this._writingBuf, "utf8");
      e(null, t);
    } catch (t) {
      e(t);
    }
  else
    N.write(this.fd, this._writingBuf, e);
}
function _i() {
  const e = this.release;
  if (this._writing = !0, this._writingBuf = this._writingBuf.length ? this._writingBuf : en(this._bufs.shift(), this._lens.shift()), this.sync)
    try {
      const t = N.writeSync(this.fd, this._writingBuf);
      e(null, t);
    } catch (t) {
      e(t);
    }
  else
    di && (this._writingBuf = Buffer.from(this._writingBuf)), N.write(this.fd, this._writingBuf, e);
}
function Ee(e) {
  if (e.fd === -1) {
    e.once("ready", Ee.bind(null, e));
    return;
  }
  e._periodicFlushTimer !== void 0 && clearInterval(e._periodicFlushTimer), e.destroyed = !0, e._bufs = [], e._lens = [], ui(typeof e.fd == "number", `sonic.fd must be a number, got ${typeof e.fd}`);
  try {
    N.fsync(e.fd, t);
  } catch {
  }
  function t() {
    e.fd !== 1 && e.fd !== 2 ? N.close(e.fd, n) : n();
  }
  function n(r) {
    if (r) {
      e.emit("error", r);
      return;
    }
    e._ending && !e._writing && e.emit("finish"), e.emit("close");
  }
}
X.SonicBoom = X;
X.default = X;
var Ei = X;
const H = {
  exit: [],
  beforeExit: []
}, nn = {
  exit: xi,
  beforeExit: Li
};
let re;
function vi() {
  re === void 0 && (re = new FinalizationRegistry(Ai));
}
function Oi(e) {
  H[e].length > 0 || process.on(e, nn[e]);
}
function rn(e) {
  H[e].length > 0 || (process.removeListener(e, nn[e]), H.exit.length === 0 && H.beforeExit.length === 0 && (re = void 0));
}
function xi() {
  sn("exit");
}
function Li() {
  sn("beforeExit");
}
function sn(e) {
  for (const t of H[e]) {
    const n = t.deref(), r = t.fn;
    n !== void 0 && r(n, e);
  }
  H[e] = [];
}
function Ai(e) {
  for (const t of ["exit", "beforeExit"]) {
    const n = H[t].indexOf(e);
    H[t].splice(n, n + 1), rn(t);
  }
}
function on(e, t, n) {
  if (t === void 0)
    throw new Error("the object can't be undefined");
  Oi(e);
  const r = new WeakRef(t);
  r.fn = n, vi(), re.register(t, r), H[e].push(r);
}
function Ci(e, t) {
  on("exit", e, t);
}
function Ti(e, t) {
  on("beforeExit", e, t);
}
function ki(e) {
  if (re !== void 0) {
    re.unregister(e);
    for (const t of ["exit", "beforeExit"])
      H[t] = H[t].filter((n) => {
        const r = n.deref();
        return r && r !== e;
      }), rn(t);
  }
}
var fn = {
  register: Ci,
  registerBeforeExit: Ti,
  unregister: ki
};
const Bi = "3.1.0", Pi = {
  version: Bi
};
var Ae, at;
function ji() {
  if (at) return Ae;
  at = 1;
  const e = 1e3;
  function t(r, s, o, d, a) {
    const f = Date.now() + d;
    let c = Atomics.load(r, s);
    if (c === o) {
      a(null, "ok");
      return;
    }
    let i = c;
    const y = ($) => {
      Date.now() > f ? a(null, "timed-out") : setTimeout(() => {
        i = c, c = Atomics.load(r, s), c === i ? y($ >= e ? e : $ * 2) : c === o ? a(null, "ok") : a(null, "not-equal");
      }, $);
    };
    y(1);
  }
  function n(r, s, o, d, a) {
    const f = Date.now() + d;
    let c = Atomics.load(r, s);
    if (c !== o) {
      a(null, "ok");
      return;
    }
    const i = (y) => {
      Date.now() > f ? a(null, "timed-out") : setTimeout(() => {
        c = Atomics.load(r, s), c !== o ? a(null, "ok") : i(y >= e ? e : y * 2);
      }, y);
    };
    i(1);
  }
  return Ae = { wait: t, waitDiff: n }, Ae;
}
var Ce, ht;
function Ri() {
  return ht || (ht = 1, Ce = {
    WRITE_INDEX: 4,
    READ_INDEX: 8
  }), Ce;
}
var Te, dt;
function Ii() {
  if (dt) return Te;
  dt = 1;
  const { version: e } = Pi, { EventEmitter: t } = kt, { Worker: n } = jt, { join: r } = Bt, { pathToFileURL: s } = Dn, { wait: o } = ji(), {
    WRITE_INDEX: d,
    READ_INDEX: a
  } = Ri(), f = Nn, c = Pt, i = Symbol("kImpl"), y = f.constants.MAX_STRING_LENGTH;
  class $ {
    constructor(b) {
      this._value = b;
    }
    deref() {
      return this._value;
    }
  }
  class g {
    register() {
    }
    unregister() {
    }
  }
  const w = process.env.NODE_V8_COVERAGE ? g : tt.FinalizationRegistry || g, B = process.env.NODE_V8_COVERAGE ? $ : tt.WeakRef || $, R = new w((u) => {
    u.exited || u.terminate();
  });
  function I(u, b) {
    const { filename: _, workerData: l } = b, A = ("__bundlerPathsOverrides" in globalThis ? globalThis.__bundlerPathsOverrides : {})["thread-stream-worker"] || r(__dirname, "lib", "worker.js"), x = new n(A, {
      ...b.workerOpts,
      trackUnmanagedFds: !1,
      workerData: {
        filename: _.indexOf("file://") === 0 ? _ : s(_).href,
        dataBuf: u[i].dataBuf,
        stateBuf: u[i].stateBuf,
        workerData: {
          $context: {
            threadStreamVersion: e
          },
          ...l
        }
      }
    });
    return x.stream = new $(u), x.on("message", p), x.on("exit", L), R.register(u, x), x;
  }
  function m(u) {
    c(!u[i].sync), u[i].needDrain && (u[i].needDrain = !1, u.emit("drain"));
  }
  function h(u) {
    const b = Atomics.load(u[i].state, d);
    let _ = u[i].data.length - b;
    if (_ > 0) {
      if (u[i].buf.length === 0) {
        u[i].flushing = !1, u[i].ending ? C(u) : u[i].needDrain && process.nextTick(m, u);
        return;
      }
      let l = u[i].buf.slice(0, _), S = Buffer.byteLength(l);
      S <= _ ? (u[i].buf = u[i].buf.slice(_), E(u, l, h.bind(null, u))) : u.flush(() => {
        if (!u.destroyed) {
          for (Atomics.store(u[i].state, a, 0), Atomics.store(u[i].state, d, 0); S > u[i].data.length; )
            _ = _ / 2, l = u[i].buf.slice(0, _), S = Buffer.byteLength(l);
          u[i].buf = u[i].buf.slice(_), E(u, l, h.bind(null, u));
        }
      });
    } else if (_ === 0) {
      if (b === 0 && u[i].buf.length === 0)
        return;
      u.flush(() => {
        Atomics.store(u[i].state, a, 0), Atomics.store(u[i].state, d, 0), h(u);
      });
    } else
      O(u, new Error("overwritten"));
  }
  function p(u) {
    const b = this.stream.deref();
    if (b === void 0) {
      this.exited = !0, this.terminate();
      return;
    }
    switch (u.code) {
      case "READY":
        this.stream = new B(b), b.flush(() => {
          b[i].ready = !0, b.emit("ready");
        });
        break;
      case "ERROR":
        O(b, u.err);
        break;
      case "EVENT":
        Array.isArray(u.args) ? b.emit(u.name, ...u.args) : b.emit(u.name, u.args);
        break;
      case "WARNING":
        process.emitWarning(u.err);
        break;
      default:
        O(b, new Error("this should not happen: " + u.code));
    }
  }
  function L(u) {
    const b = this.stream.deref();
    b !== void 0 && (R.unregister(b), b.worker.exited = !0, b.worker.off("exit", L), O(b, u !== 0 ? new Error("the worker thread exited") : null));
  }
  class P extends t {
    constructor(b = {}) {
      if (super(), b.bufferSize < 4)
        throw new Error("bufferSize must at least fit a 4-byte utf-8 char");
      this[i] = {}, this[i].stateBuf = new SharedArrayBuffer(128), this[i].state = new Int32Array(this[i].stateBuf), this[i].dataBuf = new SharedArrayBuffer(b.bufferSize || 4 * 1024 * 1024), this[i].data = Buffer.from(this[i].dataBuf), this[i].sync = b.sync || !1, this[i].ending = !1, this[i].ended = !1, this[i].needDrain = !1, this[i].destroyed = !1, this[i].flushing = !1, this[i].ready = !1, this[i].finished = !1, this[i].errored = null, this[i].closed = !1, this[i].buf = "", this.worker = I(this, b), this.on("message", (_, l) => {
        this.worker.postMessage(_, l);
      });
    }
    write(b) {
      if (this[i].destroyed)
        return F(this, new Error("the worker has exited")), !1;
      if (this[i].ending)
        return F(this, new Error("the worker is ending")), !1;
      if (this[i].flushing && this[i].buf.length + b.length >= y)
        try {
          W(this), this[i].flushing = !0;
        } catch (_) {
          return O(this, _), !1;
        }
      if (this[i].buf += b, this[i].sync)
        try {
          return W(this), !0;
        } catch (_) {
          return O(this, _), !1;
        }
      return this[i].flushing || (this[i].flushing = !0, setImmediate(h, this)), this[i].needDrain = this[i].data.length - this[i].buf.length - Atomics.load(this[i].state, d) <= 0, !this[i].needDrain;
    }
    end() {
      this[i].destroyed || (this[i].ending = !0, C(this));
    }
    flush(b) {
      if (this[i].destroyed) {
        typeof b == "function" && process.nextTick(b, new Error("the worker has exited"));
        return;
      }
      const _ = Atomics.load(this[i].state, d);
      o(this[i].state, a, _, 1 / 0, (l, S) => {
        if (l) {
          O(this, l), process.nextTick(b, l);
          return;
        }
        if (S === "not-equal") {
          this.flush(b);
          return;
        }
        process.nextTick(b);
      });
    }
    flushSync() {
      this[i].destroyed || (W(this), M(this));
    }
    unref() {
      this.worker.unref();
    }
    ref() {
      this.worker.ref();
    }
    get ready() {
      return this[i].ready;
    }
    get destroyed() {
      return this[i].destroyed;
    }
    get closed() {
      return this[i].closed;
    }
    get writable() {
      return !this[i].destroyed && !this[i].ending;
    }
    get writableEnded() {
      return this[i].ending;
    }
    get writableFinished() {
      return this[i].finished;
    }
    get writableNeedDrain() {
      return this[i].needDrain;
    }
    get writableObjectMode() {
      return !1;
    }
    get writableErrored() {
      return this[i].errored;
    }
  }
  function F(u, b) {
    setImmediate(() => {
      u.emit("error", b);
    });
  }
  function O(u, b) {
    u[i].destroyed || (u[i].destroyed = !0, b && (u[i].errored = b, F(u, b)), u.worker.exited ? setImmediate(() => {
      u[i].closed = !0, u.emit("close");
    }) : u.worker.terminate().catch(() => {
    }).then(() => {
      u[i].closed = !0, u.emit("close");
    }));
  }
  function E(u, b, _) {
    const l = Atomics.load(u[i].state, d), S = Buffer.byteLength(b);
    return u[i].data.write(b, l), Atomics.store(u[i].state, d, l + S), Atomics.notify(u[i].state, d), _(), !0;
  }
  function C(u) {
    if (!(u[i].ended || !u[i].ending || u[i].flushing)) {
      u[i].ended = !0;
      try {
        u.flushSync();
        let b = Atomics.load(u[i].state, a);
        Atomics.store(u[i].state, d, -1), Atomics.notify(u[i].state, d);
        let _ = 0;
        for (; b !== -1; ) {
          if (Atomics.wait(u[i].state, a, b, 1e3), b = Atomics.load(u[i].state, a), b === -2) {
            O(u, new Error("end() failed"));
            return;
          }
          if (++_ === 10) {
            O(u, new Error("end() took too long (10s)"));
            return;
          }
        }
        process.nextTick(() => {
          u[i].finished = !0, u.emit("finish");
        });
      } catch (b) {
        O(u, b);
      }
    }
  }
  function W(u) {
    const b = () => {
      u[i].ending ? C(u) : u[i].needDrain && process.nextTick(m, u);
    };
    for (u[i].flushing = !1; u[i].buf.length !== 0; ) {
      const _ = Atomics.load(u[i].state, d);
      let l = u[i].data.length - _;
      if (l === 0) {
        M(u), Atomics.store(u[i].state, a, 0), Atomics.store(u[i].state, d, 0);
        continue;
      } else if (l < 0)
        throw new Error("overwritten");
      let S = u[i].buf.slice(0, l), A = Buffer.byteLength(S);
      if (A <= l)
        u[i].buf = u[i].buf.slice(l), E(u, S, b);
      else {
        for (M(u), Atomics.store(u[i].state, a, 0), Atomics.store(u[i].state, d, 0); A > u[i].buf.length; )
          l = l / 2, S = u[i].buf.slice(0, l), A = Buffer.byteLength(S);
        u[i].buf = u[i].buf.slice(l), E(u, S, b);
      }
    }
  }
  function M(u) {
    if (u[i].flushing)
      throw new Error("unable to flush while flushing");
    const b = Atomics.load(u[i].state, d);
    let _ = 0;
    for (; ; ) {
      const l = Atomics.load(u[i].state, a);
      if (l === -2)
        throw Error("_flushSync failed");
      if (l !== b)
        Atomics.wait(u[i].state, a, l, 1e3);
      else
        break;
      if (++_ === 10)
        throw new Error("_flushSync took too long (10s)");
    }
  }
  return Te = P, Te;
}
var ke, yt;
function ln() {
  if (yt) return ke;
  yt = 1;
  const { createRequire: e } = Rn, t = Ut, { join: n, isAbsolute: r, sep: s } = In, o = Qt(), d = fn, a = Ii();
  function f(g) {
    d.register(g, i), d.registerBeforeExit(g, y), g.on("close", function() {
      d.unregister(g);
    });
  }
  function c(g, w, B, R) {
    const I = new a({
      filename: g,
      workerData: w,
      workerOpts: B,
      sync: R
    });
    I.on("ready", m), I.on("close", function() {
      process.removeListener("exit", h);
    }), process.on("exit", h);
    function m() {
      process.removeListener("exit", h), I.unref(), B.autoEnd !== !1 && f(I);
    }
    function h() {
      I.closed || (I.flushSync(), o(100), I.end());
    }
    return I;
  }
  function i(g) {
    g.ref(), g.flushSync(), g.end(), g.once("close", function() {
      g.unref();
    });
  }
  function y(g) {
    g.flushSync();
  }
  function $(g) {
    const { pipeline: w, targets: B, levels: R, dedupe: I, worker: m = {}, caller: h = t(), sync: p = !1 } = g, L = {
      ...g.options
    }, P = typeof h == "string" ? [h] : h, F = "__bundlerPathsOverrides" in globalThis ? globalThis.__bundlerPathsOverrides : {};
    let O = g.target;
    if (O && B)
      throw new Error("only one of target or targets can be specified");
    return B ? (O = F["pino-worker"] || n(__dirname, "worker.js"), L.targets = B.filter((C) => C.target).map((C) => ({
      ...C,
      target: E(C.target)
    })), L.pipelines = B.filter((C) => C.pipeline).map((C) => C.pipeline.map((W) => ({
      ...W,
      level: C.level,
      // duplicate the pipeline `level` property defined in the upper level
      target: E(W.target)
    })))) : w && (O = F["pino-worker"] || n(__dirname, "worker.js"), L.pipelines = [w.map((C) => ({
      ...C,
      target: E(C.target)
    }))]), R && (L.levels = R), I && (L.dedupe = I), L.pinoWillSendConfig = !0, c(E(O), L, m, p);
    function E(C) {
      if (C = F[C] || C, r(C) || C.indexOf("file://") === 0)
        return C;
      if (C === "pino/file")
        return n(__dirname, "..", "file.js");
      let W;
      for (const M of P)
        try {
          const u = M === "node:repl" ? process.cwd() + s : M;
          W = e(u).resolve(C);
          break;
        } catch {
          continue;
        }
      if (!W)
        throw new Error(`unable to determine transport target for "${C}"`);
      return W;
    }
  }
  return ke = $, ke;
}
const mt = Bn, gt = si, { mapHttpRequest: Di, mapHttpResponse: Ni } = qt, Ke = Ei, pt = fn, {
  lsCacheSym: Fi,
  chindingsSym: un,
  writeSym: St,
  serializersSym: cn,
  formatOptsSym: wt,
  endSym: Wi,
  stringifiersSym: an,
  stringifySym: hn,
  stringifySafeSym: Xe,
  wildcardFirstSym: dn,
  nestedKeySym: zi,
  formattersSym: yn,
  messageKeySym: Vi,
  errorKeySym: Ki,
  nestedKeyStrSym: Mi,
  msgPrefixSym: de
} = oe, { isMainThread: qi } = jt, Ui = ln();
let be;
typeof mt.tracingChannel == "function" ? be = mt.tracingChannel("pino_asJson") : be = {
  hasSubscribers: !1,
  traceSync(e, t, n, ...r) {
    return e.call(n, ...r);
  }
};
function ne() {
}
function Ji(e, t) {
  if (!t) return n;
  return function(...s) {
    t.call(this, s, n, e);
  };
  function n(r, ...s) {
    if (typeof r == "object") {
      let o = r;
      r !== null && (r.method && r.headers && r.socket ? r = Di(r) : typeof r.setHeader == "function" && (r = Ni(r)));
      let d;
      o === null && s.length === 0 ? d = [null] : (o = s.shift(), d = s), typeof this[de] == "string" && o !== void 0 && o !== null && (o = this[de] + o), this[St](r, gt(o, d, this[wt]), e);
    } else {
      let o = r === void 0 ? s.shift() : r;
      typeof this[de] == "string" && o !== void 0 && o !== null && (o = this[de] + o), this[St](null, gt(o, s, this[wt]), e);
    }
  }
}
function Be(e) {
  let t = "", n = 0, r = !1, s = 255;
  const o = e.length;
  if (o > 100)
    return JSON.stringify(e);
  for (var d = 0; d < o && s >= 32; d++)
    s = e.charCodeAt(d), (s === 34 || s === 92) && (t += e.slice(n, d) + "\\", n = d, r = !0);
  return r ? t += e.slice(n) : t = e, s < 32 ? JSON.stringify(e) : '"' + t + '"';
}
function Gi(e, t, n, r) {
  if (be.hasSubscribers === !1)
    return bt.call(this, e, t, n, r);
  const s = { instance: this, arguments };
  return be.traceSync(bt, s, this, e, t, n, r);
}
function bt(e, t, n, r) {
  const s = this[hn], o = this[Xe], d = this[an], a = this[Wi], f = this[un], c = this[cn], i = this[yn], y = this[Vi], $ = this[Ki];
  let g = this[Fi][n] + r;
  g = g + f;
  let w;
  i.log && (e = i.log(e));
  const B = d[dn];
  let R = "";
  for (const m in e)
    if (w = e[m], Object.prototype.hasOwnProperty.call(e, m) && w !== void 0) {
      c[m] ? w = c[m](w) : m === $ && c.err && (w = c.err(w));
      const h = d[m] || B;
      switch (typeof w) {
        case "undefined":
        case "function":
          continue;
        case "number":
          Number.isFinite(w) === !1 && (w = null);
        case "boolean":
          h && (w = h(w));
          break;
        case "string":
          w = (h || Be)(w);
          break;
        default:
          w = (h || s)(w, o);
      }
      if (w === void 0) continue;
      const p = Be(m);
      R += "," + p + ":" + w;
    }
  let I = "";
  if (t !== void 0) {
    w = c[y] ? c[y](t) : t;
    const m = d[y] || B;
    switch (typeof w) {
      case "function":
        break;
      case "number":
        Number.isFinite(w) === !1 && (w = null);
      case "boolean":
        m && (w = m(w)), I = ',"' + y + '":' + w;
        break;
      case "string":
        w = (m || Be)(w), I = ',"' + y + '":' + w;
        break;
      default:
        w = (m || s)(w, o), I = ',"' + y + '":' + w;
    }
  }
  return this[zi] && R ? g + this[Mi] + R.slice(1) + "}" + I + a : g + R + I + a;
}
function Hi(e, t) {
  let n, r = e[un];
  const s = e[hn], o = e[Xe], d = e[an], a = d[dn], f = e[cn], c = e[yn].bindings;
  t = c(t);
  for (const i in t)
    if (n = t[i], ((i.length < 5 || i !== "level" && i !== "serializers" && i !== "formatters" && i !== "customLevels") && t.hasOwnProperty(i) && n !== void 0) === !0) {
      if (n = f[i] ? f[i](n) : n, n = (d[i] || a || s)(n, o), n === void 0) continue;
      r += ',"' + i + '":' + n;
    }
  return r;
}
function Xi(e) {
  return e.write !== e.constructor.prototype.write;
}
function pe(e) {
  const t = new Ke(e);
  return t.on("error", n), !e.sync && qi && (pt.register(t, Yi), t.on("close", function() {
    pt.unregister(t);
  })), t;
  function n(r) {
    if (r.code === "EPIPE") {
      t.write = ne, t.end = ne, t.flushSync = ne, t.destroy = ne;
      return;
    }
    t.removeListener("error", n), t.emit("error", r);
  }
}
function Yi(e, t) {
  e.destroyed || (t === "beforeExit" ? (e.flush(), e.on("drain", function() {
    e.end();
  })) : e.flushSync());
}
function Qi(e) {
  return function(n, r, s = {}, o) {
    if (typeof s == "string")
      o = pe({ dest: s }), s = {};
    else if (typeof o == "string") {
      if (s && s.transport)
        throw Error("only one of option.transport or stream can be specified");
      o = pe({ dest: o });
    } else if (s instanceof Ke || s.writable || s._writableState)
      o = s, s = {};
    else if (s.transport) {
      if (s.transport instanceof Ke || s.transport.writable || s.transport._writableState)
        throw Error("option.transport do not allow stream, please pass to option directly. e.g. pino(transport)");
      if (s.transport.targets && s.transport.targets.length && s.formatters && typeof s.formatters.level == "function")
        throw Error("option.transport.targets do not allow custom level formatters");
      let f;
      s.customLevels && (f = s.useOnlyCustomLevels ? s.customLevels : Object.assign({}, s.levels, s.customLevels)), o = Ui({ caller: r, ...s.transport, levels: f });
    }
    if (s = Object.assign({}, e, s), s.serializers = Object.assign({}, e.serializers, s.serializers), s.formatters = Object.assign({}, e.formatters, s.formatters), s.prettyPrint)
      throw new Error("prettyPrint option is no longer supported, see the pino-pretty package (https://github.com/pinojs/pino-pretty)");
    const { enabled: d, onChild: a } = s;
    return d === !1 && (s.level = "silent"), a || (s.onChild = ne), o || (Xi(process.stdout) ? o = process.stdout : o = pe({ fd: process.stdout.fd || 1 })), { opts: s, stream: o };
  };
}
function Zi(e, t) {
  try {
    return JSON.stringify(e);
  } catch {
    try {
      return (t || this[Xe])(e);
    } catch {
      return '"[unable to serialize, circular reference is too complex to analyze]"';
    }
  }
}
function es(e, t, n) {
  return {
    level: e,
    bindings: t,
    log: n
  };
}
function ts(e) {
  const t = Number(e);
  return typeof e == "string" && Number.isFinite(t) ? t : e === void 0 ? 1 : e;
}
var Ye = {
  noop: ne,
  buildSafeSonicBoom: pe,
  asChindings: Hi,
  asJson: Gi,
  genLog: Ji,
  createArgsNormalizer: Qi,
  stringify: Zi,
  buildFormatters: es,
  normalizeDestFileDescriptor: ts
};
const ns = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60
}, rs = {
  ASC: "ASC",
  DESC: "DESC"
};
var Qe = {
  DEFAULT_LEVELS: ns,
  SORTING_ORDER: rs
};
const {
  lsCacheSym: is,
  levelValSym: Me,
  useOnlyCustomLevelsSym: ss,
  streamSym: os,
  formattersSym: fs,
  hooksSym: ls,
  levelCompSym: mn
} = oe, { noop: us, genLog: te } = Ye, { DEFAULT_LEVELS: Z, SORTING_ORDER: gn } = Qe, cs = {
  fatal: (e) => {
    const t = te(Z.fatal, e);
    return function(...n) {
      const r = this[os];
      if (t.call(this, ...n), typeof r.flushSync == "function")
        try {
          r.flushSync();
        } catch {
        }
    };
  },
  error: (e) => te(Z.error, e),
  warn: (e) => te(Z.warn, e),
  info: (e) => te(Z.info, e),
  debug: (e) => te(Z.debug, e),
  trace: (e) => te(Z.trace, e)
}, Ze = Object.keys(Z).reduce((e, t) => (e[Z[t]] = t, e), {}), as = Object.keys(Ze).reduce((e, t) => (e[t] = '{"level":' + Number(t), e), {});
function hs(e) {
  const t = e[fs].level, { labels: n } = e.levels, r = {};
  for (const s in n) {
    const o = t(n[s], Number(s));
    r[s] = JSON.stringify(o).slice(0, -1);
  }
  return e[is] = r, e;
}
function ds(e, t) {
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
function ys(e) {
  const { labels: t, values: n } = this.levels;
  if (typeof e == "number") {
    if (t[e] === void 0) throw Error("unknown level value" + e);
    e = t[e];
  }
  if (n[e] === void 0) throw Error("unknown level " + e);
  const r = this[Me], s = this[Me] = n[e], o = this[ss], d = this[mn], a = this[ls].logMethod;
  for (const f in n) {
    if (d(n[f], s) === !1) {
      this[f] = us;
      continue;
    }
    this[f] = ds(f, o) ? cs[f](a) : te(n[f], a);
  }
  this.emit(
    "level-change",
    e,
    s,
    t[r],
    r,
    this
  );
}
function ms(e) {
  const { levels: t, levelVal: n } = this;
  return t && t.labels ? t.labels[n] : "";
}
function gs(e) {
  const { values: t } = this.levels, n = t[e];
  return n !== void 0 && this[mn](n, this[Me]);
}
function ps(e, t, n) {
  return e === gn.DESC ? t <= n : t >= n;
}
function Ss(e) {
  return typeof e == "string" ? ps.bind(null, e) : e;
}
function ws(e = null, t = !1) {
  const n = e ? Object.keys(e).reduce((o, d) => (o[e[d]] = d, o), {}) : null, r = Object.assign(
    Object.create(Object.prototype, { Infinity: { value: "silent" } }),
    t ? null : Ze,
    n
  ), s = Object.assign(
    Object.create(Object.prototype, { silent: { value: 1 / 0 } }),
    t ? null : Z,
    e
  );
  return { labels: r, values: s };
}
function bs(e, t, n) {
  if (typeof e == "number") {
    if (![].concat(
      Object.keys(t || {}).map((o) => t[o]),
      n ? [] : Object.keys(Ze).map((o) => +o),
      1 / 0
    ).includes(e))
      throw Error(`default level:${e} must be included in custom levels`);
    return;
  }
  const r = Object.assign(
    Object.create(Object.prototype, { silent: { value: 1 / 0 } }),
    n ? null : Z,
    t
  );
  if (!(e in r))
    throw Error(`default level:${e} must be included in custom levels`);
}
function $s(e, t) {
  const { labels: n, values: r } = e;
  for (const s in t) {
    if (s in r)
      throw Error("levels cannot be overridden");
    if (t[s] in n)
      throw Error("pre-existing level values cannot be used for new levels");
  }
}
function _s(e) {
  if (typeof e != "function" && !(typeof e == "string" && Object.values(gn).includes(e)))
    throw new Error('Levels comparison should be one of "ASC", "DESC" or "function" type');
}
var pn = {
  initialLsCache: as,
  genLsCache: hs,
  getLevel: ms,
  setLevel: ys,
  isLevelEnabled: gs,
  mappings: ws,
  assertNoLevelCollisions: $s,
  assertDefaultLevelFound: bs,
  genLevelComparison: Ss,
  assertLevelComparison: _s
}, Sn = { version: "9.14.0" };
const { EventEmitter: Es } = Tn, {
  lsCacheSym: vs,
  levelValSym: Os,
  setLevelSym: $e,
  getLevelSym: $t,
  chindingsSym: _e,
  parsedChindingsSym: xs,
  mixinSym: Ls,
  asJsonSym: wn,
  writeSym: As,
  mixinMergeStrategySym: Cs,
  timeSym: Ts,
  timeSliceIndexSym: ks,
  streamSym: bn,
  serializersSym: ee,
  formattersSym: ie,
  errorKeySym: Bs,
  messageKeySym: Ps,
  useOnlyCustomLevelsSym: js,
  needsMetadataGsym: Rs,
  redactFmtSym: Is,
  stringifySym: Ds,
  formatOptsSym: Ns,
  stringifiersSym: Fs,
  msgPrefixSym: qe,
  hooksSym: Ws
} = oe, {
  getLevel: zs,
  setLevel: Vs,
  isLevelEnabled: Ks,
  mappings: Ms,
  initialLsCache: qs,
  genLsCache: Us,
  assertNoLevelCollisions: Js
} = pn, {
  asChindings: Ue,
  asJson: Gs,
  buildFormatters: Pe,
  stringify: _t,
  noop: $n
} = Ye, {
  version: Hs
} = Sn, Xs = Yt, Ys = class {
}, _n = {
  constructor: Ys,
  child: Zs,
  bindings: eo,
  setBindings: to,
  flush: io,
  isLevelEnabled: Ks,
  version: Hs,
  get level() {
    return this[$t]();
  },
  set level(e) {
    this[$e](e);
  },
  get levelVal() {
    return this[Os];
  },
  set levelVal(e) {
    throw Error("levelVal is read-only");
  },
  get msgPrefix() {
    return this[qe];
  },
  get [Symbol.toStringTag]() {
    return "Pino";
  },
  [vs]: qs,
  [As]: ro,
  [wn]: Gs,
  [$t]: zs,
  [$e]: Vs
};
Object.setPrototypeOf(_n, Es.prototype);
var Qs = function() {
  return Object.create(_n);
};
const ye = (e) => e;
function Zs(e, t) {
  if (!e)
    throw Error("missing bindings for child Pino");
  const n = this[ee], r = this[ie], s = Object.create(this);
  if (t == null)
    return s[ie].bindings !== ye && (s[ie] = Pe(
      r.level,
      ye,
      r.log
    )), s[_e] = Ue(s, e), s[$e](this.level), this.onChild !== $n && this.onChild(s), s;
  if (t.hasOwnProperty("serializers") === !0) {
    s[ee] = /* @__PURE__ */ Object.create(null);
    for (const i in n)
      s[ee][i] = n[i];
    const f = Object.getOwnPropertySymbols(n);
    for (var o = 0; o < f.length; o++) {
      const i = f[o];
      s[ee][i] = n[i];
    }
    for (const i in t.serializers)
      s[ee][i] = t.serializers[i];
    const c = Object.getOwnPropertySymbols(t.serializers);
    for (var d = 0; d < c.length; d++) {
      const i = c[d];
      s[ee][i] = t.serializers[i];
    }
  } else s[ee] = n;
  if (t.hasOwnProperty("formatters")) {
    const { level: f, bindings: c, log: i } = t.formatters;
    s[ie] = Pe(
      f || r.level,
      c || ye,
      i || r.log
    );
  } else
    s[ie] = Pe(
      r.level,
      ye,
      r.log
    );
  if (t.hasOwnProperty("customLevels") === !0 && (Js(this.levels, t.customLevels), s.levels = Ms(t.customLevels, s[js]), Us(s)), typeof t.redact == "object" && t.redact !== null || Array.isArray(t.redact)) {
    s.redact = t.redact;
    const f = Xs(s.redact, _t), c = { stringify: f[Is] };
    s[Ds] = _t, s[Fs] = f, s[Ns] = c;
  }
  typeof t.msgPrefix == "string" && (s[qe] = (this[qe] || "") + t.msgPrefix), s[_e] = Ue(s, e);
  const a = t.level || this.level;
  return s[$e](a), this.onChild(s), s;
}
function eo() {
  const t = `{${this[_e].substr(1)}}`, n = JSON.parse(t);
  return delete n.pid, delete n.hostname, n;
}
function to(e) {
  const t = Ue(this, e);
  this[_e] = t, delete this[xs];
}
function no(e, t) {
  return Object.assign(t, e);
}
function ro(e, t, n) {
  const r = this[Ts](), s = this[Ls], o = this[Bs], d = this[Ps], a = this[Cs] || no;
  let f;
  const c = this[Ws].streamWrite;
  e == null ? f = {} : e instanceof Error ? (f = { [o]: e }, t === void 0 && (t = e.message)) : (f = e, t === void 0 && e[d] === void 0 && e[o] && (t = e[o].message)), s && (f = a(f, s(f, n, this)));
  const i = this[wn](f, t, n, r), y = this[bn];
  y[Rs] === !0 && (y.lastLevel = n, y.lastObj = f, y.lastMsg = t, y.lastTime = r.slice(this[ks]), y.lastLogger = this), y.write(c ? c(i) : i);
}
function io(e) {
  if (e != null && typeof e != "function")
    throw Error("callback must be a function");
  const t = this[bn];
  typeof t.flush == "function" ? t.flush(e || $n) : e && e();
}
var Je = { exports: {} };
(function(e, t) {
  const { hasOwnProperty: n } = Object.prototype, r = I();
  r.configure = I, r.stringify = r, r.default = r, t.stringify = r, t.configure = I, e.exports = r;
  const s = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
  function o(m) {
    return m.length < 5e3 && !s.test(m) ? `"${m}"` : JSON.stringify(m);
  }
  function d(m, h) {
    if (m.length > 200 || h)
      return m.sort(h);
    for (let p = 1; p < m.length; p++) {
      const L = m[p];
      let P = p;
      for (; P !== 0 && m[P - 1] > L; )
        m[P] = m[P - 1], P--;
      m[P] = L;
    }
    return m;
  }
  const a = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(
      Object.getPrototypeOf(
        new Int8Array()
      )
    ),
    Symbol.toStringTag
  ).get;
  function f(m) {
    return a.call(m) !== void 0 && m.length !== 0;
  }
  function c(m, h, p) {
    m.length < p && (p = m.length);
    const L = h === "," ? "" : " ";
    let P = `"0":${L}${m[0]}`;
    for (let F = 1; F < p; F++)
      P += `${h}"${F}":${L}${m[F]}`;
    return P;
  }
  function i(m) {
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
  function $(m, h) {
    let p;
    if (n.call(m, h) && (p = m[h], typeof p != "boolean"))
      throw new TypeError(`The "${h}" argument must be of type boolean`);
    return p === void 0 ? !0 : p;
  }
  function g(m, h) {
    let p;
    if (n.call(m, h)) {
      if (p = m[h], typeof p != "number")
        throw new TypeError(`The "${h}" argument must be of type number`);
      if (!Number.isInteger(p))
        throw new TypeError(`The "${h}" argument must be an integer`);
      if (p < 1)
        throw new RangeError(`The "${h}" argument must be >= 1`);
    }
    return p === void 0 ? 1 / 0 : p;
  }
  function w(m) {
    return m === 1 ? "1 item" : `${m} items`;
  }
  function B(m) {
    const h = /* @__PURE__ */ new Set();
    for (const p of m)
      (typeof p == "string" || typeof p == "number") && h.add(String(p));
    return h;
  }
  function R(m) {
    if (n.call(m, "strict")) {
      const h = m.strict;
      if (typeof h != "boolean")
        throw new TypeError('The "strict" argument must be of type boolean');
      if (h)
        return (p) => {
          let L = `Object can not safely be stringified. Received type ${typeof p}`;
          throw typeof p != "function" && (L += ` (${p.toString()})`), new Error(L);
        };
    }
  }
  function I(m) {
    m = { ...m };
    const h = R(m);
    h && (m.bigint === void 0 && (m.bigint = !1), "circularValue" in m || (m.circularValue = Error));
    const p = i(m), L = $(m, "bigint"), P = y(m), F = typeof P == "function" ? P : void 0, O = g(m, "maximumDepth"), E = g(m, "maximumBreadth");
    function C(_, l, S, A, x, k) {
      let v = l[_];
      switch (typeof v == "object" && v !== null && typeof v.toJSON == "function" && (v = v.toJSON(_)), v = A.call(l, _, v), typeof v) {
        case "string":
          return o(v);
        case "object": {
          if (v === null)
            return "null";
          if (S.indexOf(v) !== -1)
            return p;
          let T = "", z = ",";
          const V = k;
          if (Array.isArray(v)) {
            if (v.length === 0)
              return "[]";
            if (O < S.length + 1)
              return '"[Array]"';
            S.push(v), x !== "" && (k += x, T += `
${k}`, z = `,
${k}`);
            const U = Math.min(v.length, E);
            let Y = 0;
            for (; Y < U - 1; Y++) {
              const fe = C(String(Y), v, S, A, x, k);
              T += fe !== void 0 ? fe : "null", T += z;
            }
            const Q = C(String(Y), v, S, A, x, k);
            if (T += Q !== void 0 ? Q : "null", v.length - 1 > E) {
              const fe = v.length - E - 1;
              T += `${z}"... ${w(fe)} not stringified"`;
            }
            return x !== "" && (T += `
${V}`), S.pop(), `[${T}]`;
          }
          let D = Object.keys(v);
          const K = D.length;
          if (K === 0)
            return "{}";
          if (O < S.length + 1)
            return '"[Object]"';
          let j = "", q = "";
          x !== "" && (k += x, z = `,
${k}`, j = " ");
          const G = Math.min(K, E);
          P && !f(v) && (D = d(D, F)), S.push(v);
          for (let U = 0; U < G; U++) {
            const Y = D[U], Q = C(Y, v, S, A, x, k);
            Q !== void 0 && (T += `${q}${o(Y)}:${j}${Q}`, q = z);
          }
          if (K > E) {
            const U = K - E;
            T += `${q}"...":${j}"${w(U)} not stringified"`, q = z;
          }
          return x !== "" && q.length > 1 && (T = `
${k}${T}
${V}`), S.pop(), `{${T}}`;
        }
        case "number":
          return isFinite(v) ? String(v) : h ? h(v) : "null";
        case "boolean":
          return v === !0 ? "true" : "false";
        case "undefined":
          return;
        case "bigint":
          if (L)
            return String(v);
        default:
          return h ? h(v) : void 0;
      }
    }
    function W(_, l, S, A, x, k) {
      switch (typeof l == "object" && l !== null && typeof l.toJSON == "function" && (l = l.toJSON(_)), typeof l) {
        case "string":
          return o(l);
        case "object": {
          if (l === null)
            return "null";
          if (S.indexOf(l) !== -1)
            return p;
          const v = k;
          let T = "", z = ",";
          if (Array.isArray(l)) {
            if (l.length === 0)
              return "[]";
            if (O < S.length + 1)
              return '"[Array]"';
            S.push(l), x !== "" && (k += x, T += `
${k}`, z = `,
${k}`);
            const K = Math.min(l.length, E);
            let j = 0;
            for (; j < K - 1; j++) {
              const G = W(String(j), l[j], S, A, x, k);
              T += G !== void 0 ? G : "null", T += z;
            }
            const q = W(String(j), l[j], S, A, x, k);
            if (T += q !== void 0 ? q : "null", l.length - 1 > E) {
              const G = l.length - E - 1;
              T += `${z}"... ${w(G)} not stringified"`;
            }
            return x !== "" && (T += `
${v}`), S.pop(), `[${T}]`;
          }
          S.push(l);
          let V = "";
          x !== "" && (k += x, z = `,
${k}`, V = " ");
          let D = "";
          for (const K of A) {
            const j = W(K, l[K], S, A, x, k);
            j !== void 0 && (T += `${D}${o(K)}:${V}${j}`, D = z);
          }
          return x !== "" && D.length > 1 && (T = `
${k}${T}
${v}`), S.pop(), `{${T}}`;
        }
        case "number":
          return isFinite(l) ? String(l) : h ? h(l) : "null";
        case "boolean":
          return l === !0 ? "true" : "false";
        case "undefined":
          return;
        case "bigint":
          if (L)
            return String(l);
        default:
          return h ? h(l) : void 0;
      }
    }
    function M(_, l, S, A, x) {
      switch (typeof l) {
        case "string":
          return o(l);
        case "object": {
          if (l === null)
            return "null";
          if (typeof l.toJSON == "function") {
            if (l = l.toJSON(_), typeof l != "object")
              return M(_, l, S, A, x);
            if (l === null)
              return "null";
          }
          if (S.indexOf(l) !== -1)
            return p;
          const k = x;
          if (Array.isArray(l)) {
            if (l.length === 0)
              return "[]";
            if (O < S.length + 1)
              return '"[Array]"';
            S.push(l), x += A;
            let j = `
${x}`;
            const q = `,
${x}`, G = Math.min(l.length, E);
            let U = 0;
            for (; U < G - 1; U++) {
              const Q = M(String(U), l[U], S, A, x);
              j += Q !== void 0 ? Q : "null", j += q;
            }
            const Y = M(String(U), l[U], S, A, x);
            if (j += Y !== void 0 ? Y : "null", l.length - 1 > E) {
              const Q = l.length - E - 1;
              j += `${q}"... ${w(Q)} not stringified"`;
            }
            return j += `
${k}`, S.pop(), `[${j}]`;
          }
          let v = Object.keys(l);
          const T = v.length;
          if (T === 0)
            return "{}";
          if (O < S.length + 1)
            return '"[Object]"';
          x += A;
          const z = `,
${x}`;
          let V = "", D = "", K = Math.min(T, E);
          f(l) && (V += c(l, z, E), v = v.slice(l.length), K -= l.length, D = z), P && (v = d(v, F)), S.push(l);
          for (let j = 0; j < K; j++) {
            const q = v[j], G = M(q, l[q], S, A, x);
            G !== void 0 && (V += `${D}${o(q)}: ${G}`, D = z);
          }
          if (T > E) {
            const j = T - E;
            V += `${D}"...": "${w(j)} not stringified"`, D = z;
          }
          return D !== "" && (V = `
${x}${V}
${k}`), S.pop(), `{${V}}`;
        }
        case "number":
          return isFinite(l) ? String(l) : h ? h(l) : "null";
        case "boolean":
          return l === !0 ? "true" : "false";
        case "undefined":
          return;
        case "bigint":
          if (L)
            return String(l);
        default:
          return h ? h(l) : void 0;
      }
    }
    function u(_, l, S) {
      switch (typeof l) {
        case "string":
          return o(l);
        case "object": {
          if (l === null)
            return "null";
          if (typeof l.toJSON == "function") {
            if (l = l.toJSON(_), typeof l != "object")
              return u(_, l, S);
            if (l === null)
              return "null";
          }
          if (S.indexOf(l) !== -1)
            return p;
          let A = "";
          const x = l.length !== void 0;
          if (x && Array.isArray(l)) {
            if (l.length === 0)
              return "[]";
            if (O < S.length + 1)
              return '"[Array]"';
            S.push(l);
            const V = Math.min(l.length, E);
            let D = 0;
            for (; D < V - 1; D++) {
              const j = u(String(D), l[D], S);
              A += j !== void 0 ? j : "null", A += ",";
            }
            const K = u(String(D), l[D], S);
            if (A += K !== void 0 ? K : "null", l.length - 1 > E) {
              const j = l.length - E - 1;
              A += `,"... ${w(j)} not stringified"`;
            }
            return S.pop(), `[${A}]`;
          }
          let k = Object.keys(l);
          const v = k.length;
          if (v === 0)
            return "{}";
          if (O < S.length + 1)
            return '"[Object]"';
          let T = "", z = Math.min(v, E);
          x && f(l) && (A += c(l, ",", E), k = k.slice(l.length), z -= l.length, T = ","), P && (k = d(k, F)), S.push(l);
          for (let V = 0; V < z; V++) {
            const D = k[V], K = u(D, l[D], S);
            K !== void 0 && (A += `${T}${o(D)}:${K}`, T = ",");
          }
          if (v > E) {
            const V = v - E;
            A += `${T}"...":"${w(V)} not stringified"`;
          }
          return S.pop(), `{${A}}`;
        }
        case "number":
          return isFinite(l) ? String(l) : h ? h(l) : "null";
        case "boolean":
          return l === !0 ? "true" : "false";
        case "undefined":
          return;
        case "bigint":
          if (L)
            return String(l);
        default:
          return h ? h(l) : void 0;
      }
    }
    function b(_, l, S) {
      if (arguments.length > 1) {
        let A = "";
        if (typeof S == "number" ? A = " ".repeat(Math.min(S, 10)) : typeof S == "string" && (A = S.slice(0, 10)), l != null) {
          if (typeof l == "function")
            return C("", { "": _ }, [], l, A, "");
          if (Array.isArray(l))
            return W("", _, [], B(l), A, "");
        }
        if (A.length !== 0)
          return M("", _, [], A, "");
      }
      return u("", _, []);
    }
    return b;
  }
})(Je, Je.exports);
var so = Je.exports, je, Et;
function oo() {
  if (Et) return je;
  Et = 1;
  const e = Symbol.for("pino.metadata"), { DEFAULT_LEVELS: t } = Qe, n = t.info;
  function r(f, c) {
    f = f || [], c = c || { dedupe: !1 };
    const i = Object.create(t);
    i.silent = 1 / 0, c.levels && typeof c.levels == "object" && Object.keys(c.levels).forEach((h) => {
      i[h] = c.levels[h];
    });
    const y = {
      write: $,
      add: B,
      remove: R,
      emit: g,
      flushSync: w,
      end: I,
      minLevel: 0,
      lastId: 0,
      streams: [],
      clone: m,
      [e]: !0,
      streamLevels: i
    };
    return Array.isArray(f) ? f.forEach(B, y) : B.call(y, f), f = null, y;
    function $(h) {
      let p;
      const L = this.lastLevel, { streams: P } = this;
      let F = 0, O;
      for (let E = o(P.length, c.dedupe); a(E, P.length, c.dedupe); E = d(E, c.dedupe))
        if (p = P[E], p.level <= L) {
          if (F !== 0 && F !== p.level)
            break;
          if (O = p.stream, O[e]) {
            const { lastTime: C, lastMsg: W, lastObj: M, lastLogger: u } = this;
            O.lastLevel = L, O.lastTime = C, O.lastMsg = W, O.lastObj = M, O.lastLogger = u;
          }
          O.write(h), c.dedupe && (F = p.level);
        } else if (!c.dedupe)
          break;
    }
    function g(...h) {
      for (const { stream: p } of this.streams)
        typeof p.emit == "function" && p.emit(...h);
    }
    function w() {
      for (const { stream: h } of this.streams)
        typeof h.flushSync == "function" && h.flushSync();
    }
    function B(h) {
      if (!h)
        return y;
      const p = typeof h.write == "function" || h.stream, L = h.write ? h : h.stream;
      if (!p)
        throw Error("stream object needs to implement either StreamEntry or DestinationStream interface");
      const { streams: P, streamLevels: F } = this;
      let O;
      typeof h.levelVal == "number" ? O = h.levelVal : typeof h.level == "string" ? O = F[h.level] : typeof h.level == "number" ? O = h.level : O = n;
      const E = {
        stream: L,
        level: O,
        levelVal: void 0,
        id: ++y.lastId
      };
      return P.unshift(E), P.sort(s), this.minLevel = P[0].level, y;
    }
    function R(h) {
      const { streams: p } = this, L = p.findIndex((P) => P.id === h);
      return L >= 0 && (p.splice(L, 1), p.sort(s), this.minLevel = p.length > 0 ? p[0].level : -1), y;
    }
    function I() {
      for (const { stream: h } of this.streams)
        typeof h.flushSync == "function" && h.flushSync(), h.end();
    }
    function m(h) {
      const p = new Array(this.streams.length);
      for (let L = 0; L < p.length; L++)
        p[L] = {
          level: h,
          stream: this.streams[L].stream
        };
      return {
        write: $,
        add: B,
        remove: R,
        minLevel: h,
        streams: p,
        clone: m,
        emit: g,
        flushSync: w,
        [e]: !0
      };
    }
  }
  function s(f, c) {
    return f.level - c.level;
  }
  function o(f, c) {
    return c ? f - 1 : 0;
  }
  function d(f, c) {
    return c ? f - 1 : f + 1;
  }
  function a(f, c, i) {
    return i ? f >= 0 : f < c;
  }
  return je = r, je;
}
const fo = Cn, En = qt, lo = Ut, uo = Yt, vn = ri, co = Qs, On = oe, { configure: ao } = so, { assertDefaultLevelFound: ho, mappings: xn, genLsCache: yo, genLevelComparison: mo, assertLevelComparison: go } = pn, { DEFAULT_LEVELS: Ln, SORTING_ORDER: po } = Qe, {
  createArgsNormalizer: So,
  asChindings: wo,
  buildSafeSonicBoom: vt,
  buildFormatters: bo,
  stringify: Re,
  normalizeDestFileDescriptor: Ot,
  noop: $o
} = Ye, { version: _o } = Sn, {
  chindingsSym: xt,
  redactFmtSym: Eo,
  serializersSym: Lt,
  timeSym: vo,
  timeSliceIndexSym: Oo,
  streamSym: xo,
  stringifySym: At,
  stringifySafeSym: Ie,
  stringifiersSym: Ct,
  setLevelSym: Lo,
  endSym: Ao,
  formatOptsSym: Co,
  messageKeySym: To,
  errorKeySym: ko,
  nestedKeySym: Bo,
  mixinSym: Po,
  levelCompSym: jo,
  useOnlyCustomLevelsSym: Ro,
  formattersSym: Tt,
  hooksSym: Io,
  nestedKeyStrSym: Do,
  mixinMergeStrategySym: No,
  msgPrefixSym: Fo
} = On, { epochTime: An, nullTime: Wo } = vn, { pid: zo } = process, Vo = fo.hostname(), Ko = En.err, Mo = {
  level: "info",
  levelComparison: po.ASC,
  levels: Ln,
  messageKey: "msg",
  errorKey: "err",
  nestedKey: null,
  enabled: !0,
  base: { pid: zo, hostname: Vo },
  serializers: Object.assign(/* @__PURE__ */ Object.create(null), {
    err: Ko
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
  timestamp: An,
  name: void 0,
  redact: null,
  customLevels: null,
  useOnlyCustomLevels: !1,
  depthLimit: 5,
  edgeLimit: 100
}, qo = So(Mo), Uo = Object.assign(/* @__PURE__ */ Object.create(null), En);
function et(...e) {
  const t = {}, { opts: n, stream: r } = qo(t, lo(), ...e);
  n.level && typeof n.level == "string" && Ln[n.level.toLowerCase()] !== void 0 && (n.level = n.level.toLowerCase());
  const {
    redact: s,
    crlf: o,
    serializers: d,
    timestamp: a,
    messageKey: f,
    errorKey: c,
    nestedKey: i,
    base: y,
    name: $,
    level: g,
    customLevels: w,
    levelComparison: B,
    mixin: R,
    mixinMergeStrategy: I,
    useOnlyCustomLevels: m,
    formatters: h,
    hooks: p,
    depthLimit: L,
    edgeLimit: P,
    onChild: F,
    msgPrefix: O
  } = n, E = ao({
    maximumDepth: L,
    maximumBreadth: P
  }), C = bo(
    h.level,
    h.bindings,
    h.log
  ), W = Re.bind({
    [Ie]: E
  }), M = s ? uo(s, W) : {}, u = s ? { stringify: M[Eo] } : { stringify: W }, b = "}" + (o ? `\r
` : `
`), _ = wo.bind(null, {
    [xt]: "",
    [Lt]: d,
    [Ct]: M,
    [At]: Re,
    [Ie]: E,
    [Tt]: C
  });
  let l = "";
  y !== null && ($ === void 0 ? l = _(y) : l = _(Object.assign({}, y, { name: $ })));
  const S = a instanceof Function ? a : a ? An : Wo, A = S().indexOf(":") + 1;
  if (m && !w) throw Error("customLevels is required if useOnlyCustomLevels is set true");
  if (R && typeof R != "function") throw Error(`Unknown mixin type "${typeof R}" - expected "function"`);
  if (O && typeof O != "string") throw Error(`Unknown msgPrefix type "${typeof O}" - expected "string"`);
  ho(g, w, m);
  const x = xn(w, m);
  typeof r.emit == "function" && r.emit("message", { code: "PINO_CONFIG", config: { levels: x, messageKey: f, errorKey: c } }), go(B);
  const k = mo(B);
  return Object.assign(t, {
    levels: x,
    [jo]: k,
    [Ro]: m,
    [xo]: r,
    [vo]: S,
    [Oo]: A,
    [At]: Re,
    [Ie]: E,
    [Ct]: M,
    [Ao]: b,
    [Co]: u,
    [To]: f,
    [ko]: c,
    [Bo]: i,
    // protect against injection
    [Do]: i ? `,${JSON.stringify(i)}:{` : "",
    [Lt]: d,
    [Po]: R,
    [No]: I,
    [xt]: l,
    [Tt]: C,
    [Io]: p,
    silent: $o,
    onChild: F,
    [Fo]: O
  }), Object.setPrototypeOf(t, co()), yo(t), t[Lo](g), t;
}
J.exports = et;
J.exports.destination = (e = process.stdout.fd) => typeof e == "object" ? (e.dest = Ot(e.dest || process.stdout.fd), vt(e)) : vt({ dest: Ot(e), minLength: 0 });
J.exports.transport = ln();
J.exports.multistream = oo();
J.exports.levels = xn();
J.exports.stdSerializers = Uo;
J.exports.stdTimeFunctions = Object.assign({}, vn);
J.exports.symbols = On;
J.exports.version = _o;
J.exports.default = et;
J.exports.pino = et;
var Jo = J.exports;
const Go = /* @__PURE__ */ Fn(Jo), Ge = new kn(), Ho = {
  write(e) {
    process.stdout.write(e);
    try {
      const t = JSON.parse(e), r = `[${t.level === 30 ? "INFO" : t.level === 40 ? "WARN" : t.level === 50 ? "ERROR" : "DEBUG"}] ${t.msg || ""}`;
      Ge.emit("log", r);
    } catch {
      Ge.emit("log", e);
    }
  }
}, Xo = Go({
  level: process.env.LOG_LEVEL ?? "info"
}, Ho), df = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  logEmitter: Ge,
  logger: Xo
}, Symbol.toStringTag, { value: "Module" }));
export {
  Fn as a,
  df as b,
  tt as c,
  af as g,
  Xo as l
};
