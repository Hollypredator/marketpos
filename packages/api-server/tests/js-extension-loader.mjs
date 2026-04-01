export async function resolve(specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve);
  } catch (error) {
    const needsJsExtension =
      error?.code === 'ERR_MODULE_NOT_FOUND' &&
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      !specifier.endsWith('.js') &&
      !specifier.endsWith('.json');

    if (!needsJsExtension) {
      throw error;
    }

    return defaultResolve(`${specifier}.js`, context, defaultResolve);
  }
}
