// lib/intelligence/vector.ts

export class VectorOps {
  static divide(a: Float64Array, b: Float64Array): Float64Array {
    const result = new Float64Array(a.length);

    for (let i = 0; i < a.length; i++) {
      result[i] = b[i] > 0 ? a[i] / b[i] : a[i] > 0 ? a[i] : 0;
    }

    return result;
  }

  static sum(arrays: Float64Array[]): Float64Array {
    const length = arrays[0].length;
    const result = new Float64Array(length);

    for (const arr of arrays) {
      for (let i = 0; i < length; i++) {
        result[i] += arr[i];
      }
    }

    return result;
  }

  static safeDivide(a: Float64Array, b: Float64Array): Float64Array {
    const result = new Float64Array(a.length);

    for (let i = 0; i < a.length; i++) {
      result[i] = b[i] > 0 ? a[i] / b[i] : 0;
    }

    return result;
  }
}