let nextRequestAt = 0;
/** Pace even parallel extraction requests; never change provider responses. */
export async function pacedRequest<T>(run: () => Promise<T>): Promise<T> {
  const delay = Math.max(0, nextRequestAt - Date.now());
  nextRequestAt = Math.max(Date.now(), nextRequestAt) + 1200;
  if (delay) await new Promise<void>((resolve) => setTimeout(resolve, delay));
  return run();
}
/** Resume checkpoints after infrastructure failures, as the durable worker does.
 * Functional FAILs and business/validation errors are never retried.
 */
export async function recoverInfrastructure<T>(run: () => Promise<T>, retries: Array<{ stage: string; error: string }>, stage: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await run(); }
    catch (error) {
      if (!(error instanceof Error) || !(error.name === "TimeoutError" || /^(?:Mistral|OpenAI) respondió HTTP (?:429|50[234])$/u.test(error.message)) || attempt >= 2) throw error;
      retries.push({ stage, error: `${error.name}: ${error.message}` });
      console.warn("agent infrastructure retry", { stage, attempt: attempt + 1, error: error.message });
      if (error.name !== "TimeoutError") await new Promise<void>((resolve) => setTimeout(resolve, 30_000));
    }
  }
}
