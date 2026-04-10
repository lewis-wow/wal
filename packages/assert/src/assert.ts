import { AssertionError } from './AssertionError.js';

export function assert(condition: boolean, message = 'Assertion failed'): asserts condition {
  if (!condition) {
    throw new AssertionError(message);
  }
}
