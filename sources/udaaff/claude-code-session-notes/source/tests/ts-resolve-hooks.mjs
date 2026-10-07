export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context)
  } catch (error) {
    const isBareRelative = specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && isBareRelative) return next(`${specifier}.ts`, context)
    throw error
  }
}
