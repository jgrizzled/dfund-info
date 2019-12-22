// return array of function calls/promises with deduplicated references
// useful for reducing amount of async API calls if they ask for the same data

export class PromiseDeduper {
  constructor() {
    this.uniqueJobs = [];
    this.uniquePromises = [];
    this.dedupePromise = this.dedupePromise.bind(this);
  }
  // pass in function reference, array of arguments
  dedupePromise(func, callData) {
    const job = { func, callData };
    const uniqueJobIndex = this.uniqueJobs.findIndex(
      uniqueJob =>
        uniqueJob.func === job.func &&
        isEquivalentObj(uniqueJob.callData, job.callData)
    );
    if (uniqueJobIndex === -1) {
      this.uniqueJobs.push(job);
      const newJobIndex = this.uniqueJobs.length - 1;
      this.uniquePromises.push(
        job
          .func(...job.callData)
          .catch(e => e)
          .then(r => {
            // remove finished jobs from queue
            this.uniqueJobs.splice(newJobIndex, 1);
            this.uniquePromises.splice(newJobIndex, 1);
            return r;
          })
      );
      return this.uniquePromises[newJobIndex];
    } else return this.uniquePromises[uniqueJobIndex];
  }
}

// check object properties to determine equivalence
const isEquivalentObj = (a, b) => {
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' && typeof b !== 'object') return a === b;
  const aProps = Object.keys(a);
  const bProps = Object.keys(b);
  if (aProps.length !== bProps.length) return false;
  for (const prop of aProps) {
    if (!isEquivalentObj(a[prop], b[prop])) return false;
  }
  return true;
};
