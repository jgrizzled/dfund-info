// Use instead of Promise.all to avoid throwing an error if even one promise is rejected

export const settlePromises = promises => {
  return Promise.all(promises.map(p => p.catch(e => e)));
};
