export class AssertionError extends Error {
  public constructor(message = 'Assertion failed') {
    super(message);
    this.name = 'AssertionError';
  }
}
