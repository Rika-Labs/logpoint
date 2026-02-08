const secretPattern =
  /password|secret|token|api[_-]?key|private[_-]?key|auth|credential|jwt|bearer|ssh|cookie|csrf/i;

export const isSecretVariable = (name: string): boolean => secretPattern.test(name);
