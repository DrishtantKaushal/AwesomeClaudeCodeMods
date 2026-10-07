export const atom = (ref, initial) => ({ ref, initial })
export const read = async ($, a) => $.__get(a)
export const update = async ($, a, fn) => $.__update(a, fn)
