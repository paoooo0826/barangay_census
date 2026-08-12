export function readFile() {
  throw new Error('Filesystem access is unavailable in the browser.');
}

export default { readFile };
