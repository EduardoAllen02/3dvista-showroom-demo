import { s as startWorkers } from "./worker1.js";
let wasm;
function isLikeNone(x) {
  return x === void 0 || x === null;
}
function debugString(val) {
  const type = typeof val;
  if (type == "number" || type == "boolean" || val == null) {
    return `${val}`;
  }
  if (type == "string") {
    return `"${val}"`;
  }
  if (type == "symbol") {
    const description = val.description;
    if (description == null) {
      return "Symbol";
    } else {
      return `Symbol(${description})`;
    }
  }
  if (type == "function") {
    const name = val.name;
    if (typeof name == "string" && name.length > 0) {
      return `Function(${name})`;
    } else {
      return "Function";
    }
  }
  if (Array.isArray(val)) {
    const length = val.length;
    let debug = "[";
    if (length > 0) {
      debug += debugString(val[0]);
    }
    for (let i = 1; i < length; i++) {
      debug += ", " + debugString(val[i]);
    }
    debug += "]";
    return debug;
  }
  const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
  let className;
  if (builtInMatches && builtInMatches.length > 1) {
    className = builtInMatches[1];
  } else {
    return toString.call(val);
  }
  if (className == "Object") {
    try {
      return "Object(" + JSON.stringify(val) + ")";
    } catch (_) {
      return "Object";
    }
  }
  if (val instanceof Error) {
    return `${val.name}: ${val.message}
${val.stack}`;
  }
  return className;
}
let WASM_VECTOR_LEN = 0;
let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
  if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.buffer !== wasm.memory.buffer) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8ArrayMemory0;
}
const cachedTextEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : void 0;
if (cachedTextEncoder) {
  cachedTextEncoder.encodeInto = function(arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
      read: arg.length,
      written: buf.length
    };
  };
}
function passStringToWasm0(arg, malloc, realloc) {
  if (realloc === void 0) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr2 = malloc(buf.length, 1) >>> 0;
    getUint8ArrayMemory0().subarray(ptr2, ptr2 + buf.length).set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr2;
  }
  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;
  const mem = getUint8ArrayMemory0();
  let offset = 0;
  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 127) break;
    mem[ptr + offset] = code;
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
    const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
    const ret = cachedTextEncoder.encodeInto(arg, view);
    offset += ret.written;
    ptr = realloc(ptr, len, offset, 1) >>> 0;
  }
  WASM_VECTOR_LEN = offset;
  return ptr;
}
let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
  if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer !== wasm.memory.buffer) {
    cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
  }
  return cachedDataViewMemory0;
}
let cachedTextDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }) : void 0;
if (cachedTextDecoder) cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
  numBytesDecoded += len;
  if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
    cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
    cachedTextDecoder.decode();
    numBytesDecoded = len;
  }
  return cachedTextDecoder.decode(getUint8ArrayMemory0().slice(ptr, ptr + len));
}
function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return decodeText(ptr, len);
}
function addToExternrefTable0(obj) {
  const idx = wasm.__externref_table_alloc();
  wasm.__wbindgen_externrefs.set(idx, obj);
  return idx;
}
function handleError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    const idx = addToExternrefTable0(e);
    wasm.__wbindgen_exn_store(idx);
  }
}
function passArrayJsValueToWasm0(array, malloc) {
  const ptr = malloc(array.length * 4, 4) >>> 0;
  for (let i = 0; i < array.length; i++) {
    const add = addToExternrefTable0(array[i]);
    getDataViewMemory0().setUint32(ptr + 4 * i, add, true);
  }
  WASM_VECTOR_LEN = array.length;
  return ptr;
}
function getArrayU8FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}
const CLOSURE_DTORS = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((state) => state.dtor(state.a, state.b));
function makeMutClosure(arg0, arg1, dtor, f) {
  const state = { a: arg0, b: arg1, cnt: 1, dtor };
  const real = (...args) => {
    state.cnt++;
    const a = state.a;
    state.a = 0;
    try {
      return f(a, state.b, ...args);
    } finally {
      state.a = a;
      real._wbg_cb_unref();
    }
  };
  real._wbg_cb_unref = () => {
    if (--state.cnt === 0) {
      state.dtor(state.a, state.b);
      state.a = 0;
      CLOSURE_DTORS.unregister(state);
    }
  };
  CLOSURE_DTORS.register(real, state, state);
  return real;
}
let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
  if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.buffer !== wasm.memory.buffer) {
    cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
  }
  return cachedFloat32ArrayMemory0;
}
function getArrayF32FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}
function passArray8ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 1, 1) >>> 0;
  getUint8ArrayMemory0().set(arg, ptr / 1);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}
function takeFromExternrefTable0(idx) {
  const value = wasm.__wbindgen_externrefs.get(idx);
  wasm.__externref_table_dealloc(idx);
  return value;
}
function getArrayJsValueFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  const mem = getDataViewMemory0();
  const result = [];
  for (let i = ptr; i < ptr + 4 * len; i += 4) {
    result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
  }
  wasm.__externref_drop_slice(ptr, len);
  return result;
}
function _assertClass(instance, klass) {
  if (!(instance instanceof klass)) {
    throw new Error(`expected instance of ${klass.name}`);
  }
}
let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
  if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.buffer !== wasm.memory.buffer) {
    cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
  }
  return cachedUint32ArrayMemory0;
}
function getArrayU32FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}
function passArray32ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 4, 4) >>> 0;
  getUint32ArrayMemory0().set(arg, ptr / 4);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}
function wbg_rayon_start_worker(receiver) {
  wasm.wbg_rayon_start_worker(receiver);
}
function wasm_bindgen__convert__closures_____invoke__h02e0b48227951a64(arg0, arg1, arg2) {
  wasm.wasm_bindgen__convert__closures_____invoke__h02e0b48227951a64(arg0, arg1, arg2);
}
function wasm_bindgen__convert__closures_____invoke__h7c8446d1165c7308(arg0, arg1, arg2) {
  wasm.wasm_bindgen__convert__closures_____invoke__h7c8446d1165c7308(arg0, arg1, arg2);
}
function wasm_bindgen__convert__closures_____invoke__hbd00c4131b3fd34f(arg0, arg1, arg2, arg3) {
  wasm.wasm_bindgen__convert__closures_____invoke__hbd00c4131b3fd34f(arg0, arg1, arg2, arg3);
}
const HitFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_hit_free(ptr >>> 0, 1));
class Hit {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(Hit.prototype);
    obj.__wbg_ptr = ptr;
    HitFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    HitFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_hit_free(ptr, 0);
  }
  /**
   * @returns {Point}
   */
  get point() {
    const ret = wasm.__wbg_get_hit_point(this.__wbg_ptr);
    return Point.__wrap(ret);
  }
  /**
   * @param {Point} arg0
   */
  set point(arg0) {
    _assertClass(arg0, Point);
    var ptr0 = arg0.__destroy_into_raw();
    wasm.__wbg_set_hit_point(this.__wbg_ptr, ptr0);
  }
  /**
   * @returns {number}
   */
  get distance() {
    const ret = wasm.__wbg_get_hit_distance(this.__wbg_ptr);
    return ret;
  }
  /**
   * @param {number} arg0
   */
  set distance(arg0) {
    wasm.__wbg_set_hit_distance(this.__wbg_ptr, arg0);
  }
  /**
   * @returns {number}
   */
  get index() {
    const ret = wasm.__wbg_get_hit_index(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @param {number} arg0
   */
  set index(arg0) {
    wasm.__wbg_set_hit_index(this.__wbg_ptr, arg0);
  }
}
if (Symbol.dispose) Hit.prototype[Symbol.dispose] = Hit.prototype.free;
const PointFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_point_free(ptr >>> 0, 1));
class Point {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(Point.prototype);
    obj.__wbg_ptr = ptr;
    PointFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    PointFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_point_free(ptr, 0);
  }
  /**
   * @returns {number}
   */
  get x() {
    const ret = wasm.__wbg_get_point_x(this.__wbg_ptr);
    return ret;
  }
  /**
   * @param {number} arg0
   */
  set x(arg0) {
    wasm.__wbg_set_point_x(this.__wbg_ptr, arg0);
  }
  /**
   * @returns {number}
   */
  get y() {
    const ret = wasm.__wbg_get_point_y(this.__wbg_ptr);
    return ret;
  }
  /**
   * @param {number} arg0
   */
  set y(arg0) {
    wasm.__wbg_set_point_y(this.__wbg_ptr, arg0);
  }
  /**
   * @returns {number}
   */
  get z() {
    const ret = wasm.__wbg_get_point_z(this.__wbg_ptr);
    return ret;
  }
  /**
   * @param {number} arg0
   */
  set z(arg0) {
    wasm.__wbg_set_point_z(this.__wbg_ptr, arg0);
  }
}
if (Symbol.dispose) Point.prototype[Symbol.dispose] = Point.prototype.free;
const SortDataFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_sortdata_free(ptr >>> 0, 1));
class SortData {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    SortDataFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_sortdata_free(ptr, 0);
  }
  /**
   * @returns {number}
   */
  get splat_count() {
    const ret = wasm.__wbg_get_sortdata_splat_count(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @param {number} arg0
   */
  set splat_count(arg0) {
    wasm.__wbg_set_sortdata_splat_count(this.__wbg_ptr, arg0);
  }
  /**
   * @returns {boolean}
   */
  get use_shared_memory() {
    const ret = wasm.__wbg_get_sortdata_use_shared_memory(this.__wbg_ptr);
    return ret !== 0;
  }
  /**
   * @param {boolean} arg0
   */
  set use_shared_memory(arg0) {
    wasm.__wbg_set_sortdata_use_shared_memory(this.__wbg_ptr, arg0);
  }
  /**
   * @returns {boolean}
   */
  get dynamic_mode() {
    const ret = wasm.__wbg_get_sortdata_dynamic_mode(this.__wbg_ptr);
    return ret !== 0;
  }
  /**
   * @param {boolean} arg0
   */
  set dynamic_mode(arg0) {
    wasm.__wbg_set_sortdata_dynamic_mode(this.__wbg_ptr, arg0);
  }
  /**
   * @param {Uint8Array} positions_data
   * @param {number} offset
   * @param {boolean} halfPrecision
   */
  setPositions(positions_data, offset, halfPrecision) {
    const ptr0 = passArray8ToWasm0(positions_data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.sortdata_setPositions(this.__wbg_ptr, ptr0, len0, offset, halfPrecision);
  }
  /**
   * @param {THREE.Matrix4} transform
   * @param {number} index
   */
  setTransform(transform, index) {
    wasm.sortdata_setTransform(this.__wbg_ptr, transform, index);
  }
  /**
   * @param {(THREE.Matrix4)[]} transforms
   */
  setTransforms(transforms) {
    const ptr0 = passArrayJsValueToWasm0(transforms, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.sortdata_setTransforms(this.__wbg_ptr, ptr0, len0);
  }
  /**
   * @returns {Uint32Array}
   */
  getSortedIndices() {
    const ret = wasm.sortdata_getSortedIndices(this.__wbg_ptr);
    var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
  }
  /**
   * @returns {number}
   */
  getSortedIndicesPtr() {
    const ret = wasm.sortdata_getSortedIndicesPtr(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @param {Uint32Array} transform_indices
   */
  setTransformIndices(transform_indices) {
    const ptr0 = passArray32ToWasm0(transform_indices, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.sortdata_setTransformIndices(this.__wbg_ptr, ptr0, len0);
  }
  /**
   * @param {number} splat_count
   * @param {boolean} dynamic_mode
   * @param {boolean} use_shared_memory
   * @param {number} max_scenes
   */
  constructor(splat_count, dynamic_mode, use_shared_memory, max_scenes) {
    const ret = wasm.sortdata_new(splat_count, dynamic_mode, use_shared_memory, max_scenes);
    this.__wbg_ptr = ret >>> 0;
    SortDataFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
  /**
   *
   *     * Sorts the indices depending on the distance to the camera in descending order.
   *
   * @param {THREE.Vector3} camera_position
   * @param {THREE.Vector3} camera_direction
   * @returns {number}
   */
  sort(camera_position, camera_direction) {
    const ret = wasm.sortdata_sort(this.__wbg_ptr, camera_position, camera_direction);
    return ret >>> 0;
  }
  /**
   * @param {THREE.Vector3} bound_min
   * @param {THREE.Vector3} bound_max
   */
  setBounds(bound_min, bound_max) {
    wasm.sortdata_setBounds(this.__wbg_ptr, bound_min, bound_max);
  }
}
if (Symbol.dispose) SortData.prototype[Symbol.dispose] = SortData.prototype.free;
const SplatBufferFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_splatbuffer_free(ptr >>> 0, 1));
class SplatBuffer {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(SplatBuffer.prototype);
    obj.__wbg_ptr = ptr;
    SplatBufferFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    SplatBufferFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_splatbuffer_free(ptr, 0);
  }
  /**
   * @returns {string}
   */
  getMetadata() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.splatbuffer_getMetadata(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * @returns {number}
   */
  getSHDegree() {
    const ret = wasm.splatbuffer_getSHDegree(this.__wbg_ptr);
    return ret;
  }
  /**
   * @returns {Float32Array}
   */
  getBoundsMax() {
    const ret = wasm.splatbuffer_getBoundsMax(this.__wbg_ptr);
    var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
  }
  /**
   * @returns {Float32Array}
   */
  getBoundsMin() {
    const ret = wasm.splatbuffer_getBoundsMin(this.__wbg_ptr);
    var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
  }
  /**
   * @returns {number}
   */
  getSHCBCount() {
    const ret = wasm.splatbuffer_getSHCBCount(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @returns {Float32Array | undefined}
   */
  getTransform() {
    const ret = wasm.splatbuffer_getTransform(this.__wbg_ptr);
    let v1;
    if (ret[0] !== 0) {
      v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
      wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    }
    return v1;
  }
  /**
   * @param {THREE.Matrix4 | null} [transform]
   */
  setTransform(transform) {
    wasm.splatbuffer_setTransform(this.__wbg_ptr, isLikeNone(transform) ? 0 : addToExternrefTable0(transform));
  }
  /**
   * @returns {Float32Array}
   */
  getSceneCenter() {
    const ret = wasm.splatbuffer_getSceneCenter(this.__wbg_ptr);
    var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
  }
  /**
   * @returns {number}
   */
  getCurrentRadius() {
    const ret = wasm.splatbuffer_getCurrentRadius(this.__wbg_ptr);
    return ret;
  }
  /**
   * @returns {number}
   */
  getGaussianCount() {
    const ret = wasm.splatbuffer_getGaussianCount(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @returns {number}
   */
  getMaximumRadius() {
    const ret = wasm.splatbuffer_getMaximumRadius(this.__wbg_ptr);
    return ret;
  }
  /**
   * @returns {number}
   */
  getColorsBufferPtr() {
    const ret = wasm.splatbuffer_getColorsBufferPtr(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @returns {Float32Array}
   */
  getCenterRadiusList() {
    const ret = wasm.splatbuffer_getCenterRadiusList(this.__wbg_ptr);
    var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
  }
  /**
   * @returns {number}
   */
  getCenterRadiusStep() {
    const ret = wasm.splatbuffer_getCenterRadiusStep(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @returns {number}
   */
  getLoadedColorsCount() {
    const ret = wasm.splatbuffer_getLoadedColorsCount(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @returns {number | undefined}
   */
  getShCoeffsBufferPtr() {
    const ret = wasm.splatbuffer_getShCoeffsBufferPtr(this.__wbg_ptr);
    return ret === 4294967297 ? void 0 : ret;
  }
  /**
   * @param {THREE.Matrix4} model_view
   * @param {number} cos_half_fov_x
   * @param {number} cos_half_fov_y
   * @returns {number}
   */
  computeVisibleIndices(model_view, cos_half_fov_x, cos_half_fov_y) {
    const ret = wasm.splatbuffer_computeVisibleIndices(this.__wbg_ptr, model_view, cos_half_fov_x, cos_half_fov_y);
    return ret >>> 0;
  }
  /**
   * @returns {number}
   */
  getPositionsBufferPtr() {
    const ret = wasm.splatbuffer_getPositionsBufferPtr(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @returns {number}
   */
  getLoadedShCoeffsCount() {
    const ret = wasm.splatbuffer_getLoadedShCoeffsCount(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @returns {number | undefined}
   */
  getShCoeffsCBBufferPtr() {
    const ret = wasm.splatbuffer_getShCoeffsCBBufferPtr(this.__wbg_ptr);
    return ret === 4294967297 ? void 0 : ret;
  }
  /**
   * @returns {number}
   */
  getCovariancesBufferPtr() {
    const ret = wasm.splatbuffer_getCovariancesBufferPtr(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @returns {number}
   */
  getLoadedPositionsCount() {
    const ret = wasm.splatbuffer_getLoadedPositionsCount(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @returns {number}
   */
  getLoadedShCoeffsCBCount() {
    const ret = wasm.splatbuffer_getLoadedShCoeffsCBCount(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @returns {number}
   */
  getLoadedCovariancesCount() {
    const ret = wasm.splatbuffer_getLoadedCovariancesCount(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @returns {number}
   */
  getVisibleIndicesBufferPtr() {
    const ret = wasm.splatbuffer_getVisibleIndicesBufferPtr(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @returns {number | undefined}
   */
  getShCoeffsIndicesBufferPtr() {
    const ret = wasm.splatbuffer_getShCoeffsIndicesBufferPtr(this.__wbg_ptr);
    return ret === 4294967297 ? void 0 : ret;
  }
  /**
   * @returns {number}
   */
  getLoadedShCoeffsIndicesCount() {
    const ret = wasm.splatbuffer_getLoadedShCoeffsIndicesCount(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @returns {number}
   */
  getDistanceLoadedFromSceneCenter() {
    const ret = wasm.splatbuffer_getDistanceLoadedFromSceneCenter(this.__wbg_ptr);
    return ret;
  }
  /**
   * @param {number} sh_degree
   * @param {string} format
   * @param {Uint8Array | null} [state]
   * @param {THREE.Matrix4 | null} [transform]
   * @returns {Uint8Array}
   */
  export(sh_degree, format, state, transform) {
    const ptr0 = passStringToWasm0(format, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(state) ? 0 : passArray8ToWasm0(state, wasm.__wbindgen_malloc);
    var len1 = WASM_VECTOR_LEN;
    const ret = wasm.splatbuffer_export(this.__wbg_ptr, sh_degree, ptr0, len0, ptr1, len1, isLikeNone(transform) ? 0 : addToExternrefTable0(transform));
    if (ret[3]) {
      throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v3;
  }
  /**
   * @param {THREE.Vector3} origin
   * @param {THREE.Vector3} direction
   * @param {boolean} precise
   * @param {boolean} first_hit_only
   * @returns {Hit[]}
   */
  raycast(origin, direction, precise, first_hit_only) {
    const ret = wasm.splatbuffer_raycast(this.__wbg_ptr, origin, direction, precise, first_hit_only);
    var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
  }
  /**
   * @returns {any}
   */
  getOctree() {
    const ret = wasm.splatbuffer_getOctree(this.__wbg_ptr);
    return ret;
  }
}
if (Symbol.dispose) SplatBuffer.prototype[Symbol.dispose] = SplatBuffer.prototype.free;
const wbg_rayon_PoolBuilderFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_wbg_rayon_poolbuilder_free(ptr >>> 0, 1));
class wbg_rayon_PoolBuilder {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(wbg_rayon_PoolBuilder.prototype);
    obj.__wbg_ptr = ptr;
    wbg_rayon_PoolBuilderFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    wbg_rayon_PoolBuilderFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_wbg_rayon_poolbuilder_free(ptr, 0);
  }
  /**
   * @returns {number}
   */
  numThreads() {
    const ret = wasm.wbg_rayon_poolbuilder_numThreads(this.__wbg_ptr);
    return ret >>> 0;
  }
  build() {
    wasm.wbg_rayon_poolbuilder_build(this.__wbg_ptr);
  }
  /**
   * @returns {number}
   */
  receiver() {
    const ret = wasm.wbg_rayon_poolbuilder_receiver(this.__wbg_ptr);
    return ret >>> 0;
  }
}
if (Symbol.dispose) wbg_rayon_PoolBuilder.prototype[Symbol.dispose] = wbg_rayon_PoolBuilder.prototype.free;
const EXPECTED_RESPONSE_TYPES = /* @__PURE__ */ new Set(["basic", "cors", "default"]);
async function __wbg_load(module, imports) {
  if (typeof Response === "function" && module instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(module, imports);
      } catch (e) {
        const validResponse = module.ok && EXPECTED_RESPONSE_TYPES.has(module.type);
        if (validResponse && module.headers.get("Content-Type") !== "application/wasm") {
          console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
        } else {
          throw e;
        }
      }
    }
    const bytes = await module.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module, imports);
    if (instance instanceof WebAssembly.Instance) {
      return { instance, module };
    } else {
      return instance;
    }
  }
}
function __wbg_get_imports(memory) {
  const imports = {};
  imports.wbg = {};
  imports.wbg.__wbg_Window_925630dd9364b9e7 = function(arg0) {
    const ret = arg0.Window;
    return ret;
  };
  imports.wbg.__wbg_WorkerGlobalScope_f8a15b453de109c0 = function(arg0) {
    const ret = arg0.WorkerGlobalScope;
    return ret;
  };
  imports.wbg.__wbg___wbindgen_boolean_get_6d5a1ee65bab5f68 = function(arg0) {
    const v = arg0;
    const ret = typeof v === "boolean" ? v : void 0;
    return isLikeNone(ret) ? 16777215 : ret ? 1 : 0;
  };
  imports.wbg.__wbg___wbindgen_debug_string_df47ffb5e35e6763 = function(arg0, arg1) {
    const ret = debugString(arg1);
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbg___wbindgen_is_function_ee8a6c5833c90377 = function(arg0) {
    const ret = typeof arg0 === "function";
    return ret;
  };
  imports.wbg.__wbg___wbindgen_is_undefined_2d472862bd29a478 = function(arg0) {
    const ret = arg0 === void 0;
    return ret;
  };
  imports.wbg.__wbg___wbindgen_memory_27faa6e0e73716bd = function() {
    const ret = wasm.memory;
    return ret;
  };
  imports.wbg.__wbg___wbindgen_module_66f1f22805762dd9 = function() {
    const ret = __wbg_init.__wbindgen_wasm_module;
    return ret;
  };
  imports.wbg.__wbg___wbindgen_number_get_a20bf9b85341449d = function(arg0, arg1) {
    const obj = arg1;
    const ret = typeof obj === "number" ? obj : void 0;
    getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
  };
  imports.wbg.__wbg___wbindgen_rethrow_ea38273dafc473e6 = function(arg0) {
    throw arg0;
  };
  imports.wbg.__wbg___wbindgen_throw_b855445ff6a94295 = function(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
  };
  imports.wbg.__wbg__wbg_cb_unref_2454a539ea5790d9 = function(arg0) {
    arg0._wbg_cb_unref();
  };
  imports.wbg.__wbg_async_e87317718510d1c4 = function(arg0) {
    const ret = arg0.async;
    return ret;
  };
  imports.wbg.__wbg_body_587542b2fd8e06c0 = function(arg0) {
    const ret = arg0.body;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
  };
  imports.wbg.__wbg_buffer_83ef46cd84885a60 = function(arg0) {
    const ret = arg0.buffer;
    return ret;
  };
  imports.wbg.__wbg_call_357bb72daee10695 = function() {
    return handleError(function(arg0, arg1, arg2, arg3, arg4) {
      const ret = arg0.call(arg1, arg2, arg3, arg4);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_call_525440f72fbfc0ea = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = arg0.call(arg1, arg2);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_call_e45d2cf9fc925fcf = function() {
    return handleError(function(arg0, arg1, arg2, arg3) {
      const ret = arg0.call(arg1, arg2, arg3);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_call_e762c39fa8ea36bf = function() {
    return handleError(function(arg0, arg1) {
      const ret = arg0.call(arg1);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_data_ee4306d069f24f2d = function(arg0) {
    const ret = arg0.data;
    return ret;
  };
  imports.wbg.__wbg_elements_a81bc7dfdce748ad = function(arg0, arg1) {
    const ret = arg1.elements;
    const ptr1 = passArrayJsValueToWasm0(ret, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbg_error_7534b8e9a36f1ab4 = function(arg0, arg1) {
    let deferred0_0;
    let deferred0_1;
    try {
      deferred0_0 = arg0;
      deferred0_1 = arg1;
      console.error(getStringFromWasm0(arg0, arg1));
    } finally {
      wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
    }
  };
  imports.wbg.__wbg_fetch_0c645bcbfc592368 = function(arg0, arg1) {
    const ret = arg0.fetch(arg1);
    return ret;
  };
  imports.wbg.__wbg_fetch_f8ba0e29a9d6de0d = function(arg0, arg1) {
    const ret = arg0.fetch(arg1);
    return ret;
  };
  imports.wbg.__wbg_getReader_15e2d3098e32c359 = function(arg0) {
    const ret = arg0.getReader();
    return ret;
  };
  imports.wbg.__wbg_get_0f894efab704acbc = function() {
    return handleError(function(arg0, arg1, arg2, arg3) {
      const ret = arg1.get(getStringFromWasm0(arg2, arg3));
      var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      var len1 = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
      getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments);
  };
  imports.wbg.__wbg_get_efcb449f58ec27c2 = function() {
    return handleError(function(arg0, arg1) {
      const ret = Reflect.get(arg0, arg1);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_headers_b87d7eaba61c3278 = function(arg0) {
    const ret = arg0.headers;
    return ret;
  };
  imports.wbg.__wbg_hit_new = function(arg0) {
    const ret = Hit.__wrap(arg0);
    return ret;
  };
  imports.wbg.__wbg_instanceof_File_b7e4dbeba5bb2cd0 = function(arg0) {
    let result;
    try {
      result = arg0 instanceof File;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_instanceof_Object_10bb762262230c68 = function(arg0) {
    let result;
    try {
      result = arg0 instanceof Object;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_instanceof_Response_f4f3e87e07f3135c = function(arg0) {
    let result;
    try {
      result = arg0 instanceof Response;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_instanceof_Uint8Array_20c8e73002f7af98 = function(arg0) {
    let result;
    try {
      result = arg0 instanceof Uint8Array;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_instanceof_Window_4846dbb3de56c84c = function(arg0) {
    let result;
    try {
      result = arg0 instanceof Window;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_length_69bca3cb64fc8748 = function(arg0) {
    const ret = arg0.length;
    return ret;
  };
  imports.wbg.__wbg_new_1acc0b6eea89d040 = function() {
    const ret = new Object();
    return ret;
  };
  imports.wbg.__wbg_new_2531773dac38ebb3 = function() {
    return handleError(function() {
      const ret = new AbortController();
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_new_3c3d849046688a66 = function(arg0, arg1) {
    try {
      var state0 = { a: arg0, b: arg1 };
      var cb0 = (arg02, arg12) => {
        const a = state0.a;
        state0.a = 0;
        try {
          return wasm_bindgen__convert__closures_____invoke__hbd00c4131b3fd34f(a, state0.b, arg02, arg12);
        } finally {
          state0.a = a;
        }
      };
      const ret = new Promise(cb0);
      return ret;
    } finally {
      state0.a = state0.b = 0;
    }
  };
  imports.wbg.__wbg_new_4768a01acc2de787 = function() {
    return handleError(function(arg0, arg1) {
      const ret = new Worker(getStringFromWasm0(arg0, arg1));
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_new_5a79be3ab53b8aa5 = function(arg0) {
    const ret = new Uint8Array(arg0);
    return ret;
  };
  imports.wbg.__wbg_new_76221876a34390ff = function(arg0) {
    const ret = new Int32Array(arg0);
    return ret;
  };
  imports.wbg.__wbg_new_81afc06ccd3bd6a5 = function() {
    return handleError(function(arg0, arg1) {
      const ret = new URL(getStringFromWasm0(arg0, arg1));
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_new_8877f0fdb78fd48d = function() {
    return handleError(function() {
      const ret = new FileReader();
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_new_8a6f238a6ece86ea = function() {
    const ret = new Error();
    return ret;
  };
  imports.wbg.__wbg_new_e17d9f43105b08be = function() {
    const ret = new Array();
    return ret;
  };
  imports.wbg.__wbg_new_from_slice_92f4d78ca282a2d2 = function(arg0, arg1) {
    const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
    return ret;
  };
  imports.wbg.__wbg_new_no_args_ee98eee5275000a4 = function(arg0, arg1) {
    const ret = new Function(getStringFromWasm0(arg0, arg1));
    return ret;
  };
  imports.wbg.__wbg_new_with_str_and_init_0ae7728b6ec367b1 = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = new Request(getStringFromWasm0(arg0, arg1), arg2);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_of_3192b3b018b8f660 = function(arg0, arg1, arg2) {
    const ret = Array.of(arg0, arg1, arg2);
    return ret;
  };
  imports.wbg.__wbg_pathname_97c89bacefdfbf5e = function(arg0, arg1) {
    const ret = arg1.pathname;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbg_postMessage_f34857ca078c8536 = function() {
    return handleError(function(arg0, arg1) {
      arg0.postMessage(arg1);
    }, arguments);
  };
  imports.wbg.__wbg_prototypesetcall_2a6620b6922694b2 = function(arg0, arg1, arg2) {
    Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
  };
  imports.wbg.__wbg_queueMicrotask_34d692c25c47d05b = function(arg0) {
    const ret = arg0.queueMicrotask;
    return ret;
  };
  imports.wbg.__wbg_queueMicrotask_9d76cacb20c84d58 = function(arg0) {
    queueMicrotask(arg0);
  };
  imports.wbg.__wbg_readAsArrayBuffer_5c4a07e9a73655a8 = function() {
    return handleError(function(arg0, arg1) {
      arg0.readAsArrayBuffer(arg1);
    }, arguments);
  };
  imports.wbg.__wbg_read_48f1593df542f968 = function(arg0) {
    const ret = arg0.read();
    return ret;
  };
  imports.wbg.__wbg_resolve_caf97c30b83f7053 = function(arg0) {
    const ret = Promise.resolve(arg0);
    return ret;
  };
  imports.wbg.__wbg_result_f97bdbdd536e2ab7 = function() {
    return handleError(function(arg0) {
      const ret = arg0.result;
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_set_3f1d0b984ed272ed = function(arg0, arg1, arg2) {
    arg0[arg1] = arg2;
  };
  imports.wbg.__wbg_set_c213c871859d6500 = function(arg0, arg1, arg2) {
    arg0[arg1 >>> 0] = arg2;
  };
  imports.wbg.__wbg_set_onerror_0152e3d5690688d8 = function(arg0, arg1) {
    arg0.onerror = arg1;
  };
  imports.wbg.__wbg_set_onload_e1aadd996e755e9c = function(arg0, arg1) {
    arg0.onload = arg1;
  };
  imports.wbg.__wbg_set_onmessage_d57c4b653d57594f = function(arg0, arg1) {
    arg0.onmessage = arg1;
  };
  imports.wbg.__wbg_set_signal_dda2cf7ccb6bee0f = function(arg0, arg1) {
    arg0.signal = arg1;
  };
  imports.wbg.__wbg_signal_4db5aa055bf9eb9a = function(arg0) {
    const ret = arg0.signal;
    return ret;
  };
  imports.wbg.__wbg_size_0a5a003dbf5dfee8 = function(arg0) {
    const ret = arg0.size;
    return ret;
  };
  imports.wbg.__wbg_slice_4947c0e051116da5 = function() {
    return handleError(function(arg0, arg1, arg2) {
      const ret = arg0.slice(arg1, arg2);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_splatbuffer_new = function(arg0) {
    const ret = SplatBuffer.__wrap(arg0);
    return ret;
  };
  imports.wbg.__wbg_stack_0ed75d68575b0f3c = function(arg0, arg1) {
    const ret = arg1.stack;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbg_startWorkers_2ca11761e08ff5d5 = function(arg0, arg1, arg2) {
    const ret = startWorkers(arg0, arg1, wbg_rayon_PoolBuilder.__wrap(arg2));
    return ret;
  };
  imports.wbg.__wbg_static_accessor_GLOBAL_89e1d9ac6a1b250e = function() {
    const ret = typeof global === "undefined" ? null : global;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
  };
  imports.wbg.__wbg_static_accessor_GLOBAL_THIS_8b530f326a9e48ac = function() {
    const ret = typeof globalThis === "undefined" ? null : globalThis;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
  };
  imports.wbg.__wbg_static_accessor_SELF_6fdf4b64710cc91b = function() {
    const ret = typeof self === "undefined" ? null : self;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
  };
  imports.wbg.__wbg_static_accessor_WINDOW_b45bfc5a37f6cfa2 = function() {
    const ret = typeof window === "undefined" ? null : window;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
  };
  imports.wbg.__wbg_status_de7eed5a7a5bfd5d = function(arg0) {
    const ret = arg0.status;
    return ret;
  };
  imports.wbg.__wbg_then_4f46f6544e6b4a28 = function(arg0, arg1) {
    const ret = arg0.then(arg1);
    return ret;
  };
  imports.wbg.__wbg_then_70d05cf780a18d77 = function(arg0, arg1, arg2) {
    const ret = arg0.then(arg1, arg2);
    return ret;
  };
  imports.wbg.__wbg_value_e323024c868b5146 = function(arg0) {
    const ret = arg0.value;
    return ret;
  };
  imports.wbg.__wbg_waitAsync_2c4b633ebb554615 = function() {
    const ret = Atomics.waitAsync;
    return ret;
  };
  imports.wbg.__wbg_waitAsync_95332bf1b4fe4c52 = function(arg0, arg1, arg2) {
    const ret = Atomics.waitAsync(arg0, arg1 >>> 0, arg2);
    return ret;
  };
  imports.wbg.__wbg_x_ee17d5da172d082f = function(arg0) {
    const ret = arg0.x;
    return ret;
  };
  imports.wbg.__wbg_y_74842f81d209bef6 = function(arg0) {
    const ret = arg0.y;
    return ret;
  };
  imports.wbg.__wbg_z_a3f29b8ed2d03d80 = function(arg0) {
    const ret = arg0.z;
    return ret;
  };
  imports.wbg.__wbindgen_cast_2241b6af4c4b2941 = function(arg0, arg1) {
    const ret = getStringFromWasm0(arg0, arg1);
    return ret;
  };
  imports.wbg.__wbindgen_cast_680aab450cdb72e9 = function(arg0, arg1) {
    const ret = makeMutClosure(arg0, arg1, wasm.wasm_bindgen__closure__destroy__h39abd31795ffdd07, wasm_bindgen__convert__closures_____invoke__h02e0b48227951a64);
    return ret;
  };
  imports.wbg.__wbindgen_cast_70dfa8acee24d589 = function(arg0, arg1) {
    const ret = makeMutClosure(arg0, arg1, wasm.wasm_bindgen__closure__destroy__h39abd31795ffdd07, wasm_bindgen__convert__closures_____invoke__h02e0b48227951a64);
    return ret;
  };
  imports.wbg.__wbindgen_cast_a48372382a400f7b = function(arg0, arg1) {
    const ret = makeMutClosure(arg0, arg1, wasm.wasm_bindgen__closure__destroy__h680e002657d1ad36, wasm_bindgen__convert__closures_____invoke__h7c8446d1165c7308);
    return ret;
  };
  imports.wbg.__wbindgen_cast_d6cd19b81560fd6e = function(arg0) {
    const ret = arg0;
    return ret;
  };
  imports.wbg.__wbindgen_init_externref_table = function() {
    const table = wasm.__wbindgen_externrefs;
    const offset = table.grow(4);
    table.set(0, void 0);
    table.set(offset + 0, void 0);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
  };
  imports.wbg.__wbindgen_link_b9f45ffe079ef2c1 = function(arg0) {
    const val = `onmessage = function (ev) {
            let [ia, index, value] = ev.data;
            ia = new Int32Array(ia.buffer);
            let result = Atomics.wait(ia, index, value);
            postMessage(result);
        };
        `;
    const ret = typeof URL.createObjectURL === "undefined" ? "data:application/javascript," + encodeURIComponent(val) : URL.createObjectURL(new Blob([val], { type: "text/javascript" }));
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.memory = memory || new WebAssembly.Memory({ initial: 24, maximum: 65536, shared: true });
  return imports;
}
function __wbg_finalize_init(instance, module, thread_stack_size) {
  wasm = instance.exports;
  __wbg_init.__wbindgen_wasm_module = module;
  cachedDataViewMemory0 = null;
  cachedFloat32ArrayMemory0 = null;
  cachedUint32ArrayMemory0 = null;
  cachedUint8ArrayMemory0 = null;
  if (typeof thread_stack_size !== "undefined" && (typeof thread_stack_size !== "number" || thread_stack_size === 0 || thread_stack_size % 65536 !== 0)) {
    throw "invalid stack size";
  }
  wasm.__wbindgen_start(thread_stack_size);
  return wasm;
}
async function __wbg_init(module_or_path, memory) {
  if (wasm !== void 0) return wasm;
  let thread_stack_size;
  if (typeof module_or_path !== "undefined") {
    if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
      ({ module_or_path, memory, thread_stack_size } = module_or_path);
    } else {
      console.warn("using deprecated parameters for the initialization function; pass a single object instead");
    }
  }
  if (typeof module_or_path === "undefined") {
    module_or_path = new URL("./gslib_bg.wasm", import.meta.url);
  }
  const imports = __wbg_get_imports(memory);
  if (typeof module_or_path === "string" || typeof Request === "function" && module_or_path instanceof Request || typeof URL === "function" && module_or_path instanceof URL) {
    module_or_path = fetch(module_or_path);
  }
  const { instance, module } = await __wbg_load(await module_or_path, imports);
  return __wbg_finalize_init(instance, module, thread_stack_size);
}
export {
  Hit,
  Point,
  SortData,
  SplatBuffer,
  __wbg_init as default,
  wbg_rayon_PoolBuilder,
  wbg_rayon_start_worker
};
