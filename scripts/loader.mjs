export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'vitest') {
    return { url: new URL('./vitest-shim.mjs', import.meta.url).href, shortCircuit: true };
  }
  try {
    return await nextResolve(specifier, context);
  } catch (e) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) {
      return await nextResolve(specifier + '.ts', context);
    }
    throw e;
  }
}
