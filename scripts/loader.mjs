export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (e) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) {
      return await nextResolve(specifier + '.ts', context);
    }
    throw e;
  }
}
