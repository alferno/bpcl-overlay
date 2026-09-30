import os$1 from "node:os";
import require$$0$6, { EventEmitter as EventEmitter$3 } from "node:events";
import require$$0$5 from "node:diagnostics_channel";
import require$$1$1 from "fs";
import require$$0$1 from "events";
import require$$1 from "util";
import require$$1$2 from "path";
import require$$0$2 from "assert";
import require$$2 from "worker_threads";
import require$$0$4 from "module";
import path$1 from "node:path";
import require$$7 from "url";
import require$$0$3 from "buffer";
var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
function getAugmentedNamespace(n) {
  if (n.__esModule) return n;
  var f = n.default;
  if (typeof f == "function") {
    var a = function a2() {
      if (this instanceof a2) {
        return Reflect.construct(f, arguments, this.constructor);
      }
      return f.apply(this, arguments);
    };
    a.prototype = f.prototype;
  } else a = {};
  Object.defineProperty(a, "__esModule", { value: true });
  Object.keys(n).forEach(function(k) {
    var d = Object.getOwnPropertyDescriptor(n, k);
    Object.defineProperty(a, k, d.get ? d : {
      enumerable: true,
      get: function() {
        return n[k];
      }
    });
  });
  return a;
}
var pino$2 = { exports: {} };
const isErrorLike$2 = (err2) => {
  return err2 && typeof err2.message === "string";
};
const getErrorCause = (err2) => {
  if (!err2) return;
  const cause = err2.cause;
  if (typeof cause === "function") {
    const causeResult = err2.cause();
    return isErrorLike$2(causeResult) ? causeResult : void 0;
  } else {
    return isErrorLike$2(cause) ? cause : void 0;
  }
};
const _stackWithCauses = (err2, seen2) => {
  if (!isErrorLike$2(err2)) return "";
  const stack = err2.stack || "";
  if (seen2.has(err2)) {
    return stack + "\ncauses have become circular...";
  }
  const cause = getErrorCause(err2);
  if (cause) {
    seen2.add(err2);
    return stack + "\ncaused by: " + _stackWithCauses(cause, seen2);
  } else {
    return stack;
  }
};
const stackWithCauses$1 = (err2) => _stackWithCauses(err2, /* @__PURE__ */ new Set());
const _messageWithCauses = (err2, seen2, skip) => {
  if (!isErrorLike$2(err2)) return "";
  const message = skip ? "" : err2.message || "";
  if (seen2.has(err2)) {
    return message + ": ...";
  }
  const cause = getErrorCause(err2);
  if (cause) {
    seen2.add(err2);
    const skipIfVErrorStyleCause = typeof err2.cause === "function";
    return message + (skipIfVErrorStyleCause ? "" : ": ") + _messageWithCauses(cause, seen2, skipIfVErrorStyleCause);
  } else {
    return message;
  }
};
const messageWithCauses$1 = (err2) => _messageWithCauses(err2, /* @__PURE__ */ new Set());
var errHelpers = {
  isErrorLike: isErrorLike$2,
  stackWithCauses: stackWithCauses$1,
  messageWithCauses: messageWithCauses$1
};
const seen$2 = Symbol("circular-ref-tag");
const rawSymbol$2 = Symbol("pino-raw-err-ref");
const pinoErrProto$2 = Object.create({}, {
  type: {
    enumerable: true,
    writable: true,
    value: void 0
  },
  message: {
    enumerable: true,
    writable: true,
    value: void 0
  },
  stack: {
    enumerable: true,
    writable: true,
    value: void 0
  },
  aggregateErrors: {
    enumerable: true,
    writable: true,
    value: void 0
  },
  raw: {
    enumerable: false,
    get: function() {
      return this[rawSymbol$2];
    },
    set: function(val) {
      this[rawSymbol$2] = val;
    }
  }
});
Object.defineProperty(pinoErrProto$2, rawSymbol$2, {
  writable: true,
  value: {}
});
var errProto = {
  pinoErrProto: pinoErrProto$2,
  pinoErrorSymbols: {
    seen: seen$2
  }
};
var err = errSerializer$1;
const { messageWithCauses, stackWithCauses, isErrorLike: isErrorLike$1 } = errHelpers;
const { pinoErrProto: pinoErrProto$1, pinoErrorSymbols: pinoErrorSymbols$1 } = errProto;
const { seen: seen$1 } = pinoErrorSymbols$1;
const { toString: toString$1 } = Object.prototype;
function errSerializer$1(err2) {
  if (!isErrorLike$1(err2)) {
    return err2;
  }
  err2[seen$1] = void 0;
  const _err = Object.create(pinoErrProto$1);
  _err.type = toString$1.call(err2.constructor) === "[object Function]" ? err2.constructor.name : err2.name;
  _err.message = messageWithCauses(err2);
  _err.stack = stackWithCauses(err2);
  if (Array.isArray(err2.errors)) {
    _err.aggregateErrors = err2.errors.map((err3) => errSerializer$1(err3));
  }
  for (const key in err2) {
    if (_err[key] === void 0) {
      const val = err2[key];
      if (isErrorLike$1(val)) {
        if (key !== "cause" && !Object.prototype.hasOwnProperty.call(val, seen$1)) {
          _err[key] = errSerializer$1(val);
        }
      } else {
        _err[key] = val;
      }
    }
  }
  delete err2[seen$1];
  _err.raw = err2;
  return _err;
}
var errWithCause = errWithCauseSerializer$1;
const { isErrorLike } = errHelpers;
const { pinoErrProto, pinoErrorSymbols } = errProto;
const { seen } = pinoErrorSymbols;
const { toString } = Object.prototype;
function errWithCauseSerializer$1(err2) {
  if (!isErrorLike(err2)) {
    return err2;
  }
  err2[seen] = void 0;
  const _err = Object.create(pinoErrProto);
  _err.type = toString.call(err2.constructor) === "[object Function]" ? err2.constructor.name : err2.name;
  _err.message = err2.message;
  _err.stack = err2.stack;
  if (Array.isArray(err2.errors)) {
    _err.aggregateErrors = err2.errors.map((err3) => errWithCauseSerializer$1(err3));
  }
  if (isErrorLike(err2.cause) && !Object.prototype.hasOwnProperty.call(err2.cause, seen)) {
    _err.cause = errWithCauseSerializer$1(err2.cause);
  }
  for (const key in err2) {
    if (_err[key] === void 0) {
      const val = err2[key];
      if (isErrorLike(val)) {
        if (!Object.prototype.hasOwnProperty.call(val, seen)) {
          _err[key] = errWithCauseSerializer$1(val);
        }
      } else {
        _err[key] = val;
      }
    }
  }
  delete err2[seen];
  _err.raw = err2;
  return _err;
}
var req = {
  mapHttpRequest: mapHttpRequest$1,
  reqSerializer
};
const rawSymbol$1 = Symbol("pino-raw-req-ref");
const pinoReqProto = Object.create({}, {
  id: {
    enumerable: true,
    writable: true,
    value: ""
  },
  method: {
    enumerable: true,
    writable: true,
    value: ""
  },
  url: {
    enumerable: true,
    writable: true,
    value: ""
  },
  query: {
    enumerable: true,
    writable: true,
    value: ""
  },
  params: {
    enumerable: true,
    writable: true,
    value: ""
  },
  headers: {
    enumerable: true,
    writable: true,
    value: {}
  },
  remoteAddress: {
    enumerable: true,
    writable: true,
    value: ""
  },
  remotePort: {
    enumerable: true,
    writable: true,
    value: ""
  },
  raw: {
    enumerable: false,
    get: function() {
      return this[rawSymbol$1];
    },
    set: function(val) {
      this[rawSymbol$1] = val;
    }
  }
});
Object.defineProperty(pinoReqProto, rawSymbol$1, {
  writable: true,
  value: {}
});
function reqSerializer(req2) {
  const connection = req2.info || req2.socket;
  const _req = Object.create(pinoReqProto);
  _req.id = typeof req2.id === "function" ? req2.id() : req2.id || (req2.info ? req2.info.id : void 0);
  _req.method = req2.method;
  if (req2.originalUrl) {
    _req.url = req2.originalUrl;
  } else {
    const path2 = req2.path;
    _req.url = typeof path2 === "string" ? path2 : req2.url ? req2.url.path || req2.url : void 0;
  }
  if (req2.query) {
    _req.query = req2.query;
  }
  if (req2.params) {
    _req.params = req2.params;
  }
  _req.headers = req2.headers;
  _req.remoteAddress = connection && connection.remoteAddress;
  _req.remotePort = connection && connection.remotePort;
  _req.raw = req2.raw || req2;
  return _req;
}
function mapHttpRequest$1(req2) {
  return {
    req: reqSerializer(req2)
  };
}
var res = {
  mapHttpResponse: mapHttpResponse$1,
  resSerializer
};
const rawSymbol = Symbol("pino-raw-res-ref");
const pinoResProto = Object.create({}, {
  statusCode: {
    enumerable: true,
    writable: true,
    value: 0
  },
  headers: {
    enumerable: true,
    writable: true,
    value: ""
  },
  raw: {
    enumerable: false,
    get: function() {
      return this[rawSymbol];
    },
    set: function(val) {
      this[rawSymbol] = val;
    }
  }
});
Object.defineProperty(pinoResProto, rawSymbol, {
  writable: true,
  value: {}
});
function resSerializer(res2) {
  const _res = Object.create(pinoResProto);
  _res.statusCode = res2.headersSent ? res2.statusCode : null;
  _res.headers = res2.getHeaders ? res2.getHeaders() : res2._headers;
  _res.raw = res2;
  return _res;
}
function mapHttpResponse$1(res2) {
  return {
    res: resSerializer(res2)
  };
}
const errSerializer = err;
const errWithCauseSerializer = errWithCause;
const reqSerializers = req;
const resSerializers = res;
var pinoStdSerializers = {
  err: errSerializer,
  errWithCause: errWithCauseSerializer,
  mapHttpRequest: reqSerializers.mapHttpRequest,
  mapHttpResponse: resSerializers.mapHttpResponse,
  req: reqSerializers.reqSerializer,
  res: resSerializers.resSerializer,
  wrapErrorSerializer: function wrapErrorSerializer(customSerializer) {
    if (customSerializer === errSerializer) return customSerializer;
    return function wrapErrSerializer(err2) {
      return customSerializer(errSerializer(err2));
    };
  },
  wrapRequestSerializer: function wrapRequestSerializer(customSerializer) {
    if (customSerializer === reqSerializers.reqSerializer) return customSerializer;
    return function wrappedReqSerializer(req2) {
      return customSerializer(reqSerializers.reqSerializer(req2));
    };
  },
  wrapResponseSerializer: function wrapResponseSerializer(customSerializer) {
    if (customSerializer === resSerializers.resSerializer) return customSerializer;
    return function wrappedResSerializer(res2) {
      return customSerializer(resSerializers.resSerializer(res2));
    };
  }
};
function noOpPrepareStackTrace(_, stack) {
  return stack;
}
var caller$1 = function getCallers() {
  const originalPrepare = Error.prepareStackTrace;
  Error.prepareStackTrace = noOpPrepareStackTrace;
  const stack = new Error().stack;
  Error.prepareStackTrace = originalPrepare;
  if (!Array.isArray(stack)) {
    return void 0;
  }
  const entries = stack.slice(2);
  const fileNames = [];
  for (const entry of entries) {
    if (!entry) {
      continue;
    }
    fileNames.push(entry.getFileName());
  }
  return fileNames;
};
function deepClone(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  if (obj instanceof Array) {
    const cloned = [];
    for (let i = 0; i < obj.length; i++) {
      cloned[i] = deepClone(obj[i]);
    }
    return cloned;
  }
  if (typeof obj === "object") {
    const cloned = Object.create(Object.getPrototypeOf(obj));
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
  return obj;
}
function parsePath(path2) {
  const parts = [];
  let current = "";
  let inBrackets = false;
  let inQuotes = false;
  let quoteChar = "";
  for (let i = 0; i < path2.length; i++) {
    const char = path2[i];
    if (!inBrackets && char === ".") {
      if (current) {
        parts.push(current);
        current = "";
      }
    } else if (char === "[") {
      if (current) {
        parts.push(current);
        current = "";
      }
      inBrackets = true;
    } else if (char === "]" && inBrackets) {
      parts.push(current);
      current = "";
      inBrackets = false;
      inQuotes = false;
    } else if ((char === '"' || char === "'") && inBrackets) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
        quoteChar = "";
      } else {
        current += char;
      }
    } else {
      current += char;
    }
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}
function setValue(obj, parts, value) {
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof current !== "object" || current === null || !(key in current)) {
      return false;
    }
    if (typeof current[key] !== "object" || current[key] === null) {
      return false;
    }
    current = current[key];
  }
  const lastKey = parts[parts.length - 1];
  if (lastKey === "*") {
    if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        current[i] = value;
      }
    } else if (typeof current === "object" && current !== null) {
      for (const key in current) {
        if (Object.prototype.hasOwnProperty.call(current, key)) {
          current[key] = value;
        }
      }
    }
  } else {
    if (typeof current === "object" && current !== null && lastKey in current && Object.prototype.hasOwnProperty.call(current, lastKey)) {
      current[lastKey] = value;
    }
  }
  return true;
}
function removeKey(obj, parts) {
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof current !== "object" || current === null || !(key in current)) {
      return false;
    }
    if (typeof current[key] !== "object" || current[key] === null) {
      return false;
    }
    current = current[key];
  }
  const lastKey = parts[parts.length - 1];
  if (lastKey === "*") {
    if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        current[i] = void 0;
      }
    } else if (typeof current === "object" && current !== null) {
      for (const key in current) {
        if (Object.prototype.hasOwnProperty.call(current, key)) {
          delete current[key];
        }
      }
    }
  } else {
    if (typeof current === "object" && current !== null && lastKey in current && Object.prototype.hasOwnProperty.call(current, lastKey)) {
      delete current[lastKey];
    }
  }
  return true;
}
const PATH_NOT_FOUND = Symbol("PATH_NOT_FOUND");
function getValueIfExists(obj, parts) {
  let current = obj;
  for (const part of parts) {
    if (current === null || current === void 0) {
      return PATH_NOT_FOUND;
    }
    if (typeof current !== "object" || current === null) {
      return PATH_NOT_FOUND;
    }
    if (!(part in current)) {
      return PATH_NOT_FOUND;
    }
    current = current[part];
  }
  return current;
}
function getValue(obj, parts) {
  let current = obj;
  for (const part of parts) {
    if (current === null || current === void 0) {
      return void 0;
    }
    if (typeof current !== "object" || current === null) {
      return void 0;
    }
    current = current[part];
  }
  return current;
}
function redactPaths(obj, paths, censor, remove = false) {
  for (const path2 of paths) {
    const parts = parsePath(path2);
    if (parts.includes("*")) {
      redactWildcardPath(obj, parts, censor, path2, remove);
    } else {
      if (remove) {
        removeKey(obj, parts);
      } else {
        const value = getValueIfExists(obj, parts);
        if (value === PATH_NOT_FOUND) {
          continue;
        }
        const actualCensor = typeof censor === "function" ? censor(value, parts) : censor;
        setValue(obj, parts, actualCensor);
      }
    }
  }
}
function redactWildcardPath(obj, parts, censor, originalPath, remove = false) {
  const wildcardIndex = parts.indexOf("*");
  if (wildcardIndex === parts.length - 1) {
    const parentParts = parts.slice(0, -1);
    let current = obj;
    for (const part of parentParts) {
      if (current === null || current === void 0) return;
      if (typeof current !== "object" || current === null) return;
      current = current[part];
    }
    if (Array.isArray(current)) {
      if (remove) {
        for (let i = 0; i < current.length; i++) {
          current[i] = void 0;
        }
      } else {
        for (let i = 0; i < current.length; i++) {
          const indexPath = [...parentParts, i.toString()];
          const actualCensor = typeof censor === "function" ? censor(current[i], indexPath) : censor;
          current[i] = actualCensor;
        }
      }
    } else if (typeof current === "object" && current !== null) {
      if (remove) {
        const keysToDelete = [];
        for (const key in current) {
          if (Object.prototype.hasOwnProperty.call(current, key)) {
            keysToDelete.push(key);
          }
        }
        for (const key of keysToDelete) {
          delete current[key];
        }
      } else {
        for (const key in current) {
          const keyPath = [...parentParts, key];
          const actualCensor = typeof censor === "function" ? censor(current[key], keyPath) : censor;
          current[key] = actualCensor;
        }
      }
    }
  } else {
    redactIntermediateWildcard(obj, parts, censor, wildcardIndex, originalPath, remove);
  }
}
function redactIntermediateWildcard(obj, parts, censor, wildcardIndex, originalPath, remove = false) {
  const beforeWildcard = parts.slice(0, wildcardIndex);
  const afterWildcard = parts.slice(wildcardIndex + 1);
  const pathArray = [];
  function traverse(current, pathLength) {
    if (pathLength === beforeWildcard.length) {
      if (Array.isArray(current)) {
        for (let i = 0; i < current.length; i++) {
          pathArray[pathLength] = i.toString();
          traverse(current[i], pathLength + 1);
        }
      } else if (typeof current === "object" && current !== null) {
        for (const key in current) {
          pathArray[pathLength] = key;
          traverse(current[key], pathLength + 1);
        }
      }
    } else if (pathLength < beforeWildcard.length) {
      const nextKey = beforeWildcard[pathLength];
      if (current && typeof current === "object" && current !== null && nextKey in current) {
        pathArray[pathLength] = nextKey;
        traverse(current[nextKey], pathLength + 1);
      }
    } else {
      if (afterWildcard.includes("*")) {
        const wrappedCensor = typeof censor === "function" ? (value, path2) => {
          const fullPath = [...pathArray.slice(0, pathLength), ...path2];
          return censor(value, fullPath);
        } : censor;
        redactWildcardPath(current, afterWildcard, wrappedCensor, originalPath, remove);
      } else {
        if (remove) {
          removeKey(current, afterWildcard);
        } else {
          const actualCensor = typeof censor === "function" ? censor(getValue(current, afterWildcard), [...pathArray.slice(0, pathLength), ...afterWildcard]) : censor;
          setValue(current, afterWildcard, actualCensor);
        }
      }
    }
  }
  if (beforeWildcard.length === 0) {
    traverse(obj, 0);
  } else {
    let current = obj;
    for (let i = 0; i < beforeWildcard.length; i++) {
      const part = beforeWildcard[i];
      if (current === null || current === void 0) return;
      if (typeof current !== "object" || current === null) return;
      current = current[part];
      pathArray[i] = part;
    }
    if (current !== null && current !== void 0) {
      traverse(current, beforeWildcard.length);
    }
  }
}
function buildPathStructure(pathsToClone) {
  if (pathsToClone.length === 0) {
    return null;
  }
  const pathStructure = /* @__PURE__ */ new Map();
  for (const path2 of pathsToClone) {
    const parts = parsePath(path2);
    let current = pathStructure;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!current.has(part)) {
        current.set(part, /* @__PURE__ */ new Map());
      }
      current = current.get(part);
    }
  }
  return pathStructure;
}
function selectiveClone(obj, pathStructure) {
  if (!pathStructure) {
    return obj;
  }
  function cloneSelectively(source, pathMap, depth = 0) {
    if (!pathMap || pathMap.size === 0) {
      return source;
    }
    if (source === null || typeof source !== "object") {
      return source;
    }
    if (source instanceof Date) {
      return new Date(source.getTime());
    }
    if (Array.isArray(source)) {
      const cloned2 = [];
      for (let i = 0; i < source.length; i++) {
        const indexStr = i.toString();
        if (pathMap.has(indexStr) || pathMap.has("*")) {
          cloned2[i] = cloneSelectively(source[i], pathMap.get(indexStr) || pathMap.get("*"));
        } else {
          cloned2[i] = source[i];
        }
      }
      return cloned2;
    }
    const cloned = Object.create(Object.getPrototypeOf(source));
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        if (pathMap.has(key) || pathMap.has("*")) {
          cloned[key] = cloneSelectively(source[key], pathMap.get(key) || pathMap.get("*"));
        } else {
          cloned[key] = source[key];
        }
      }
    }
    return cloned;
  }
  return cloneSelectively(obj, pathStructure);
}
function validatePath(path2) {
  if (typeof path2 !== "string") {
    throw new Error("Paths must be (non-empty) strings");
  }
  if (path2 === "") {
    throw new Error("Invalid redaction path ()");
  }
  if (path2.includes("..")) {
    throw new Error(`Invalid redaction path (${path2})`);
  }
  if (path2.includes(",")) {
    throw new Error(`Invalid redaction path (${path2})`);
  }
  let bracketCount = 0;
  let inQuotes = false;
  let quoteChar = "";
  for (let i = 0; i < path2.length; i++) {
    const char = path2[i];
    if ((char === '"' || char === "'") && bracketCount > 0) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
        quoteChar = "";
      }
    } else if (char === "[" && !inQuotes) {
      bracketCount++;
    } else if (char === "]" && !inQuotes) {
      bracketCount--;
      if (bracketCount < 0) {
        throw new Error(`Invalid redaction path (${path2})`);
      }
    }
  }
  if (bracketCount !== 0) {
    throw new Error(`Invalid redaction path (${path2})`);
  }
}
function validatePaths(paths) {
  if (!Array.isArray(paths)) {
    throw new TypeError("paths must be an array");
  }
  for (const path2 of paths) {
    validatePath(path2);
  }
}
function slowRedact(options = {}) {
  const {
    paths = [],
    censor = "[REDACTED]",
    serialize = JSON.stringify,
    strict: strict2 = true,
    remove = false
  } = options;
  validatePaths(paths);
  const pathStructure = buildPathStructure(paths);
  return function redact2(obj) {
    if (strict2 && (obj === null || typeof obj !== "object")) {
      if (obj === null || obj === void 0) {
        return serialize ? serialize(obj) : obj;
      }
      if (typeof obj !== "object") {
        return serialize ? serialize(obj) : obj;
      }
    }
    const cloned = selectiveClone(obj, pathStructure);
    const original = obj;
    let actualCensor = censor;
    if (typeof censor === "function") {
      actualCensor = censor;
    }
    redactPaths(cloned, paths, actualCensor, remove);
    if (serialize === false) {
      cloned.restore = function() {
        return deepClone(original);
      };
      return cloned;
    }
    if (typeof serialize === "function") {
      return serialize(cloned);
    }
    return JSON.stringify(cloned);
  };
}
var redact = slowRedact;
const setLevelSym$2 = Symbol("pino.setLevel");
const getLevelSym$1 = Symbol("pino.getLevel");
const levelValSym$2 = Symbol("pino.levelVal");
const levelCompSym$2 = Symbol("pino.levelComp");
const useLevelLabelsSym = Symbol("pino.useLevelLabels");
const useOnlyCustomLevelsSym$3 = Symbol("pino.useOnlyCustomLevels");
const mixinSym$2 = Symbol("pino.mixin");
const lsCacheSym$3 = Symbol("pino.lsCache");
const chindingsSym$3 = Symbol("pino.chindings");
const asJsonSym$1 = Symbol("pino.asJson");
const writeSym$2 = Symbol("pino.write");
const redactFmtSym$3 = Symbol("pino.redactFmt");
const timeSym$2 = Symbol("pino.time");
const timeSliceIndexSym$2 = Symbol("pino.timeSliceIndex");
const streamSym$3 = Symbol("pino.stream");
const stringifySym$3 = Symbol("pino.stringify");
const stringifySafeSym$2 = Symbol("pino.stringifySafe");
const stringifiersSym$3 = Symbol("pino.stringifiers");
const endSym$2 = Symbol("pino.end");
const formatOptsSym$3 = Symbol("pino.formatOpts");
const messageKeySym$3 = Symbol("pino.messageKey");
const errorKeySym$3 = Symbol("pino.errorKey");
const nestedKeySym$2 = Symbol("pino.nestedKey");
const nestedKeyStrSym$2 = Symbol("pino.nestedKeyStr");
const mixinMergeStrategySym$2 = Symbol("pino.mixinMergeStrategy");
const msgPrefixSym$3 = Symbol("pino.msgPrefix");
const wildcardFirstSym$2 = Symbol("pino.wildcardFirst");
const serializersSym$3 = Symbol.for("pino.serializers");
const formattersSym$4 = Symbol.for("pino.formatters");
const hooksSym$3 = Symbol.for("pino.hooks");
const needsMetadataGsym$1 = Symbol.for("pino.metadata");
var symbols$1 = {
  setLevelSym: setLevelSym$2,
  getLevelSym: getLevelSym$1,
  levelValSym: levelValSym$2,
  levelCompSym: levelCompSym$2,
  useLevelLabelsSym,
  mixinSym: mixinSym$2,
  lsCacheSym: lsCacheSym$3,
  chindingsSym: chindingsSym$3,
  asJsonSym: asJsonSym$1,
  writeSym: writeSym$2,
  serializersSym: serializersSym$3,
  redactFmtSym: redactFmtSym$3,
  timeSym: timeSym$2,
  timeSliceIndexSym: timeSliceIndexSym$2,
  streamSym: streamSym$3,
  stringifySym: stringifySym$3,
  stringifySafeSym: stringifySafeSym$2,
  stringifiersSym: stringifiersSym$3,
  endSym: endSym$2,
  formatOptsSym: formatOptsSym$3,
  messageKeySym: messageKeySym$3,
  errorKeySym: errorKeySym$3,
  nestedKeySym: nestedKeySym$2,
  wildcardFirstSym: wildcardFirstSym$2,
  needsMetadataGsym: needsMetadataGsym$1,
  useOnlyCustomLevelsSym: useOnlyCustomLevelsSym$3,
  formattersSym: formattersSym$4,
  hooksSym: hooksSym$3,
  nestedKeyStrSym: nestedKeyStrSym$2,
  mixinMergeStrategySym: mixinMergeStrategySym$2,
  msgPrefixSym: msgPrefixSym$3
};
const Redact = redact;
const { redactFmtSym: redactFmtSym$2, wildcardFirstSym: wildcardFirstSym$1 } = symbols$1;
const rx = /[^.[\]]+|\[([^[\]]*?)\]/g;
const CENSOR = "[Redacted]";
const strict = false;
function redaction$2(opts, serialize) {
  const { paths, censor, remove } = handle(opts);
  const shape = paths.reduce((o, str) => {
    rx.lastIndex = 0;
    const first = rx.exec(str);
    const next = rx.exec(str);
    let ns = first[1] !== void 0 ? first[1].replace(/^(?:"|'|`)(.*)(?:"|'|`)$/, "$1") : first[0];
    if (ns === "*") {
      ns = wildcardFirstSym$1;
    }
    if (next === null) {
      o[ns] = null;
      return o;
    }
    if (o[ns] === null) {
      return o;
    }
    const { index } = next;
    const nextPath = `${str.substr(index, str.length - 1)}`;
    o[ns] = o[ns] || [];
    if (ns !== wildcardFirstSym$1 && o[ns].length === 0) {
      o[ns].push(...o[wildcardFirstSym$1] || []);
    }
    if (ns === wildcardFirstSym$1) {
      Object.keys(o).forEach(function(k) {
        if (o[k]) {
          o[k].push(nextPath);
        }
      });
    }
    o[ns].push(nextPath);
    return o;
  }, {});
  const result = {
    [redactFmtSym$2]: Redact({ paths, censor, serialize, strict, remove })
  };
  const topCensor = (...args) => {
    return typeof censor === "function" ? serialize(censor(...args)) : serialize(censor);
  };
  return [...Object.keys(shape), ...Object.getOwnPropertySymbols(shape)].reduce((o, k) => {
    if (shape[k] === null) {
      o[k] = (value) => topCensor(value, [k]);
    } else {
      const wrappedCensor = typeof censor === "function" ? (value, path2) => {
        return censor(value, [k, ...path2]);
      } : censor;
      o[k] = Redact({
        paths: shape[k],
        censor: wrappedCensor,
        serialize,
        strict,
        remove
      });
    }
    return o;
  }, result);
}
function handle(opts) {
  if (Array.isArray(opts)) {
    opts = { paths: opts, censor: CENSOR };
    return opts;
  }
  let { paths, censor = CENSOR, remove } = opts;
  if (Array.isArray(paths) === false) {
    throw Error("pino – redact must contain an array of strings");
  }
  if (remove === true) censor = void 0;
  return { paths, censor, remove };
}
var redaction_1 = redaction$2;
const nullTime$1 = () => "";
const epochTime$1 = () => `,"time":${Date.now()}`;
const unixTime = () => `,"time":${Math.round(Date.now() / 1e3)}`;
const isoTime = () => `,"time":"${new Date(Date.now()).toISOString()}"`;
const NS_PER_MS = 1000000n;
const NS_PER_SEC = 1000000000n;
const startWallTimeNs = BigInt(Date.now()) * NS_PER_MS;
const startHrTime = process.hrtime.bigint();
const isoTimeNano = () => {
  const elapsedNs = process.hrtime.bigint() - startHrTime;
  const currentTimeNs = startWallTimeNs + elapsedNs;
  const secondsSinceEpoch = currentTimeNs / NS_PER_SEC;
  const nanosWithinSecond = currentTimeNs % NS_PER_SEC;
  const msSinceEpoch = Number(secondsSinceEpoch * 1000n + nanosWithinSecond / 1000000n);
  const date = new Date(msSinceEpoch);
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  const hours = date.getUTCHours().toString().padStart(2, "0");
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  const seconds = date.getUTCSeconds().toString().padStart(2, "0");
  return `,"time":"${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${nanosWithinSecond.toString().padStart(9, "0")}Z"`;
};
var time$1 = { nullTime: nullTime$1, epochTime: epochTime$1, unixTime, isoTime, isoTimeNano };
function tryStringify(o) {
  try {
    return JSON.stringify(o);
  } catch (e) {
    return '"[Circular]"';
  }
}
var quickFormatUnescaped = format$1;
function format$1(f, args, opts) {
  var ss = opts && opts.stringify || tryStringify;
  var offset = 1;
  if (typeof f === "object" && f !== null) {
    var len = args.length + offset;
    if (len === 1) return f;
    var objects = new Array(len);
    objects[0] = ss(f);
    for (var index = 1; index < len; index++) {
      objects[index] = ss(args[index]);
    }
    return objects.join(" ");
  }
  if (typeof f !== "string") {
    return f;
  }
  var argLen = args.length;
  if (argLen === 0) return f;
  var str = "";
  var a = 1 - offset;
  var lastPos = -1;
  var flen = f && f.length || 0;
  for (var i = 0; i < flen; ) {
    if (f.charCodeAt(i) === 37 && i + 1 < flen) {
      lastPos = lastPos > -1 ? lastPos : 0;
      switch (f.charCodeAt(i + 1)) {
        case 100:
        case 102:
          if (a >= argLen)
            break;
          if (args[a] == null) break;
          if (lastPos < i)
            str += f.slice(lastPos, i);
          str += Number(args[a]);
          lastPos = i + 2;
          i++;
          break;
        case 105:
          if (a >= argLen)
            break;
          if (args[a] == null) break;
          if (lastPos < i)
            str += f.slice(lastPos, i);
          str += Math.floor(Number(args[a]));
          lastPos = i + 2;
          i++;
          break;
        case 79:
        case 111:
        case 106:
          if (a >= argLen)
            break;
          if (args[a] === void 0) break;
          if (lastPos < i)
            str += f.slice(lastPos, i);
          var type = typeof args[a];
          if (type === "string") {
            str += "'" + args[a] + "'";
            lastPos = i + 2;
            i++;
            break;
          }
          if (type === "function") {
            str += args[a].name || "<anonymous>";
            lastPos = i + 2;
            i++;
            break;
          }
          str += ss(args[a]);
          lastPos = i + 2;
          i++;
          break;
        case 115:
          if (a >= argLen)
            break;
          if (lastPos < i)
            str += f.slice(lastPos, i);
          str += String(args[a]);
          lastPos = i + 2;
          i++;
          break;
        case 37:
          if (lastPos < i)
            str += f.slice(lastPos, i);
          str += "%";
          lastPos = i + 2;
          i++;
          a--;
          break;
      }
      ++a;
    }
    ++i;
  }
  if (lastPos === -1)
    return f;
  else if (lastPos < flen) {
    str += f.slice(lastPos);
  }
  return str;
}
var atomicSleep = { exports: {} };
if (typeof SharedArrayBuffer !== "undefined" && typeof Atomics !== "undefined") {
  let sleep2 = function(ms) {
    const valid = ms > 0 && ms < Infinity;
    if (valid === false) {
      if (typeof ms !== "number" && typeof ms !== "bigint") {
        throw TypeError("sleep: ms must be a number");
      }
      throw RangeError("sleep: ms must be a number that is greater than 0 but less than Infinity");
    }
    Atomics.wait(nil, 0, 0, Number(ms));
  };
  const nil = new Int32Array(new SharedArrayBuffer(4));
  atomicSleep.exports = sleep2;
} else {
  let sleep2 = function(ms) {
    const valid = ms > 0 && ms < Infinity;
    if (valid === false) {
      if (typeof ms !== "number" && typeof ms !== "bigint") {
        throw TypeError("sleep: ms must be a number");
      }
      throw RangeError("sleep: ms must be a number that is greater than 0 but less than Infinity");
    }
  };
  atomicSleep.exports = sleep2;
}
var atomicSleepExports = atomicSleep.exports;
const fs = require$$1$1;
const EventEmitter$2 = require$$0$1;
const inherits = require$$1.inherits;
const path = require$$1$2;
const sleep$1 = atomicSleepExports;
const assert$1 = require$$0$2;
const BUSY_WRITE_TIMEOUT = 100;
const kEmptyBuffer = Buffer.allocUnsafe(0);
const MAX_WRITE = 16 * 1024;
const kContentModeBuffer = "buffer";
const kContentModeUtf8 = "utf8";
const [major, minor] = (process.versions.node || "0.0").split(".").map(Number);
const kCopyBuffer = major >= 22 && minor >= 7;
function openFile(file, sonic) {
  sonic._opening = true;
  sonic._writing = true;
  sonic._asyncDrainScheduled = false;
  function fileOpened(err2, fd) {
    if (err2) {
      sonic._reopening = false;
      sonic._writing = false;
      sonic._opening = false;
      if (sonic.sync) {
        process.nextTick(() => {
          if (sonic.listenerCount("error") > 0) {
            sonic.emit("error", err2);
          }
        });
      } else {
        sonic.emit("error", err2);
      }
      return;
    }
    const reopening = sonic._reopening;
    sonic.fd = fd;
    sonic.file = file;
    sonic._reopening = false;
    sonic._opening = false;
    sonic._writing = false;
    if (sonic.sync) {
      process.nextTick(() => sonic.emit("ready"));
    } else {
      sonic.emit("ready");
    }
    if (sonic.destroyed) {
      return;
    }
    if (!sonic._writing && sonic._len > sonic.minLength || sonic._flushPending) {
      sonic._actualWrite();
    } else if (reopening) {
      process.nextTick(() => sonic.emit("drain"));
    }
  }
  const flags = sonic.append ? "a" : "w";
  const mode = sonic.mode;
  if (sonic.sync) {
    try {
      if (sonic.mkdir) fs.mkdirSync(path.dirname(file), { recursive: true });
      const fd = fs.openSync(file, flags, mode);
      fileOpened(null, fd);
    } catch (err2) {
      fileOpened(err2);
      throw err2;
    }
  } else if (sonic.mkdir) {
    fs.mkdir(path.dirname(file), { recursive: true }, (err2) => {
      if (err2) return fileOpened(err2);
      fs.open(file, flags, mode, fileOpened);
    });
  } else {
    fs.open(file, flags, mode, fileOpened);
  }
}
function SonicBoom$1(opts) {
  if (!(this instanceof SonicBoom$1)) {
    return new SonicBoom$1(opts);
  }
  let { fd, dest, minLength, maxLength, maxWrite, periodicFlush, sync, append = true, mkdir, retryEAGAIN, fsync, contentMode, mode } = opts || {};
  fd = fd || dest;
  this._len = 0;
  this.fd = -1;
  this._bufs = [];
  this._lens = [];
  this._writing = false;
  this._ending = false;
  this._reopening = false;
  this._asyncDrainScheduled = false;
  this._flushPending = false;
  this._hwm = Math.max(minLength || 0, 16387);
  this.file = null;
  this.destroyed = false;
  this.minLength = minLength || 0;
  this.maxLength = maxLength || 0;
  this.maxWrite = maxWrite || MAX_WRITE;
  this._periodicFlush = periodicFlush || 0;
  this._periodicFlushTimer = void 0;
  this.sync = sync || false;
  this.writable = true;
  this._fsync = fsync || false;
  this.append = append || false;
  this.mode = mode;
  this.retryEAGAIN = retryEAGAIN || (() => true);
  this.mkdir = mkdir || false;
  let fsWriteSync;
  let fsWrite;
  if (contentMode === kContentModeBuffer) {
    this._writingBuf = kEmptyBuffer;
    this.write = writeBuffer;
    this.flush = flushBuffer;
    this.flushSync = flushBufferSync;
    this._actualWrite = actualWriteBuffer;
    fsWriteSync = () => fs.writeSync(this.fd, this._writingBuf);
    fsWrite = () => fs.write(this.fd, this._writingBuf, this.release);
  } else if (contentMode === void 0 || contentMode === kContentModeUtf8) {
    this._writingBuf = "";
    this.write = write$2;
    this.flush = flush$2;
    this.flushSync = flushSync$1;
    this._actualWrite = actualWrite;
    fsWriteSync = () => {
      if (Buffer.isBuffer(this._writingBuf)) {
        return fs.writeSync(this.fd, this._writingBuf);
      }
      return fs.writeSync(this.fd, this._writingBuf, "utf8");
    };
    fsWrite = () => {
      if (Buffer.isBuffer(this._writingBuf)) {
        return fs.write(this.fd, this._writingBuf, this.release);
      }
      return fs.write(this.fd, this._writingBuf, "utf8", this.release);
    };
  } else {
    throw new Error(`SonicBoom supports "${kContentModeUtf8}" and "${kContentModeBuffer}", but passed ${contentMode}`);
  }
  if (typeof fd === "number") {
    this.fd = fd;
    process.nextTick(() => this.emit("ready"));
  } else if (typeof fd === "string") {
    openFile(fd, this);
  } else {
    throw new Error("SonicBoom supports only file descriptors and files");
  }
  if (this.minLength >= this.maxWrite) {
    throw new Error(`minLength should be smaller than maxWrite (${this.maxWrite})`);
  }
  this.release = (err2, n) => {
    if (err2) {
      if ((err2.code === "EAGAIN" || err2.code === "EBUSY") && this.retryEAGAIN(err2, this._writingBuf.length, this._len - this._writingBuf.length)) {
        if (this.sync) {
          try {
            sleep$1(BUSY_WRITE_TIMEOUT);
            this.release(void 0, 0);
          } catch (err3) {
            this.release(err3);
          }
        } else {
          setTimeout(fsWrite, BUSY_WRITE_TIMEOUT);
        }
      } else {
        this._writing = false;
        this.emit("error", err2);
      }
      return;
    }
    this.emit("write", n);
    const releasedBufObj = releaseWritingBuf(this._writingBuf, this._len, n);
    this._len = releasedBufObj.len;
    this._writingBuf = releasedBufObj.writingBuf;
    if (this._writingBuf.length) {
      if (!this.sync) {
        fsWrite();
        return;
      }
      try {
        do {
          const n2 = fsWriteSync();
          const releasedBufObj2 = releaseWritingBuf(this._writingBuf, this._len, n2);
          this._len = releasedBufObj2.len;
          this._writingBuf = releasedBufObj2.writingBuf;
        } while (this._writingBuf.length);
      } catch (err3) {
        this.release(err3);
        return;
      }
    }
    if (this._fsync) {
      fs.fsyncSync(this.fd);
    }
    const len = this._len;
    if (this._reopening) {
      this._writing = false;
      this._reopening = false;
      this.reopen();
    } else if (len > this.minLength) {
      this._actualWrite();
    } else if (this._ending) {
      if (len > 0) {
        this._actualWrite();
      } else {
        this._writing = false;
        actualClose(this);
      }
    } else {
      this._writing = false;
      if (this.sync) {
        if (!this._asyncDrainScheduled) {
          this._asyncDrainScheduled = true;
          process.nextTick(emitDrain, this);
        }
      } else {
        this.emit("drain");
      }
    }
  };
  this.on("newListener", function(name) {
    if (name === "drain") {
      this._asyncDrainScheduled = false;
    }
  });
  if (this._periodicFlush !== 0) {
    this._periodicFlushTimer = setInterval(() => this.flush(null), this._periodicFlush);
    this._periodicFlushTimer.unref();
  }
}
function releaseWritingBuf(writingBuf, len, n) {
  if (typeof writingBuf === "string") {
    writingBuf = Buffer.from(writingBuf);
  }
  len = Math.max(len - n, 0);
  writingBuf = writingBuf.subarray(n);
  return { writingBuf, len };
}
function emitDrain(sonic) {
  const hasListeners = sonic.listenerCount("drain") > 0;
  if (!hasListeners) return;
  sonic._asyncDrainScheduled = false;
  sonic.emit("drain");
}
inherits(SonicBoom$1, EventEmitter$2);
function mergeBuf(bufs, len) {
  if (bufs.length === 0) {
    return kEmptyBuffer;
  }
  if (bufs.length === 1) {
    return bufs[0];
  }
  return Buffer.concat(bufs, len);
}
function write$2(data) {
  if (this.destroyed) {
    throw new Error("SonicBoom destroyed");
  }
  data = "" + data;
  const dataLen = Buffer.byteLength(data);
  const len = this._len + dataLen;
  const bufs = this._bufs;
  if (this.maxLength && len > this.maxLength) {
    this.emit("drop", data);
    return this._len < this._hwm;
  }
  if (bufs.length === 0 || Buffer.byteLength(bufs[bufs.length - 1]) + dataLen > this.maxWrite) {
    bufs.push(data);
  } else {
    bufs[bufs.length - 1] += data;
  }
  this._len = len;
  if (!this._writing && this._len >= this.minLength) {
    this._actualWrite();
  }
  return this._len < this._hwm;
}
function writeBuffer(data) {
  if (this.destroyed) {
    throw new Error("SonicBoom destroyed");
  }
  const len = this._len + data.length;
  const bufs = this._bufs;
  const lens = this._lens;
  if (this.maxLength && len > this.maxLength) {
    this.emit("drop", data);
    return this._len < this._hwm;
  }
  if (bufs.length === 0 || lens[lens.length - 1] + data.length > this.maxWrite) {
    bufs.push([data]);
    lens.push(data.length);
  } else {
    bufs[bufs.length - 1].push(data);
    lens[lens.length - 1] += data.length;
  }
  this._len = len;
  if (!this._writing && this._len >= this.minLength) {
    this._actualWrite();
  }
  return this._len < this._hwm;
}
function callFlushCallbackOnDrain(cb) {
  this._flushPending = true;
  const onDrain = () => {
    if (!this._fsync) {
      try {
        fs.fsync(this.fd, (err2) => {
          this._flushPending = false;
          cb(err2);
        });
      } catch (err2) {
        cb(err2);
      }
    } else {
      this._flushPending = false;
      cb();
    }
    this.off("error", onError);
  };
  const onError = (err2) => {
    this._flushPending = false;
    cb(err2);
    this.off("drain", onDrain);
  };
  this.once("drain", onDrain);
  this.once("error", onError);
}
function flush$2(cb) {
  if (cb != null && typeof cb !== "function") {
    throw new Error("flush cb must be a function");
  }
  if (this.destroyed) {
    const error2 = new Error("SonicBoom destroyed");
    if (cb) {
      cb(error2);
      return;
    }
    throw error2;
  }
  if (this.minLength <= 0) {
    cb == null ? void 0 : cb();
    return;
  }
  if (cb) {
    callFlushCallbackOnDrain.call(this, cb);
  }
  if (this._writing) {
    return;
  }
  if (this._bufs.length === 0) {
    this._bufs.push("");
  }
  this._actualWrite();
}
function flushBuffer(cb) {
  if (cb != null && typeof cb !== "function") {
    throw new Error("flush cb must be a function");
  }
  if (this.destroyed) {
    const error2 = new Error("SonicBoom destroyed");
    if (cb) {
      cb(error2);
      return;
    }
    throw error2;
  }
  if (this.minLength <= 0) {
    cb == null ? void 0 : cb();
    return;
  }
  if (cb) {
    callFlushCallbackOnDrain.call(this, cb);
  }
  if (this._writing) {
    return;
  }
  if (this._bufs.length === 0) {
    this._bufs.push([]);
    this._lens.push(0);
  }
  this._actualWrite();
}
SonicBoom$1.prototype.reopen = function(file) {
  if (this.destroyed) {
    throw new Error("SonicBoom destroyed");
  }
  if (this._opening) {
    this.once("ready", () => {
      this.reopen(file);
    });
    return;
  }
  if (this._ending) {
    return;
  }
  if (!this.file) {
    throw new Error("Unable to reopen a file descriptor, you must pass a file to SonicBoom");
  }
  if (file) {
    this.file = file;
  }
  this._reopening = true;
  if (this._writing) {
    return;
  }
  const fd = this.fd;
  this.once("ready", () => {
    if (fd !== this.fd) {
      fs.close(fd, (err2) => {
        if (err2) {
          return this.emit("error", err2);
        }
      });
    }
  });
  openFile(this.file, this);
};
SonicBoom$1.prototype.end = function() {
  if (this.destroyed) {
    throw new Error("SonicBoom destroyed");
  }
  if (this._opening) {
    this.once("ready", () => {
      this.end();
    });
    return;
  }
  if (this._ending) {
    return;
  }
  this._ending = true;
  if (this._writing) {
    return;
  }
  if (this._len > 0 && this.fd >= 0) {
    this._actualWrite();
  } else {
    actualClose(this);
  }
};
function flushSync$1() {
  if (this.destroyed) {
    throw new Error("SonicBoom destroyed");
  }
  if (this.fd < 0) {
    throw new Error("sonic boom is not ready yet");
  }
  if (!this._writing && this._writingBuf.length > 0) {
    this._bufs.unshift(this._writingBuf);
    this._writingBuf = "";
  }
  let buf = "";
  while (this._bufs.length || buf.length) {
    if (buf.length <= 0) {
      buf = this._bufs[0];
    }
    try {
      const n = Buffer.isBuffer(buf) ? fs.writeSync(this.fd, buf) : fs.writeSync(this.fd, buf, "utf8");
      const releasedBufObj = releaseWritingBuf(buf, this._len, n);
      buf = releasedBufObj.writingBuf;
      this._len = releasedBufObj.len;
      if (buf.length <= 0) {
        this._bufs.shift();
      }
    } catch (err2) {
      const shouldRetry = err2.code === "EAGAIN" || err2.code === "EBUSY";
      if (shouldRetry && !this.retryEAGAIN(err2, buf.length, this._len - buf.length)) {
        throw err2;
      }
      sleep$1(BUSY_WRITE_TIMEOUT);
    }
  }
  try {
    fs.fsyncSync(this.fd);
  } catch {
  }
}
function flushBufferSync() {
  if (this.destroyed) {
    throw new Error("SonicBoom destroyed");
  }
  if (this.fd < 0) {
    throw new Error("sonic boom is not ready yet");
  }
  if (!this._writing && this._writingBuf.length > 0) {
    this._bufs.unshift([this._writingBuf]);
    this._writingBuf = kEmptyBuffer;
  }
  let buf = kEmptyBuffer;
  while (this._bufs.length || buf.length) {
    if (buf.length <= 0) {
      buf = mergeBuf(this._bufs[0], this._lens[0]);
    }
    try {
      const n = fs.writeSync(this.fd, buf);
      buf = buf.subarray(n);
      this._len = Math.max(this._len - n, 0);
      if (buf.length <= 0) {
        this._bufs.shift();
        this._lens.shift();
      }
    } catch (err2) {
      const shouldRetry = err2.code === "EAGAIN" || err2.code === "EBUSY";
      if (shouldRetry && !this.retryEAGAIN(err2, buf.length, this._len - buf.length)) {
        throw err2;
      }
      sleep$1(BUSY_WRITE_TIMEOUT);
    }
  }
}
SonicBoom$1.prototype.destroy = function() {
  if (this.destroyed) {
    return;
  }
  actualClose(this);
};
function actualWrite() {
  const release = this.release;
  this._writing = true;
  this._writingBuf = this._writingBuf.length ? this._writingBuf : this._bufs.shift() || "";
  if (this.sync) {
    try {
      const written = Buffer.isBuffer(this._writingBuf) ? fs.writeSync(this.fd, this._writingBuf) : fs.writeSync(this.fd, this._writingBuf, "utf8");
      release(null, written);
    } catch (err2) {
      release(err2);
    }
  } else {
    fs.write(this.fd, this._writingBuf, release);
  }
}
function actualWriteBuffer() {
  const release = this.release;
  this._writing = true;
  this._writingBuf = this._writingBuf.length ? this._writingBuf : mergeBuf(this._bufs.shift(), this._lens.shift());
  if (this.sync) {
    try {
      const written = fs.writeSync(this.fd, this._writingBuf);
      release(null, written);
    } catch (err2) {
      release(err2);
    }
  } else {
    if (kCopyBuffer) {
      this._writingBuf = Buffer.from(this._writingBuf);
    }
    fs.write(this.fd, this._writingBuf, release);
  }
}
function actualClose(sonic) {
  if (sonic.fd === -1) {
    sonic.once("ready", actualClose.bind(null, sonic));
    return;
  }
  if (sonic._periodicFlushTimer !== void 0) {
    clearInterval(sonic._periodicFlushTimer);
  }
  sonic.destroyed = true;
  sonic._bufs = [];
  sonic._lens = [];
  assert$1(typeof sonic.fd === "number", `sonic.fd must be a number, got ${typeof sonic.fd}`);
  try {
    fs.fsync(sonic.fd, closeWrapped);
  } catch {
  }
  function closeWrapped() {
    if (sonic.fd !== 1 && sonic.fd !== 2) {
      fs.close(sonic.fd, done);
    } else {
      done();
    }
  }
  function done(err2) {
    if (err2) {
      sonic.emit("error", err2);
      return;
    }
    if (sonic._ending && !sonic._writing) {
      sonic.emit("finish");
    }
    sonic.emit("close");
  }
}
SonicBoom$1.SonicBoom = SonicBoom$1;
SonicBoom$1.default = SonicBoom$1;
var sonicBoom = SonicBoom$1;
const refs = {
  exit: [],
  beforeExit: []
};
const functions = {
  exit: onExit$2,
  beforeExit: onBeforeExit
};
let registry$1;
function ensureRegistry() {
  if (registry$1 === void 0) {
    registry$1 = new FinalizationRegistry(clear);
  }
}
function install(event) {
  if (refs[event].length > 0) {
    return;
  }
  process.on(event, functions[event]);
}
function uninstall(event) {
  if (refs[event].length > 0) {
    return;
  }
  process.removeListener(event, functions[event]);
  if (refs.exit.length === 0 && refs.beforeExit.length === 0) {
    registry$1 = void 0;
  }
}
function onExit$2() {
  callRefs("exit");
}
function onBeforeExit() {
  callRefs("beforeExit");
}
function callRefs(event) {
  for (const ref of refs[event]) {
    const obj = ref.deref();
    const fn = ref.fn;
    if (obj !== void 0) {
      fn(obj, event);
    }
  }
  refs[event] = [];
}
function clear(ref) {
  for (const event of ["exit", "beforeExit"]) {
    const index = refs[event].indexOf(ref);
    refs[event].splice(index, index + 1);
    uninstall(event);
  }
}
function _register(event, obj, fn) {
  if (obj === void 0) {
    throw new Error("the object can't be undefined");
  }
  install(event);
  const ref = new WeakRef(obj);
  ref.fn = fn;
  ensureRegistry();
  registry$1.register(obj, ref);
  refs[event].push(ref);
}
function register(obj, fn) {
  _register("exit", obj, fn);
}
function registerBeforeExit(obj, fn) {
  _register("beforeExit", obj, fn);
}
function unregister(obj) {
  if (registry$1 === void 0) {
    return;
  }
  registry$1.unregister(obj);
  for (const event of ["exit", "beforeExit"]) {
    refs[event] = refs[event].filter((ref) => {
      const _obj = ref.deref();
      return _obj && _obj !== obj;
    });
    uninstall(event);
  }
}
var onExitLeakFree = {
  register,
  registerBeforeExit,
  unregister
};
const version$3 = "3.1.0";
const require$$0 = {
  version: version$3
};
const MAX_TIMEOUT = 1e3;
function wait$1(state, index, expected, timeout, done) {
  const max = Date.now() + timeout;
  let current = Atomics.load(state, index);
  if (current === expected) {
    done(null, "ok");
    return;
  }
  let prior = current;
  const check = (backoff) => {
    if (Date.now() > max) {
      done(null, "timed-out");
    } else {
      setTimeout(() => {
        prior = current;
        current = Atomics.load(state, index);
        if (current === prior) {
          check(backoff >= MAX_TIMEOUT ? MAX_TIMEOUT : backoff * 2);
        } else {
          if (current === expected) done(null, "ok");
          else done(null, "not-equal");
        }
      }, backoff);
    }
  };
  check(1);
}
var wait_1 = { wait: wait$1 };
const WRITE_INDEX$1 = 4;
const READ_INDEX$1 = 8;
var indexes = {
  WRITE_INDEX: WRITE_INDEX$1,
  READ_INDEX: READ_INDEX$1
};
const { version: version$2 } = require$$0;
const { EventEmitter: EventEmitter$1 } = require$$0$1;
const { Worker } = require$$2;
const { join: join$1 } = require$$1$2;
const { pathToFileURL } = require$$7;
const { wait } = wait_1;
const {
  WRITE_INDEX,
  READ_INDEX
} = indexes;
const buffer = require$$0$3;
const assert = require$$0$2;
const kImpl = Symbol("kImpl");
const MAX_STRING = buffer.constants.MAX_STRING_LENGTH;
class FakeWeakRef {
  constructor(value) {
    this._value = value;
  }
  deref() {
    return this._value;
  }
}
class FakeFinalizationRegistry {
  register() {
  }
  unregister() {
  }
}
const FinalizationRegistry$1 = process.env.NODE_V8_COVERAGE ? FakeFinalizationRegistry : commonjsGlobal.FinalizationRegistry || FakeFinalizationRegistry;
const WeakRef$1 = process.env.NODE_V8_COVERAGE ? FakeWeakRef : commonjsGlobal.WeakRef || FakeWeakRef;
const registry = new FinalizationRegistry$1((worker) => {
  if (worker.exited) {
    return;
  }
  worker.terminate();
});
function createWorker(stream, opts) {
  const { filename, workerData } = opts;
  const bundlerOverrides = "__bundlerPathsOverrides" in globalThis ? globalThis.__bundlerPathsOverrides : {};
  const toExecute = bundlerOverrides["thread-stream-worker"] || join$1(__dirname, "lib", "worker.js");
  const worker = new Worker(toExecute, {
    ...opts.workerOpts,
    trackUnmanagedFds: false,
    workerData: {
      filename: filename.indexOf("file://") === 0 ? filename : pathToFileURL(filename).href,
      dataBuf: stream[kImpl].dataBuf,
      stateBuf: stream[kImpl].stateBuf,
      workerData: {
        $context: {
          threadStreamVersion: version$2
        },
        ...workerData
      }
    }
  });
  worker.stream = new FakeWeakRef(stream);
  worker.on("message", onWorkerMessage);
  worker.on("exit", onWorkerExit);
  registry.register(stream, worker);
  return worker;
}
function drain(stream) {
  assert(!stream[kImpl].sync);
  if (stream[kImpl].needDrain) {
    stream[kImpl].needDrain = false;
    stream.emit("drain");
  }
}
function nextFlush(stream) {
  const writeIndex = Atomics.load(stream[kImpl].state, WRITE_INDEX);
  let leftover = stream[kImpl].data.length - writeIndex;
  if (leftover > 0) {
    if (stream[kImpl].buf.length === 0) {
      stream[kImpl].flushing = false;
      if (stream[kImpl].ending) {
        end(stream);
      } else if (stream[kImpl].needDrain) {
        process.nextTick(drain, stream);
      }
      return;
    }
    let toWrite = stream[kImpl].buf.slice(0, leftover);
    let toWriteBytes = Buffer.byteLength(toWrite);
    if (toWriteBytes <= leftover) {
      stream[kImpl].buf = stream[kImpl].buf.slice(leftover);
      write$1(stream, toWrite, nextFlush.bind(null, stream));
    } else {
      stream.flush(() => {
        if (stream.destroyed) {
          return;
        }
        Atomics.store(stream[kImpl].state, READ_INDEX, 0);
        Atomics.store(stream[kImpl].state, WRITE_INDEX, 0);
        while (toWriteBytes > stream[kImpl].data.length) {
          leftover = leftover / 2;
          toWrite = stream[kImpl].buf.slice(0, leftover);
          toWriteBytes = Buffer.byteLength(toWrite);
        }
        stream[kImpl].buf = stream[kImpl].buf.slice(leftover);
        write$1(stream, toWrite, nextFlush.bind(null, stream));
      });
    }
  } else if (leftover === 0) {
    if (writeIndex === 0 && stream[kImpl].buf.length === 0) {
      return;
    }
    stream.flush(() => {
      Atomics.store(stream[kImpl].state, READ_INDEX, 0);
      Atomics.store(stream[kImpl].state, WRITE_INDEX, 0);
      nextFlush(stream);
    });
  } else {
    destroy(stream, new Error("overwritten"));
  }
}
function onWorkerMessage(msg) {
  const stream = this.stream.deref();
  if (stream === void 0) {
    this.exited = true;
    this.terminate();
    return;
  }
  switch (msg.code) {
    case "READY":
      this.stream = new WeakRef$1(stream);
      stream.flush(() => {
        stream[kImpl].ready = true;
        stream.emit("ready");
      });
      break;
    case "ERROR":
      destroy(stream, msg.err);
      break;
    case "EVENT":
      if (Array.isArray(msg.args)) {
        stream.emit(msg.name, ...msg.args);
      } else {
        stream.emit(msg.name, msg.args);
      }
      break;
    case "WARNING":
      process.emitWarning(msg.err);
      break;
    default:
      destroy(stream, new Error("this should not happen: " + msg.code));
  }
}
function onWorkerExit(code) {
  const stream = this.stream.deref();
  if (stream === void 0) {
    return;
  }
  registry.unregister(stream);
  stream.worker.exited = true;
  stream.worker.off("exit", onWorkerExit);
  destroy(stream, code !== 0 ? new Error("the worker thread exited") : null);
}
let ThreadStream$1 = class ThreadStream extends EventEmitter$1 {
  constructor(opts = {}) {
    super();
    if (opts.bufferSize < 4) {
      throw new Error("bufferSize must at least fit a 4-byte utf-8 char");
    }
    this[kImpl] = {};
    this[kImpl].stateBuf = new SharedArrayBuffer(128);
    this[kImpl].state = new Int32Array(this[kImpl].stateBuf);
    this[kImpl].dataBuf = new SharedArrayBuffer(opts.bufferSize || 4 * 1024 * 1024);
    this[kImpl].data = Buffer.from(this[kImpl].dataBuf);
    this[kImpl].sync = opts.sync || false;
    this[kImpl].ending = false;
    this[kImpl].ended = false;
    this[kImpl].needDrain = false;
    this[kImpl].destroyed = false;
    this[kImpl].flushing = false;
    this[kImpl].ready = false;
    this[kImpl].finished = false;
    this[kImpl].errored = null;
    this[kImpl].closed = false;
    this[kImpl].buf = "";
    this.worker = createWorker(this, opts);
    this.on("message", (message, transferList) => {
      this.worker.postMessage(message, transferList);
    });
  }
  write(data) {
    if (this[kImpl].destroyed) {
      error(this, new Error("the worker has exited"));
      return false;
    }
    if (this[kImpl].ending) {
      error(this, new Error("the worker is ending"));
      return false;
    }
    if (this[kImpl].flushing && this[kImpl].buf.length + data.length >= MAX_STRING) {
      try {
        writeSync(this);
        this[kImpl].flushing = true;
      } catch (err2) {
        destroy(this, err2);
        return false;
      }
    }
    this[kImpl].buf += data;
    if (this[kImpl].sync) {
      try {
        writeSync(this);
        return true;
      } catch (err2) {
        destroy(this, err2);
        return false;
      }
    }
    if (!this[kImpl].flushing) {
      this[kImpl].flushing = true;
      setImmediate(nextFlush, this);
    }
    this[kImpl].needDrain = this[kImpl].data.length - this[kImpl].buf.length - Atomics.load(this[kImpl].state, WRITE_INDEX) <= 0;
    return !this[kImpl].needDrain;
  }
  end() {
    if (this[kImpl].destroyed) {
      return;
    }
    this[kImpl].ending = true;
    end(this);
  }
  flush(cb) {
    if (this[kImpl].destroyed) {
      if (typeof cb === "function") {
        process.nextTick(cb, new Error("the worker has exited"));
      }
      return;
    }
    const writeIndex = Atomics.load(this[kImpl].state, WRITE_INDEX);
    wait(this[kImpl].state, READ_INDEX, writeIndex, Infinity, (err2, res2) => {
      if (err2) {
        destroy(this, err2);
        process.nextTick(cb, err2);
        return;
      }
      if (res2 === "not-equal") {
        this.flush(cb);
        return;
      }
      process.nextTick(cb);
    });
  }
  flushSync() {
    if (this[kImpl].destroyed) {
      return;
    }
    writeSync(this);
    flushSync(this);
  }
  unref() {
    this.worker.unref();
  }
  ref() {
    this.worker.ref();
  }
  get ready() {
    return this[kImpl].ready;
  }
  get destroyed() {
    return this[kImpl].destroyed;
  }
  get closed() {
    return this[kImpl].closed;
  }
  get writable() {
    return !this[kImpl].destroyed && !this[kImpl].ending;
  }
  get writableEnded() {
    return this[kImpl].ending;
  }
  get writableFinished() {
    return this[kImpl].finished;
  }
  get writableNeedDrain() {
    return this[kImpl].needDrain;
  }
  get writableObjectMode() {
    return false;
  }
  get writableErrored() {
    return this[kImpl].errored;
  }
};
function error(stream, err2) {
  setImmediate(() => {
    stream.emit("error", err2);
  });
}
function destroy(stream, err2) {
  if (stream[kImpl].destroyed) {
    return;
  }
  stream[kImpl].destroyed = true;
  if (err2) {
    stream[kImpl].errored = err2;
    error(stream, err2);
  }
  if (!stream.worker.exited) {
    stream.worker.terminate().catch(() => {
    }).then(() => {
      stream[kImpl].closed = true;
      stream.emit("close");
    });
  } else {
    setImmediate(() => {
      stream[kImpl].closed = true;
      stream.emit("close");
    });
  }
}
function write$1(stream, data, cb) {
  const current = Atomics.load(stream[kImpl].state, WRITE_INDEX);
  const length = Buffer.byteLength(data);
  stream[kImpl].data.write(data, current);
  Atomics.store(stream[kImpl].state, WRITE_INDEX, current + length);
  Atomics.notify(stream[kImpl].state, WRITE_INDEX);
  cb();
  return true;
}
function end(stream) {
  if (stream[kImpl].ended || !stream[kImpl].ending || stream[kImpl].flushing) {
    return;
  }
  stream[kImpl].ended = true;
  try {
    stream.flushSync();
    let readIndex = Atomics.load(stream[kImpl].state, READ_INDEX);
    Atomics.store(stream[kImpl].state, WRITE_INDEX, -1);
    Atomics.notify(stream[kImpl].state, WRITE_INDEX);
    let spins = 0;
    while (readIndex !== -1) {
      Atomics.wait(stream[kImpl].state, READ_INDEX, readIndex, 1e3);
      readIndex = Atomics.load(stream[kImpl].state, READ_INDEX);
      if (readIndex === -2) {
        destroy(stream, new Error("end() failed"));
        return;
      }
      if (++spins === 10) {
        destroy(stream, new Error("end() took too long (10s)"));
        return;
      }
    }
    process.nextTick(() => {
      stream[kImpl].finished = true;
      stream.emit("finish");
    });
  } catch (err2) {
    destroy(stream, err2);
  }
}
function writeSync(stream) {
  const cb = () => {
    if (stream[kImpl].ending) {
      end(stream);
    } else if (stream[kImpl].needDrain) {
      process.nextTick(drain, stream);
    }
  };
  stream[kImpl].flushing = false;
  while (stream[kImpl].buf.length !== 0) {
    const writeIndex = Atomics.load(stream[kImpl].state, WRITE_INDEX);
    let leftover = stream[kImpl].data.length - writeIndex;
    if (leftover === 0) {
      flushSync(stream);
      Atomics.store(stream[kImpl].state, READ_INDEX, 0);
      Atomics.store(stream[kImpl].state, WRITE_INDEX, 0);
      continue;
    } else if (leftover < 0) {
      throw new Error("overwritten");
    }
    let toWrite = stream[kImpl].buf.slice(0, leftover);
    let toWriteBytes = Buffer.byteLength(toWrite);
    if (toWriteBytes <= leftover) {
      stream[kImpl].buf = stream[kImpl].buf.slice(leftover);
      write$1(stream, toWrite, cb);
    } else {
      flushSync(stream);
      Atomics.store(stream[kImpl].state, READ_INDEX, 0);
      Atomics.store(stream[kImpl].state, WRITE_INDEX, 0);
      while (toWriteBytes > stream[kImpl].buf.length) {
        leftover = leftover / 2;
        toWrite = stream[kImpl].buf.slice(0, leftover);
        toWriteBytes = Buffer.byteLength(toWrite);
      }
      stream[kImpl].buf = stream[kImpl].buf.slice(leftover);
      write$1(stream, toWrite, cb);
    }
  }
}
function flushSync(stream) {
  if (stream[kImpl].flushing) {
    throw new Error("unable to flush while flushing");
  }
  const writeIndex = Atomics.load(stream[kImpl].state, WRITE_INDEX);
  let spins = 0;
  while (true) {
    const readIndex = Atomics.load(stream[kImpl].state, READ_INDEX);
    if (readIndex === -2) {
      throw Error("_flushSync failed");
    }
    if (readIndex !== writeIndex) {
      Atomics.wait(stream[kImpl].state, READ_INDEX, readIndex, 1e3);
    } else {
      break;
    }
    if (++spins === 10) {
      throw new Error("_flushSync took too long (10s)");
    }
  }
}
var threadStream = ThreadStream$1;
const { createRequire } = require$$0$4;
const getCallers2 = caller$1;
const { join, isAbsolute, sep } = path$1;
const sleep = atomicSleepExports;
const onExit$1 = onExitLeakFree;
const ThreadStream2 = threadStream;
function setupOnExit(stream) {
  onExit$1.register(stream, autoEnd$1);
  onExit$1.registerBeforeExit(stream, flush$1);
  stream.on("close", function() {
    onExit$1.unregister(stream);
  });
}
function buildStream(filename, workerData, workerOpts, sync) {
  const stream = new ThreadStream2({
    filename,
    workerData,
    workerOpts,
    sync
  });
  stream.on("ready", onReady);
  stream.on("close", function() {
    process.removeListener("exit", onExit2);
  });
  process.on("exit", onExit2);
  function onReady() {
    process.removeListener("exit", onExit2);
    stream.unref();
    if (workerOpts.autoEnd !== false) {
      setupOnExit(stream);
    }
  }
  function onExit2() {
    if (stream.closed) {
      return;
    }
    stream.flushSync();
    sleep(100);
    stream.end();
  }
  return stream;
}
function autoEnd$1(stream) {
  stream.ref();
  stream.flushSync();
  stream.end();
  stream.once("close", function() {
    stream.unref();
  });
}
function flush$1(stream) {
  stream.flushSync();
}
function transport$1(fullOptions) {
  const { pipeline, targets, levels: levels2, dedupe, worker = {}, caller: caller2 = getCallers2(), sync = false } = fullOptions;
  const options = {
    ...fullOptions.options
  };
  const callers = typeof caller2 === "string" ? [caller2] : caller2;
  const bundlerOverrides = "__bundlerPathsOverrides" in globalThis ? globalThis.__bundlerPathsOverrides : {};
  let target = fullOptions.target;
  if (target && targets) {
    throw new Error("only one of target or targets can be specified");
  }
  if (targets) {
    target = bundlerOverrides["pino-worker"] || join(__dirname, "worker.js");
    options.targets = targets.filter((dest) => dest.target).map((dest) => {
      return {
        ...dest,
        target: fixTarget(dest.target)
      };
    });
    options.pipelines = targets.filter((dest) => dest.pipeline).map((dest) => {
      return dest.pipeline.map((t) => {
        return {
          ...t,
          level: dest.level,
          // duplicate the pipeline `level` property defined in the upper level
          target: fixTarget(t.target)
        };
      });
    });
  } else if (pipeline) {
    target = bundlerOverrides["pino-worker"] || join(__dirname, "worker.js");
    options.pipelines = [pipeline.map((dest) => {
      return {
        ...dest,
        target: fixTarget(dest.target)
      };
    })];
  }
  if (levels2) {
    options.levels = levels2;
  }
  if (dedupe) {
    options.dedupe = dedupe;
  }
  options.pinoWillSendConfig = true;
  return buildStream(fixTarget(target), options, worker, sync);
  function fixTarget(origin) {
    origin = bundlerOverrides[origin] || origin;
    if (isAbsolute(origin) || origin.indexOf("file://") === 0) {
      return origin;
    }
    if (origin === "pino/file") {
      return join(__dirname, "..", "file.js");
    }
    let fixTarget2;
    for (const filePath of callers) {
      try {
        const context = filePath === "node:repl" ? process.cwd() + sep : filePath;
        fixTarget2 = createRequire(context).resolve(origin);
        break;
      } catch (err2) {
        continue;
      }
    }
    if (!fixTarget2) {
      throw new Error(`unable to determine transport target for "${origin}"`);
    }
    return fixTarget2;
  }
}
var transport_1 = transport$1;
const diagChan = require$$0$5;
const format = quickFormatUnescaped;
const { mapHttpRequest, mapHttpResponse } = pinoStdSerializers;
const SonicBoom = sonicBoom;
const onExit = onExitLeakFree;
const {
  lsCacheSym: lsCacheSym$2,
  chindingsSym: chindingsSym$2,
  writeSym: writeSym$1,
  serializersSym: serializersSym$2,
  formatOptsSym: formatOptsSym$2,
  endSym: endSym$1,
  stringifiersSym: stringifiersSym$2,
  stringifySym: stringifySym$2,
  stringifySafeSym: stringifySafeSym$1,
  wildcardFirstSym,
  nestedKeySym: nestedKeySym$1,
  formattersSym: formattersSym$3,
  messageKeySym: messageKeySym$2,
  errorKeySym: errorKeySym$2,
  nestedKeyStrSym: nestedKeyStrSym$1,
  msgPrefixSym: msgPrefixSym$2
} = symbols$1;
const { isMainThread } = require$$2;
const transport = transport_1;
let asJsonChan;
if (typeof diagChan.tracingChannel === "function") {
  asJsonChan = diagChan.tracingChannel("pino_asJson");
} else {
  asJsonChan = {
    hasSubscribers: false,
    traceSync(fn, store, thisArg, ...args) {
      return fn.call(thisArg, ...args);
    }
  };
}
function noop$3() {
}
function genLog$1(level, hook) {
  if (!hook) return LOG;
  return function hookWrappedLog(...args) {
    hook.call(this, args, LOG, level);
  };
  function LOG(o, ...n) {
    if (typeof o === "object") {
      let msg = o;
      if (o !== null) {
        if (o.method && o.headers && o.socket) {
          o = mapHttpRequest(o);
        } else if (typeof o.setHeader === "function") {
          o = mapHttpResponse(o);
        }
      }
      let formatParams;
      if (msg === null && n.length === 0) {
        formatParams = [null];
      } else {
        msg = n.shift();
        formatParams = n;
      }
      if (typeof this[msgPrefixSym$2] === "string" && msg !== void 0 && msg !== null) {
        msg = this[msgPrefixSym$2] + msg;
      }
      this[writeSym$1](o, format(msg, formatParams, this[formatOptsSym$2]), level);
    } else {
      let msg = o === void 0 ? n.shift() : o;
      if (typeof this[msgPrefixSym$2] === "string" && msg !== void 0 && msg !== null) {
        msg = this[msgPrefixSym$2] + msg;
      }
      this[writeSym$1](null, format(msg, n, this[formatOptsSym$2]), level);
    }
  }
}
function asString(str) {
  let result = "";
  let last = 0;
  let found = false;
  let point = 255;
  const l = str.length;
  if (l > 100) {
    return JSON.stringify(str);
  }
  for (var i = 0; i < l && point >= 32; i++) {
    point = str.charCodeAt(i);
    if (point === 34 || point === 92) {
      result += str.slice(last, i) + "\\";
      last = i;
      found = true;
    }
  }
  if (!found) {
    result = str;
  } else {
    result += str.slice(last);
  }
  return point < 32 ? JSON.stringify(str) : '"' + result + '"';
}
function asJson$1(obj, msg, num, time2) {
  if (asJsonChan.hasSubscribers === false) {
    return _asJson.call(this, obj, msg, num, time2);
  }
  const store = { instance: this, arguments };
  return asJsonChan.traceSync(_asJson, store, this, obj, msg, num, time2);
}
function _asJson(obj, msg, num, time2) {
  const stringify2 = this[stringifySym$2];
  const stringifySafe = this[stringifySafeSym$1];
  const stringifiers = this[stringifiersSym$2];
  const end2 = this[endSym$1];
  const chindings = this[chindingsSym$2];
  const serializers2 = this[serializersSym$2];
  const formatters = this[formattersSym$3];
  const messageKey = this[messageKeySym$2];
  const errorKey = this[errorKeySym$2];
  let data = this[lsCacheSym$2][num] + time2;
  data = data + chindings;
  let value;
  if (formatters.log) {
    obj = formatters.log(obj);
  }
  const wildcardStringifier = stringifiers[wildcardFirstSym];
  let propStr = "";
  for (const key in obj) {
    value = obj[key];
    if (Object.prototype.hasOwnProperty.call(obj, key) && value !== void 0) {
      if (serializers2[key]) {
        value = serializers2[key](value);
      } else if (key === errorKey && serializers2.err) {
        value = serializers2.err(value);
      }
      const stringifier = stringifiers[key] || wildcardStringifier;
      switch (typeof value) {
        case "undefined":
        case "function":
          continue;
        case "number":
          if (Number.isFinite(value) === false) {
            value = null;
          }
        case "boolean":
          if (stringifier) value = stringifier(value);
          break;
        case "string":
          value = (stringifier || asString)(value);
          break;
        default:
          value = (stringifier || stringify2)(value, stringifySafe);
      }
      if (value === void 0) continue;
      const strKey = asString(key);
      propStr += "," + strKey + ":" + value;
    }
  }
  let msgStr = "";
  if (msg !== void 0) {
    value = serializers2[messageKey] ? serializers2[messageKey](msg) : msg;
    const stringifier = stringifiers[messageKey] || wildcardStringifier;
    switch (typeof value) {
      case "function":
        break;
      case "number":
        if (Number.isFinite(value) === false) {
          value = null;
        }
      case "boolean":
        if (stringifier) value = stringifier(value);
        msgStr = ',"' + messageKey + '":' + value;
        break;
      case "string":
        value = (stringifier || asString)(value);
        msgStr = ',"' + messageKey + '":' + value;
        break;
      default:
        value = (stringifier || stringify2)(value, stringifySafe);
        msgStr = ',"' + messageKey + '":' + value;
    }
  }
  if (this[nestedKeySym$1] && propStr) {
    return data + this[nestedKeyStrSym$1] + propStr.slice(1) + "}" + msgStr + end2;
  } else {
    return data + propStr + msgStr + end2;
  }
}
function asChindings$2(instance, bindings2) {
  let value;
  let data = instance[chindingsSym$2];
  const stringify2 = instance[stringifySym$2];
  const stringifySafe = instance[stringifySafeSym$1];
  const stringifiers = instance[stringifiersSym$2];
  const wildcardStringifier = stringifiers[wildcardFirstSym];
  const serializers2 = instance[serializersSym$2];
  const formatter = instance[formattersSym$3].bindings;
  bindings2 = formatter(bindings2);
  for (const key in bindings2) {
    value = bindings2[key];
    const valid = (key.length < 5 || key !== "level" && key !== "serializers" && key !== "formatters" && key !== "customLevels") && bindings2.hasOwnProperty(key) && value !== void 0;
    if (valid === true) {
      value = serializers2[key] ? serializers2[key](value) : value;
      value = (stringifiers[key] || wildcardStringifier || stringify2)(value, stringifySafe);
      if (value === void 0) continue;
      data += ',"' + key + '":' + value;
    }
  }
  return data;
}
function hasBeenTampered(stream) {
  return stream.write !== stream.constructor.prototype.write;
}
function buildSafeSonicBoom$1(opts) {
  const stream = new SonicBoom(opts);
  stream.on("error", filterBrokenPipe);
  if (!opts.sync && isMainThread) {
    onExit.register(stream, autoEnd);
    stream.on("close", function() {
      onExit.unregister(stream);
    });
  }
  return stream;
  function filterBrokenPipe(err2) {
    if (err2.code === "EPIPE") {
      stream.write = noop$3;
      stream.end = noop$3;
      stream.flushSync = noop$3;
      stream.destroy = noop$3;
      return;
    }
    stream.removeListener("error", filterBrokenPipe);
    stream.emit("error", err2);
  }
}
function autoEnd(stream, eventName) {
  if (stream.destroyed) {
    return;
  }
  if (eventName === "beforeExit") {
    stream.flush();
    stream.on("drain", function() {
      stream.end();
    });
  } else {
    stream.flushSync();
  }
}
function createArgsNormalizer$1(defaultOptions2) {
  return function normalizeArgs(instance, caller2, opts = {}, stream) {
    if (typeof opts === "string") {
      stream = buildSafeSonicBoom$1({ dest: opts });
      opts = {};
    } else if (typeof stream === "string") {
      if (opts && opts.transport) {
        throw Error("only one of option.transport or stream can be specified");
      }
      stream = buildSafeSonicBoom$1({ dest: stream });
    } else if (opts instanceof SonicBoom || opts.writable || opts._writableState) {
      stream = opts;
      opts = {};
    } else if (opts.transport) {
      if (opts.transport instanceof SonicBoom || opts.transport.writable || opts.transport._writableState) {
        throw Error("option.transport do not allow stream, please pass to option directly. e.g. pino(transport)");
      }
      if (opts.transport.targets && opts.transport.targets.length && opts.formatters && typeof opts.formatters.level === "function") {
        throw Error("option.transport.targets do not allow custom level formatters");
      }
      let customLevels;
      if (opts.customLevels) {
        customLevels = opts.useOnlyCustomLevels ? opts.customLevels : Object.assign({}, opts.levels, opts.customLevels);
      }
      stream = transport({ caller: caller2, ...opts.transport, levels: customLevels });
    }
    opts = Object.assign({}, defaultOptions2, opts);
    opts.serializers = Object.assign({}, defaultOptions2.serializers, opts.serializers);
    opts.formatters = Object.assign({}, defaultOptions2.formatters, opts.formatters);
    if (opts.prettyPrint) {
      throw new Error("prettyPrint option is no longer supported, see the pino-pretty package (https://github.com/pinojs/pino-pretty)");
    }
    const { enabled, onChild } = opts;
    if (enabled === false) opts.level = "silent";
    if (!onChild) opts.onChild = noop$3;
    if (!stream) {
      if (!hasBeenTampered(process.stdout)) {
        stream = buildSafeSonicBoom$1({ fd: process.stdout.fd || 1 });
      } else {
        stream = process.stdout;
      }
    }
    return { opts, stream };
  };
}
function stringify$2(obj, stringifySafeFn) {
  try {
    return JSON.stringify(obj);
  } catch (_) {
    try {
      const stringify2 = stringifySafeFn || this[stringifySafeSym$1];
      return stringify2(obj);
    } catch (_2) {
      return '"[unable to serialize, circular reference is too complex to analyze]"';
    }
  }
}
function buildFormatters$2(level, bindings2, log) {
  return {
    level,
    bindings: bindings2,
    log
  };
}
function normalizeDestFileDescriptor$1(destination) {
  const fd = Number(destination);
  if (typeof destination === "string" && Number.isFinite(fd)) {
    return fd;
  }
  if (destination === void 0) {
    return 1;
  }
  return destination;
}
var tools = {
  noop: noop$3,
  buildSafeSonicBoom: buildSafeSonicBoom$1,
  asChindings: asChindings$2,
  asJson: asJson$1,
  genLog: genLog$1,
  createArgsNormalizer: createArgsNormalizer$1,
  stringify: stringify$2,
  buildFormatters: buildFormatters$2,
  normalizeDestFileDescriptor: normalizeDestFileDescriptor$1
};
const DEFAULT_LEVELS$2 = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60
};
const SORTING_ORDER$2 = {
  ASC: "ASC",
  DESC: "DESC"
};
var constants = {
  DEFAULT_LEVELS: DEFAULT_LEVELS$2,
  SORTING_ORDER: SORTING_ORDER$2
};
const {
  lsCacheSym: lsCacheSym$1,
  levelValSym: levelValSym$1,
  useOnlyCustomLevelsSym: useOnlyCustomLevelsSym$2,
  streamSym: streamSym$2,
  formattersSym: formattersSym$2,
  hooksSym: hooksSym$2,
  levelCompSym: levelCompSym$1
} = symbols$1;
const { noop: noop$2, genLog } = tools;
const { DEFAULT_LEVELS: DEFAULT_LEVELS$1, SORTING_ORDER: SORTING_ORDER$1 } = constants;
const levelMethods = {
  fatal: (hook) => {
    const logFatal = genLog(DEFAULT_LEVELS$1.fatal, hook);
    return function(...args) {
      const stream = this[streamSym$2];
      logFatal.call(this, ...args);
      if (typeof stream.flushSync === "function") {
        try {
          stream.flushSync();
        } catch (e) {
        }
      }
    };
  },
  error: (hook) => genLog(DEFAULT_LEVELS$1.error, hook),
  warn: (hook) => genLog(DEFAULT_LEVELS$1.warn, hook),
  info: (hook) => genLog(DEFAULT_LEVELS$1.info, hook),
  debug: (hook) => genLog(DEFAULT_LEVELS$1.debug, hook),
  trace: (hook) => genLog(DEFAULT_LEVELS$1.trace, hook)
};
const nums = Object.keys(DEFAULT_LEVELS$1).reduce((o, k) => {
  o[DEFAULT_LEVELS$1[k]] = k;
  return o;
}, {});
const initialLsCache$1 = Object.keys(nums).reduce((o, k) => {
  o[k] = '{"level":' + Number(k);
  return o;
}, {});
function genLsCache$2(instance) {
  const formatter = instance[formattersSym$2].level;
  const { labels } = instance.levels;
  const cache = {};
  for (const label in labels) {
    const level = formatter(labels[label], Number(label));
    cache[label] = JSON.stringify(level).slice(0, -1);
  }
  instance[lsCacheSym$1] = cache;
  return instance;
}
function isStandardLevel(level, useOnlyCustomLevels) {
  if (useOnlyCustomLevels) {
    return false;
  }
  switch (level) {
    case "fatal":
    case "error":
    case "warn":
    case "info":
    case "debug":
    case "trace":
      return true;
    default:
      return false;
  }
}
function setLevel$1(level) {
  const { labels, values } = this.levels;
  if (typeof level === "number") {
    if (labels[level] === void 0) throw Error("unknown level value" + level);
    level = labels[level];
  }
  if (values[level] === void 0) throw Error("unknown level " + level);
  const preLevelVal = this[levelValSym$1];
  const levelVal = this[levelValSym$1] = values[level];
  const useOnlyCustomLevelsVal = this[useOnlyCustomLevelsSym$2];
  const levelComparison = this[levelCompSym$1];
  const hook = this[hooksSym$2].logMethod;
  for (const key in values) {
    if (levelComparison(values[key], levelVal) === false) {
      this[key] = noop$2;
      continue;
    }
    this[key] = isStandardLevel(key, useOnlyCustomLevelsVal) ? levelMethods[key](hook) : genLog(values[key], hook);
  }
  this.emit(
    "level-change",
    level,
    levelVal,
    labels[preLevelVal],
    preLevelVal,
    this
  );
}
function getLevel$1(level) {
  const { levels: levels2, levelVal } = this;
  return levels2 && levels2.labels ? levels2.labels[levelVal] : "";
}
function isLevelEnabled$1(logLevel) {
  const { values } = this.levels;
  const logLevelVal = values[logLevel];
  return logLevelVal !== void 0 && this[levelCompSym$1](logLevelVal, this[levelValSym$1]);
}
function compareLevel(direction, current, expected) {
  if (direction === SORTING_ORDER$1.DESC) {
    return current <= expected;
  }
  return current >= expected;
}
function genLevelComparison$1(levelComparison) {
  if (typeof levelComparison === "string") {
    return compareLevel.bind(null, levelComparison);
  }
  return levelComparison;
}
function mappings$2(customLevels = null, useOnlyCustomLevels = false) {
  const customNums = customLevels ? Object.keys(customLevels).reduce((o, k) => {
    o[customLevels[k]] = k;
    return o;
  }, {}) : null;
  const labels = Object.assign(
    Object.create(Object.prototype, { Infinity: { value: "silent" } }),
    useOnlyCustomLevels ? null : nums,
    customNums
  );
  const values = Object.assign(
    Object.create(Object.prototype, { silent: { value: Infinity } }),
    useOnlyCustomLevels ? null : DEFAULT_LEVELS$1,
    customLevels
  );
  return { labels, values };
}
function assertDefaultLevelFound$1(defaultLevel, customLevels, useOnlyCustomLevels) {
  if (typeof defaultLevel === "number") {
    const values = [].concat(
      Object.keys(customLevels || {}).map((key) => customLevels[key]),
      useOnlyCustomLevels ? [] : Object.keys(nums).map((level) => +level),
      Infinity
    );
    if (!values.includes(defaultLevel)) {
      throw Error(`default level:${defaultLevel} must be included in custom levels`);
    }
    return;
  }
  const labels = Object.assign(
    Object.create(Object.prototype, { silent: { value: Infinity } }),
    useOnlyCustomLevels ? null : DEFAULT_LEVELS$1,
    customLevels
  );
  if (!(defaultLevel in labels)) {
    throw Error(`default level:${defaultLevel} must be included in custom levels`);
  }
}
function assertNoLevelCollisions$1(levels2, customLevels) {
  const { labels, values } = levels2;
  for (const k in customLevels) {
    if (k in values) {
      throw Error("levels cannot be overridden");
    }
    if (customLevels[k] in labels) {
      throw Error("pre-existing level values cannot be used for new levels");
    }
  }
}
function assertLevelComparison$1(levelComparison) {
  if (typeof levelComparison === "function") {
    return;
  }
  if (typeof levelComparison === "string" && Object.values(SORTING_ORDER$1).includes(levelComparison)) {
    return;
  }
  throw new Error('Levels comparison should be one of "ASC", "DESC" or "function" type');
}
var levels = {
  initialLsCache: initialLsCache$1,
  genLsCache: genLsCache$2,
  getLevel: getLevel$1,
  setLevel: setLevel$1,
  isLevelEnabled: isLevelEnabled$1,
  mappings: mappings$2,
  assertNoLevelCollisions: assertNoLevelCollisions$1,
  assertDefaultLevelFound: assertDefaultLevelFound$1,
  genLevelComparison: genLevelComparison$1,
  assertLevelComparison: assertLevelComparison$1
};
var meta = { version: "9.14.0" };
const { EventEmitter } = require$$0$6;
const {
  lsCacheSym,
  levelValSym,
  setLevelSym: setLevelSym$1,
  getLevelSym,
  chindingsSym: chindingsSym$1,
  parsedChindingsSym,
  mixinSym: mixinSym$1,
  asJsonSym,
  writeSym,
  mixinMergeStrategySym: mixinMergeStrategySym$1,
  timeSym: timeSym$1,
  timeSliceIndexSym: timeSliceIndexSym$1,
  streamSym: streamSym$1,
  serializersSym: serializersSym$1,
  formattersSym: formattersSym$1,
  errorKeySym: errorKeySym$1,
  messageKeySym: messageKeySym$1,
  useOnlyCustomLevelsSym: useOnlyCustomLevelsSym$1,
  needsMetadataGsym,
  redactFmtSym: redactFmtSym$1,
  stringifySym: stringifySym$1,
  formatOptsSym: formatOptsSym$1,
  stringifiersSym: stringifiersSym$1,
  msgPrefixSym: msgPrefixSym$1,
  hooksSym: hooksSym$1
} = symbols$1;
const {
  getLevel,
  setLevel,
  isLevelEnabled,
  mappings: mappings$1,
  initialLsCache,
  genLsCache: genLsCache$1,
  assertNoLevelCollisions
} = levels;
const {
  asChindings: asChindings$1,
  asJson,
  buildFormatters: buildFormatters$1,
  stringify: stringify$1,
  noop: noop$1
} = tools;
const {
  version: version$1
} = meta;
const redaction$1 = redaction_1;
const constructor = class Pino {
};
const prototype = {
  constructor,
  child,
  bindings,
  setBindings,
  flush,
  isLevelEnabled,
  version: version$1,
  get level() {
    return this[getLevelSym]();
  },
  set level(lvl) {
    this[setLevelSym$1](lvl);
  },
  get levelVal() {
    return this[levelValSym];
  },
  set levelVal(n) {
    throw Error("levelVal is read-only");
  },
  get msgPrefix() {
    return this[msgPrefixSym$1];
  },
  get [Symbol.toStringTag]() {
    return "Pino";
  },
  [lsCacheSym]: initialLsCache,
  [writeSym]: write,
  [asJsonSym]: asJson,
  [getLevelSym]: getLevel,
  [setLevelSym$1]: setLevel
};
Object.setPrototypeOf(prototype, EventEmitter.prototype);
var proto$1 = function() {
  return Object.create(prototype);
};
const resetChildingsFormatter = (bindings2) => bindings2;
function child(bindings2, options) {
  if (!bindings2) {
    throw Error("missing bindings for child Pino");
  }
  const serializers2 = this[serializersSym$1];
  const formatters = this[formattersSym$1];
  const instance = Object.create(this);
  if (options == null) {
    if (instance[formattersSym$1].bindings !== resetChildingsFormatter) {
      instance[formattersSym$1] = buildFormatters$1(
        formatters.level,
        resetChildingsFormatter,
        formatters.log
      );
    }
    instance[chindingsSym$1] = asChindings$1(instance, bindings2);
    instance[setLevelSym$1](this.level);
    if (this.onChild !== noop$1) {
      this.onChild(instance);
    }
    return instance;
  }
  if (options.hasOwnProperty("serializers") === true) {
    instance[serializersSym$1] = /* @__PURE__ */ Object.create(null);
    for (const k in serializers2) {
      instance[serializersSym$1][k] = serializers2[k];
    }
    const parentSymbols = Object.getOwnPropertySymbols(serializers2);
    for (var i = 0; i < parentSymbols.length; i++) {
      const ks = parentSymbols[i];
      instance[serializersSym$1][ks] = serializers2[ks];
    }
    for (const bk in options.serializers) {
      instance[serializersSym$1][bk] = options.serializers[bk];
    }
    const bindingsSymbols = Object.getOwnPropertySymbols(options.serializers);
    for (var bi = 0; bi < bindingsSymbols.length; bi++) {
      const bks = bindingsSymbols[bi];
      instance[serializersSym$1][bks] = options.serializers[bks];
    }
  } else instance[serializersSym$1] = serializers2;
  if (options.hasOwnProperty("formatters")) {
    const { level, bindings: chindings, log } = options.formatters;
    instance[formattersSym$1] = buildFormatters$1(
      level || formatters.level,
      chindings || resetChildingsFormatter,
      log || formatters.log
    );
  } else {
    instance[formattersSym$1] = buildFormatters$1(
      formatters.level,
      resetChildingsFormatter,
      formatters.log
    );
  }
  if (options.hasOwnProperty("customLevels") === true) {
    assertNoLevelCollisions(this.levels, options.customLevels);
    instance.levels = mappings$1(options.customLevels, instance[useOnlyCustomLevelsSym$1]);
    genLsCache$1(instance);
  }
  if (typeof options.redact === "object" && options.redact !== null || Array.isArray(options.redact)) {
    instance.redact = options.redact;
    const stringifiers = redaction$1(instance.redact, stringify$1);
    const formatOpts = { stringify: stringifiers[redactFmtSym$1] };
    instance[stringifySym$1] = stringify$1;
    instance[stringifiersSym$1] = stringifiers;
    instance[formatOptsSym$1] = formatOpts;
  }
  if (typeof options.msgPrefix === "string") {
    instance[msgPrefixSym$1] = (this[msgPrefixSym$1] || "") + options.msgPrefix;
  }
  instance[chindingsSym$1] = asChindings$1(instance, bindings2);
  const childLevel = options.level || this.level;
  instance[setLevelSym$1](childLevel);
  this.onChild(instance);
  return instance;
}
function bindings() {
  const chindings = this[chindingsSym$1];
  const chindingsJson = `{${chindings.substr(1)}}`;
  const bindingsFromJson = JSON.parse(chindingsJson);
  delete bindingsFromJson.pid;
  delete bindingsFromJson.hostname;
  return bindingsFromJson;
}
function setBindings(newBindings) {
  const chindings = asChindings$1(this, newBindings);
  this[chindingsSym$1] = chindings;
  delete this[parsedChindingsSym];
}
function defaultMixinMergeStrategy(mergeObject, mixinObject) {
  return Object.assign(mixinObject, mergeObject);
}
function write(_obj, msg, num) {
  const t = this[timeSym$1]();
  const mixin = this[mixinSym$1];
  const errorKey = this[errorKeySym$1];
  const messageKey = this[messageKeySym$1];
  const mixinMergeStrategy = this[mixinMergeStrategySym$1] || defaultMixinMergeStrategy;
  let obj;
  const streamWriteHook = this[hooksSym$1].streamWrite;
  if (_obj === void 0 || _obj === null) {
    obj = {};
  } else if (_obj instanceof Error) {
    obj = { [errorKey]: _obj };
    if (msg === void 0) {
      msg = _obj.message;
    }
  } else {
    obj = _obj;
    if (msg === void 0 && _obj[messageKey] === void 0 && _obj[errorKey]) {
      msg = _obj[errorKey].message;
    }
  }
  if (mixin) {
    obj = mixinMergeStrategy(obj, mixin(obj, num, this));
  }
  const s = this[asJsonSym](obj, msg, num, t);
  const stream = this[streamSym$1];
  if (stream[needsMetadataGsym] === true) {
    stream.lastLevel = num;
    stream.lastObj = obj;
    stream.lastMsg = msg;
    stream.lastTime = t.slice(this[timeSliceIndexSym$1]);
    stream.lastLogger = this;
  }
  stream.write(streamWriteHook ? streamWriteHook(s) : s);
}
function flush(cb) {
  if (cb != null && typeof cb !== "function") {
    throw Error("callback must be a function");
  }
  const stream = this[streamSym$1];
  if (typeof stream.flush === "function") {
    stream.flush(cb || noop$1);
  } else if (cb) cb();
}
var safeStableStringify = { exports: {} };
(function(module, exports) {
  const { hasOwnProperty } = Object.prototype;
  const stringify2 = configure2();
  stringify2.configure = configure2;
  stringify2.stringify = stringify2;
  stringify2.default = stringify2;
  exports.stringify = stringify2;
  exports.configure = configure2;
  module.exports = stringify2;
  const strEscapeSequencesRegExp = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
  function strEscape(str) {
    if (str.length < 5e3 && !strEscapeSequencesRegExp.test(str)) {
      return `"${str}"`;
    }
    return JSON.stringify(str);
  }
  function sort(array, comparator) {
    if (array.length > 200 || comparator) {
      return array.sort(comparator);
    }
    for (let i = 1; i < array.length; i++) {
      const currentValue = array[i];
      let position = i;
      while (position !== 0 && array[position - 1] > currentValue) {
        array[position] = array[position - 1];
        position--;
      }
      array[position] = currentValue;
    }
    return array;
  }
  const typedArrayPrototypeGetSymbolToStringTag = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(
      Object.getPrototypeOf(
        new Int8Array()
      )
    ),
    Symbol.toStringTag
  ).get;
  function isTypedArrayWithEntries(value) {
    return typedArrayPrototypeGetSymbolToStringTag.call(value) !== void 0 && value.length !== 0;
  }
  function stringifyTypedArray(array, separator, maximumBreadth) {
    if (array.length < maximumBreadth) {
      maximumBreadth = array.length;
    }
    const whitespace = separator === "," ? "" : " ";
    let res2 = `"0":${whitespace}${array[0]}`;
    for (let i = 1; i < maximumBreadth; i++) {
      res2 += `${separator}"${i}":${whitespace}${array[i]}`;
    }
    return res2;
  }
  function getCircularValueOption(options) {
    if (hasOwnProperty.call(options, "circularValue")) {
      const circularValue = options.circularValue;
      if (typeof circularValue === "string") {
        return `"${circularValue}"`;
      }
      if (circularValue == null) {
        return circularValue;
      }
      if (circularValue === Error || circularValue === TypeError) {
        return {
          toString() {
            throw new TypeError("Converting circular structure to JSON");
          }
        };
      }
      throw new TypeError('The "circularValue" argument must be of type string or the value null or undefined');
    }
    return '"[Circular]"';
  }
  function getDeterministicOption(options) {
    let value;
    if (hasOwnProperty.call(options, "deterministic")) {
      value = options.deterministic;
      if (typeof value !== "boolean" && typeof value !== "function") {
        throw new TypeError('The "deterministic" argument must be of type boolean or comparator function');
      }
    }
    return value === void 0 ? true : value;
  }
  function getBooleanOption(options, key) {
    let value;
    if (hasOwnProperty.call(options, key)) {
      value = options[key];
      if (typeof value !== "boolean") {
        throw new TypeError(`The "${key}" argument must be of type boolean`);
      }
    }
    return value === void 0 ? true : value;
  }
  function getPositiveIntegerOption(options, key) {
    let value;
    if (hasOwnProperty.call(options, key)) {
      value = options[key];
      if (typeof value !== "number") {
        throw new TypeError(`The "${key}" argument must be of type number`);
      }
      if (!Number.isInteger(value)) {
        throw new TypeError(`The "${key}" argument must be an integer`);
      }
      if (value < 1) {
        throw new RangeError(`The "${key}" argument must be >= 1`);
      }
    }
    return value === void 0 ? Infinity : value;
  }
  function getItemCount(number) {
    if (number === 1) {
      return "1 item";
    }
    return `${number} items`;
  }
  function getUniqueReplacerSet(replacerArray) {
    const replacerSet = /* @__PURE__ */ new Set();
    for (const value of replacerArray) {
      if (typeof value === "string" || typeof value === "number") {
        replacerSet.add(String(value));
      }
    }
    return replacerSet;
  }
  function getStrictOption(options) {
    if (hasOwnProperty.call(options, "strict")) {
      const value = options.strict;
      if (typeof value !== "boolean") {
        throw new TypeError('The "strict" argument must be of type boolean');
      }
      if (value) {
        return (value2) => {
          let message = `Object can not safely be stringified. Received type ${typeof value2}`;
          if (typeof value2 !== "function") message += ` (${value2.toString()})`;
          throw new Error(message);
        };
      }
    }
  }
  function configure2(options) {
    options = { ...options };
    const fail = getStrictOption(options);
    if (fail) {
      if (options.bigint === void 0) {
        options.bigint = false;
      }
      if (!("circularValue" in options)) {
        options.circularValue = Error;
      }
    }
    const circularValue = getCircularValueOption(options);
    const bigint = getBooleanOption(options, "bigint");
    const deterministic = getDeterministicOption(options);
    const comparator = typeof deterministic === "function" ? deterministic : void 0;
    const maximumDepth = getPositiveIntegerOption(options, "maximumDepth");
    const maximumBreadth = getPositiveIntegerOption(options, "maximumBreadth");
    function stringifyFnReplacer(key, parent, stack, replacer, spacer, indentation) {
      let value = parent[key];
      if (typeof value === "object" && value !== null && typeof value.toJSON === "function") {
        value = value.toJSON(key);
      }
      value = replacer.call(parent, key, value);
      switch (typeof value) {
        case "string":
          return strEscape(value);
        case "object": {
          if (value === null) {
            return "null";
          }
          if (stack.indexOf(value) !== -1) {
            return circularValue;
          }
          let res2 = "";
          let join2 = ",";
          const originalIndentation = indentation;
          if (Array.isArray(value)) {
            if (value.length === 0) {
              return "[]";
            }
            if (maximumDepth < stack.length + 1) {
              return '"[Array]"';
            }
            stack.push(value);
            if (spacer !== "") {
              indentation += spacer;
              res2 += `
${indentation}`;
              join2 = `,
${indentation}`;
            }
            const maximumValuesToStringify = Math.min(value.length, maximumBreadth);
            let i = 0;
            for (; i < maximumValuesToStringify - 1; i++) {
              const tmp2 = stringifyFnReplacer(String(i), value, stack, replacer, spacer, indentation);
              res2 += tmp2 !== void 0 ? tmp2 : "null";
              res2 += join2;
            }
            const tmp = stringifyFnReplacer(String(i), value, stack, replacer, spacer, indentation);
            res2 += tmp !== void 0 ? tmp : "null";
            if (value.length - 1 > maximumBreadth) {
              const removedKeys = value.length - maximumBreadth - 1;
              res2 += `${join2}"... ${getItemCount(removedKeys)} not stringified"`;
            }
            if (spacer !== "") {
              res2 += `
${originalIndentation}`;
            }
            stack.pop();
            return `[${res2}]`;
          }
          let keys = Object.keys(value);
          const keyLength = keys.length;
          if (keyLength === 0) {
            return "{}";
          }
          if (maximumDepth < stack.length + 1) {
            return '"[Object]"';
          }
          let whitespace = "";
          let separator = "";
          if (spacer !== "") {
            indentation += spacer;
            join2 = `,
${indentation}`;
            whitespace = " ";
          }
          const maximumPropertiesToStringify = Math.min(keyLength, maximumBreadth);
          if (deterministic && !isTypedArrayWithEntries(value)) {
            keys = sort(keys, comparator);
          }
          stack.push(value);
          for (let i = 0; i < maximumPropertiesToStringify; i++) {
            const key2 = keys[i];
            const tmp = stringifyFnReplacer(key2, value, stack, replacer, spacer, indentation);
            if (tmp !== void 0) {
              res2 += `${separator}${strEscape(key2)}:${whitespace}${tmp}`;
              separator = join2;
            }
          }
          if (keyLength > maximumBreadth) {
            const removedKeys = keyLength - maximumBreadth;
            res2 += `${separator}"...":${whitespace}"${getItemCount(removedKeys)} not stringified"`;
            separator = join2;
          }
          if (spacer !== "" && separator.length > 1) {
            res2 = `
${indentation}${res2}
${originalIndentation}`;
          }
          stack.pop();
          return `{${res2}}`;
        }
        case "number":
          return isFinite(value) ? String(value) : fail ? fail(value) : "null";
        case "boolean":
          return value === true ? "true" : "false";
        case "undefined":
          return void 0;
        case "bigint":
          if (bigint) {
            return String(value);
          }
        default:
          return fail ? fail(value) : void 0;
      }
    }
    function stringifyArrayReplacer(key, value, stack, replacer, spacer, indentation) {
      if (typeof value === "object" && value !== null && typeof value.toJSON === "function") {
        value = value.toJSON(key);
      }
      switch (typeof value) {
        case "string":
          return strEscape(value);
        case "object": {
          if (value === null) {
            return "null";
          }
          if (stack.indexOf(value) !== -1) {
            return circularValue;
          }
          const originalIndentation = indentation;
          let res2 = "";
          let join2 = ",";
          if (Array.isArray(value)) {
            if (value.length === 0) {
              return "[]";
            }
            if (maximumDepth < stack.length + 1) {
              return '"[Array]"';
            }
            stack.push(value);
            if (spacer !== "") {
              indentation += spacer;
              res2 += `
${indentation}`;
              join2 = `,
${indentation}`;
            }
            const maximumValuesToStringify = Math.min(value.length, maximumBreadth);
            let i = 0;
            for (; i < maximumValuesToStringify - 1; i++) {
              const tmp2 = stringifyArrayReplacer(String(i), value[i], stack, replacer, spacer, indentation);
              res2 += tmp2 !== void 0 ? tmp2 : "null";
              res2 += join2;
            }
            const tmp = stringifyArrayReplacer(String(i), value[i], stack, replacer, spacer, indentation);
            res2 += tmp !== void 0 ? tmp : "null";
            if (value.length - 1 > maximumBreadth) {
              const removedKeys = value.length - maximumBreadth - 1;
              res2 += `${join2}"... ${getItemCount(removedKeys)} not stringified"`;
            }
            if (spacer !== "") {
              res2 += `
${originalIndentation}`;
            }
            stack.pop();
            return `[${res2}]`;
          }
          stack.push(value);
          let whitespace = "";
          if (spacer !== "") {
            indentation += spacer;
            join2 = `,
${indentation}`;
            whitespace = " ";
          }
          let separator = "";
          for (const key2 of replacer) {
            const tmp = stringifyArrayReplacer(key2, value[key2], stack, replacer, spacer, indentation);
            if (tmp !== void 0) {
              res2 += `${separator}${strEscape(key2)}:${whitespace}${tmp}`;
              separator = join2;
            }
          }
          if (spacer !== "" && separator.length > 1) {
            res2 = `
${indentation}${res2}
${originalIndentation}`;
          }
          stack.pop();
          return `{${res2}}`;
        }
        case "number":
          return isFinite(value) ? String(value) : fail ? fail(value) : "null";
        case "boolean":
          return value === true ? "true" : "false";
        case "undefined":
          return void 0;
        case "bigint":
          if (bigint) {
            return String(value);
          }
        default:
          return fail ? fail(value) : void 0;
      }
    }
    function stringifyIndent(key, value, stack, spacer, indentation) {
      switch (typeof value) {
        case "string":
          return strEscape(value);
        case "object": {
          if (value === null) {
            return "null";
          }
          if (typeof value.toJSON === "function") {
            value = value.toJSON(key);
            if (typeof value !== "object") {
              return stringifyIndent(key, value, stack, spacer, indentation);
            }
            if (value === null) {
              return "null";
            }
          }
          if (stack.indexOf(value) !== -1) {
            return circularValue;
          }
          const originalIndentation = indentation;
          if (Array.isArray(value)) {
            if (value.length === 0) {
              return "[]";
            }
            if (maximumDepth < stack.length + 1) {
              return '"[Array]"';
            }
            stack.push(value);
            indentation += spacer;
            let res3 = `
${indentation}`;
            const join3 = `,
${indentation}`;
            const maximumValuesToStringify = Math.min(value.length, maximumBreadth);
            let i = 0;
            for (; i < maximumValuesToStringify - 1; i++) {
              const tmp2 = stringifyIndent(String(i), value[i], stack, spacer, indentation);
              res3 += tmp2 !== void 0 ? tmp2 : "null";
              res3 += join3;
            }
            const tmp = stringifyIndent(String(i), value[i], stack, spacer, indentation);
            res3 += tmp !== void 0 ? tmp : "null";
            if (value.length - 1 > maximumBreadth) {
              const removedKeys = value.length - maximumBreadth - 1;
              res3 += `${join3}"... ${getItemCount(removedKeys)} not stringified"`;
            }
            res3 += `
${originalIndentation}`;
            stack.pop();
            return `[${res3}]`;
          }
          let keys = Object.keys(value);
          const keyLength = keys.length;
          if (keyLength === 0) {
            return "{}";
          }
          if (maximumDepth < stack.length + 1) {
            return '"[Object]"';
          }
          indentation += spacer;
          const join2 = `,
${indentation}`;
          let res2 = "";
          let separator = "";
          let maximumPropertiesToStringify = Math.min(keyLength, maximumBreadth);
          if (isTypedArrayWithEntries(value)) {
            res2 += stringifyTypedArray(value, join2, maximumBreadth);
            keys = keys.slice(value.length);
            maximumPropertiesToStringify -= value.length;
            separator = join2;
          }
          if (deterministic) {
            keys = sort(keys, comparator);
          }
          stack.push(value);
          for (let i = 0; i < maximumPropertiesToStringify; i++) {
            const key2 = keys[i];
            const tmp = stringifyIndent(key2, value[key2], stack, spacer, indentation);
            if (tmp !== void 0) {
              res2 += `${separator}${strEscape(key2)}: ${tmp}`;
              separator = join2;
            }
          }
          if (keyLength > maximumBreadth) {
            const removedKeys = keyLength - maximumBreadth;
            res2 += `${separator}"...": "${getItemCount(removedKeys)} not stringified"`;
            separator = join2;
          }
          if (separator !== "") {
            res2 = `
${indentation}${res2}
${originalIndentation}`;
          }
          stack.pop();
          return `{${res2}}`;
        }
        case "number":
          return isFinite(value) ? String(value) : fail ? fail(value) : "null";
        case "boolean":
          return value === true ? "true" : "false";
        case "undefined":
          return void 0;
        case "bigint":
          if (bigint) {
            return String(value);
          }
        default:
          return fail ? fail(value) : void 0;
      }
    }
    function stringifySimple(key, value, stack) {
      switch (typeof value) {
        case "string":
          return strEscape(value);
        case "object": {
          if (value === null) {
            return "null";
          }
          if (typeof value.toJSON === "function") {
            value = value.toJSON(key);
            if (typeof value !== "object") {
              return stringifySimple(key, value, stack);
            }
            if (value === null) {
              return "null";
            }
          }
          if (stack.indexOf(value) !== -1) {
            return circularValue;
          }
          let res2 = "";
          const hasLength = value.length !== void 0;
          if (hasLength && Array.isArray(value)) {
            if (value.length === 0) {
              return "[]";
            }
            if (maximumDepth < stack.length + 1) {
              return '"[Array]"';
            }
            stack.push(value);
            const maximumValuesToStringify = Math.min(value.length, maximumBreadth);
            let i = 0;
            for (; i < maximumValuesToStringify - 1; i++) {
              const tmp2 = stringifySimple(String(i), value[i], stack);
              res2 += tmp2 !== void 0 ? tmp2 : "null";
              res2 += ",";
            }
            const tmp = stringifySimple(String(i), value[i], stack);
            res2 += tmp !== void 0 ? tmp : "null";
            if (value.length - 1 > maximumBreadth) {
              const removedKeys = value.length - maximumBreadth - 1;
              res2 += `,"... ${getItemCount(removedKeys)} not stringified"`;
            }
            stack.pop();
            return `[${res2}]`;
          }
          let keys = Object.keys(value);
          const keyLength = keys.length;
          if (keyLength === 0) {
            return "{}";
          }
          if (maximumDepth < stack.length + 1) {
            return '"[Object]"';
          }
          let separator = "";
          let maximumPropertiesToStringify = Math.min(keyLength, maximumBreadth);
          if (hasLength && isTypedArrayWithEntries(value)) {
            res2 += stringifyTypedArray(value, ",", maximumBreadth);
            keys = keys.slice(value.length);
            maximumPropertiesToStringify -= value.length;
            separator = ",";
          }
          if (deterministic) {
            keys = sort(keys, comparator);
          }
          stack.push(value);
          for (let i = 0; i < maximumPropertiesToStringify; i++) {
            const key2 = keys[i];
            const tmp = stringifySimple(key2, value[key2], stack);
            if (tmp !== void 0) {
              res2 += `${separator}${strEscape(key2)}:${tmp}`;
              separator = ",";
            }
          }
          if (keyLength > maximumBreadth) {
            const removedKeys = keyLength - maximumBreadth;
            res2 += `${separator}"...":"${getItemCount(removedKeys)} not stringified"`;
          }
          stack.pop();
          return `{${res2}}`;
        }
        case "number":
          return isFinite(value) ? String(value) : fail ? fail(value) : "null";
        case "boolean":
          return value === true ? "true" : "false";
        case "undefined":
          return void 0;
        case "bigint":
          if (bigint) {
            return String(value);
          }
        default:
          return fail ? fail(value) : void 0;
      }
    }
    function stringify3(value, replacer, space) {
      if (arguments.length > 1) {
        let spacer = "";
        if (typeof space === "number") {
          spacer = " ".repeat(Math.min(space, 10));
        } else if (typeof space === "string") {
          spacer = space.slice(0, 10);
        }
        if (replacer != null) {
          if (typeof replacer === "function") {
            return stringifyFnReplacer("", { "": value }, [], replacer, spacer, "");
          }
          if (Array.isArray(replacer)) {
            return stringifyArrayReplacer("", value, [], getUniqueReplacerSet(replacer), spacer, "");
          }
        }
        if (spacer.length !== 0) {
          return stringifyIndent("", value, [], spacer, "");
        }
      }
      return stringifySimple("", value, []);
    }
    return stringify3;
  }
})(safeStableStringify, safeStableStringify.exports);
var safeStableStringifyExports = safeStableStringify.exports;
var multistream_1;
var hasRequiredMultistream;
function requireMultistream() {
  if (hasRequiredMultistream) return multistream_1;
  hasRequiredMultistream = 1;
  const metadata = Symbol.for("pino.metadata");
  const { DEFAULT_LEVELS: DEFAULT_LEVELS2 } = constants;
  const DEFAULT_INFO_LEVEL = DEFAULT_LEVELS2.info;
  function multistream(streamsArray, opts) {
    streamsArray = streamsArray || [];
    opts = opts || { dedupe: false };
    const streamLevels = Object.create(DEFAULT_LEVELS2);
    streamLevels.silent = Infinity;
    if (opts.levels && typeof opts.levels === "object") {
      Object.keys(opts.levels).forEach((i) => {
        streamLevels[i] = opts.levels[i];
      });
    }
    const res2 = {
      write: write2,
      add,
      remove,
      emit,
      flushSync: flushSync2,
      end: end2,
      minLevel: 0,
      lastId: 0,
      streams: [],
      clone,
      [metadata]: true,
      streamLevels
    };
    if (Array.isArray(streamsArray)) {
      streamsArray.forEach(add, res2);
    } else {
      add.call(res2, streamsArray);
    }
    streamsArray = null;
    return res2;
    function write2(data) {
      let dest;
      const level = this.lastLevel;
      const { streams } = this;
      let recordedLevel = 0;
      let stream;
      for (let i = initLoopVar(streams.length, opts.dedupe); checkLoopVar(i, streams.length, opts.dedupe); i = adjustLoopVar(i, opts.dedupe)) {
        dest = streams[i];
        if (dest.level <= level) {
          if (recordedLevel !== 0 && recordedLevel !== dest.level) {
            break;
          }
          stream = dest.stream;
          if (stream[metadata]) {
            const { lastTime, lastMsg, lastObj, lastLogger } = this;
            stream.lastLevel = level;
            stream.lastTime = lastTime;
            stream.lastMsg = lastMsg;
            stream.lastObj = lastObj;
            stream.lastLogger = lastLogger;
          }
          stream.write(data);
          if (opts.dedupe) {
            recordedLevel = dest.level;
          }
        } else if (!opts.dedupe) {
          break;
        }
      }
    }
    function emit(...args) {
      for (const { stream } of this.streams) {
        if (typeof stream.emit === "function") {
          stream.emit(...args);
        }
      }
    }
    function flushSync2() {
      for (const { stream } of this.streams) {
        if (typeof stream.flushSync === "function") {
          stream.flushSync();
        }
      }
    }
    function add(dest) {
      if (!dest) {
        return res2;
      }
      const isStream = typeof dest.write === "function" || dest.stream;
      const stream_ = dest.write ? dest : dest.stream;
      if (!isStream) {
        throw Error("stream object needs to implement either StreamEntry or DestinationStream interface");
      }
      const { streams, streamLevels: streamLevels2 } = this;
      let level;
      if (typeof dest.levelVal === "number") {
        level = dest.levelVal;
      } else if (typeof dest.level === "string") {
        level = streamLevels2[dest.level];
      } else if (typeof dest.level === "number") {
        level = dest.level;
      } else {
        level = DEFAULT_INFO_LEVEL;
      }
      const dest_ = {
        stream: stream_,
        level,
        levelVal: void 0,
        id: ++res2.lastId
      };
      streams.unshift(dest_);
      streams.sort(compareByLevel);
      this.minLevel = streams[0].level;
      return res2;
    }
    function remove(id) {
      const { streams } = this;
      const index = streams.findIndex((s) => s.id === id);
      if (index >= 0) {
        streams.splice(index, 1);
        streams.sort(compareByLevel);
        this.minLevel = streams.length > 0 ? streams[0].level : -1;
      }
      return res2;
    }
    function end2() {
      for (const { stream } of this.streams) {
        if (typeof stream.flushSync === "function") {
          stream.flushSync();
        }
        stream.end();
      }
    }
    function clone(level) {
      const streams = new Array(this.streams.length);
      for (let i = 0; i < streams.length; i++) {
        streams[i] = {
          level,
          stream: this.streams[i].stream
        };
      }
      return {
        write: write2,
        add,
        remove,
        minLevel: level,
        streams,
        clone,
        emit,
        flushSync: flushSync2,
        [metadata]: true
      };
    }
  }
  function compareByLevel(a, b) {
    return a.level - b.level;
  }
  function initLoopVar(length, dedupe) {
    return dedupe ? length - 1 : 0;
  }
  function adjustLoopVar(i, dedupe) {
    return dedupe ? i - 1 : i + 1;
  }
  function checkLoopVar(i, length, dedupe) {
    return dedupe ? i >= 0 : i < length;
  }
  multistream_1 = multistream;
  return multistream_1;
}
const os = os$1;
const stdSerializers = pinoStdSerializers;
const caller = caller$1;
const redaction = redaction_1;
const time = time$1;
const proto = proto$1;
const symbols = symbols$1;
const { configure } = safeStableStringifyExports;
const { assertDefaultLevelFound, mappings, genLsCache, genLevelComparison, assertLevelComparison } = levels;
const { DEFAULT_LEVELS, SORTING_ORDER } = constants;
const {
  createArgsNormalizer,
  asChindings,
  buildSafeSonicBoom,
  buildFormatters,
  stringify,
  normalizeDestFileDescriptor,
  noop
} = tools;
const { version } = meta;
const {
  chindingsSym,
  redactFmtSym,
  serializersSym,
  timeSym,
  timeSliceIndexSym,
  streamSym,
  stringifySym,
  stringifySafeSym,
  stringifiersSym,
  setLevelSym,
  endSym,
  formatOptsSym,
  messageKeySym,
  errorKeySym,
  nestedKeySym,
  mixinSym,
  levelCompSym,
  useOnlyCustomLevelsSym,
  formattersSym,
  hooksSym,
  nestedKeyStrSym,
  mixinMergeStrategySym,
  msgPrefixSym
} = symbols;
const { epochTime, nullTime } = time;
const { pid } = process;
const hostname = os.hostname();
const defaultErrorSerializer = stdSerializers.err;
const defaultOptions = {
  level: "info",
  levelComparison: SORTING_ORDER.ASC,
  levels: DEFAULT_LEVELS,
  messageKey: "msg",
  errorKey: "err",
  nestedKey: null,
  enabled: true,
  base: { pid, hostname },
  serializers: Object.assign(/* @__PURE__ */ Object.create(null), {
    err: defaultErrorSerializer
  }),
  formatters: Object.assign(/* @__PURE__ */ Object.create(null), {
    bindings(bindings2) {
      return bindings2;
    },
    level(label, number) {
      return { level: number };
    }
  }),
  hooks: {
    logMethod: void 0,
    streamWrite: void 0
  },
  timestamp: epochTime,
  name: void 0,
  redact: null,
  customLevels: null,
  useOnlyCustomLevels: false,
  depthLimit: 5,
  edgeLimit: 100
};
const normalize = createArgsNormalizer(defaultOptions);
const serializers = Object.assign(/* @__PURE__ */ Object.create(null), stdSerializers);
function pino(...args) {
  const instance = {};
  const { opts, stream } = normalize(instance, caller(), ...args);
  if (opts.level && typeof opts.level === "string" && DEFAULT_LEVELS[opts.level.toLowerCase()] !== void 0) opts.level = opts.level.toLowerCase();
  const {
    redact: redact2,
    crlf,
    serializers: serializers2,
    timestamp,
    messageKey,
    errorKey,
    nestedKey,
    base,
    name,
    level,
    customLevels,
    levelComparison,
    mixin,
    mixinMergeStrategy,
    useOnlyCustomLevels,
    formatters,
    hooks,
    depthLimit,
    edgeLimit,
    onChild,
    msgPrefix
  } = opts;
  const stringifySafe = configure({
    maximumDepth: depthLimit,
    maximumBreadth: edgeLimit
  });
  const allFormatters = buildFormatters(
    formatters.level,
    formatters.bindings,
    formatters.log
  );
  const stringifyFn = stringify.bind({
    [stringifySafeSym]: stringifySafe
  });
  const stringifiers = redact2 ? redaction(redact2, stringifyFn) : {};
  const formatOpts = redact2 ? { stringify: stringifiers[redactFmtSym] } : { stringify: stringifyFn };
  const end2 = "}" + (crlf ? "\r\n" : "\n");
  const coreChindings = asChindings.bind(null, {
    [chindingsSym]: "",
    [serializersSym]: serializers2,
    [stringifiersSym]: stringifiers,
    [stringifySym]: stringify,
    [stringifySafeSym]: stringifySafe,
    [formattersSym]: allFormatters
  });
  let chindings = "";
  if (base !== null) {
    if (name === void 0) {
      chindings = coreChindings(base);
    } else {
      chindings = coreChindings(Object.assign({}, base, { name }));
    }
  }
  const time2 = timestamp instanceof Function ? timestamp : timestamp ? epochTime : nullTime;
  const timeSliceIndex = time2().indexOf(":") + 1;
  if (useOnlyCustomLevels && !customLevels) throw Error("customLevels is required if useOnlyCustomLevels is set true");
  if (mixin && typeof mixin !== "function") throw Error(`Unknown mixin type "${typeof mixin}" - expected "function"`);
  if (msgPrefix && typeof msgPrefix !== "string") throw Error(`Unknown msgPrefix type "${typeof msgPrefix}" - expected "string"`);
  assertDefaultLevelFound(level, customLevels, useOnlyCustomLevels);
  const levels2 = mappings(customLevels, useOnlyCustomLevels);
  if (typeof stream.emit === "function") {
    stream.emit("message", { code: "PINO_CONFIG", config: { levels: levels2, messageKey, errorKey } });
  }
  assertLevelComparison(levelComparison);
  const levelCompFunc = genLevelComparison(levelComparison);
  Object.assign(instance, {
    levels: levels2,
    [levelCompSym]: levelCompFunc,
    [useOnlyCustomLevelsSym]: useOnlyCustomLevels,
    [streamSym]: stream,
    [timeSym]: time2,
    [timeSliceIndexSym]: timeSliceIndex,
    [stringifySym]: stringify,
    [stringifySafeSym]: stringifySafe,
    [stringifiersSym]: stringifiers,
    [endSym]: end2,
    [formatOptsSym]: formatOpts,
    [messageKeySym]: messageKey,
    [errorKeySym]: errorKey,
    [nestedKeySym]: nestedKey,
    // protect against injection
    [nestedKeyStrSym]: nestedKey ? `,${JSON.stringify(nestedKey)}:{` : "",
    [serializersSym]: serializers2,
    [mixinSym]: mixin,
    [mixinMergeStrategySym]: mixinMergeStrategy,
    [chindingsSym]: chindings,
    [formattersSym]: allFormatters,
    [hooksSym]: hooks,
    silent: noop,
    onChild,
    [msgPrefixSym]: msgPrefix
  });
  Object.setPrototypeOf(instance, proto());
  genLsCache(instance);
  instance[setLevelSym](level);
  return instance;
}
pino$2.exports = pino;
pino$2.exports.destination = (dest = process.stdout.fd) => {
  if (typeof dest === "object") {
    dest.dest = normalizeDestFileDescriptor(dest.dest || process.stdout.fd);
    return buildSafeSonicBoom(dest);
  } else {
    return buildSafeSonicBoom({ dest: normalizeDestFileDescriptor(dest), minLength: 0 });
  }
};
pino$2.exports.transport = transport_1;
pino$2.exports.multistream = requireMultistream();
pino$2.exports.levels = mappings();
pino$2.exports.stdSerializers = serializers;
pino$2.exports.stdTimeFunctions = Object.assign({}, time);
pino$2.exports.symbols = symbols;
pino$2.exports.version = version;
pino$2.exports.default = pino;
pino$2.exports.pino = pino;
var pinoExports = pino$2.exports;
const pino$1 = /* @__PURE__ */ getDefaultExportFromCjs(pinoExports);
const logEmitter = new EventEmitter$3();
const customStream = {
  write(msg) {
    process.stdout.write(msg);
    try {
      const parsed = JSON.parse(msg);
      const levelStr = parsed.level === 30 ? "INFO" : parsed.level === 40 ? "WARN" : parsed.level === 50 ? "ERROR" : "DEBUG";
      const text = `[${levelStr}] ${parsed.msg || ""}`;
      logEmitter.emit("log", text);
    } catch {
      logEmitter.emit("log", msg);
    }
  }
};
const logger = pino$1({
  level: process.env.LOG_LEVEL ?? "info"
}, customStream);
const logger$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  logEmitter,
  logger
}, Symbol.toStringTag, { value: "Module" }));
export {
  getDefaultExportFromCjs as a,
  logger$1 as b,
  commonjsGlobal as c,
  getAugmentedNamespace as g,
  logger as l
};
