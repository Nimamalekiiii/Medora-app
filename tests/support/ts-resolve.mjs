// App code imports sibling modules without a file extension ("./study-engine"),
// which the bundler resolves but Node does not. This lets the tests load them.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && relative && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    throw error;
  }
}
