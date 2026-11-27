/**
 * Run `task` at most once at a time. A call made while it runs does not start
 * a second copy; it asks for one more run when the current one ends. Saves
 * that land during a slow graph update used to stack up parallel updates.
 */
export function singleFlight(task: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | undefined;
  let again = false;
  return () => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await task();
      } while (again);
    })().finally(() => { running = undefined; });
    return running;
  };
}
