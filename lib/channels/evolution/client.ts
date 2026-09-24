export type EvolutionSendTextInput = {
  number: string;
  text: string;
};

export type EvolutionClient = {
  sendText(input: EvolutionSendTextInput): Promise<void>;
};

export type EvolutionClientOptions = {
  apiUrl: string;
  apiKey: string;
  instance: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export class EvolutionConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvolutionConfigurationError";
  }
}

export class EvolutionRequestError extends Error {
  constructor(public readonly status: number) {
    super(`Evolution API respondió con estado ${status}`);
    this.name = "EvolutionRequestError";
  }
}

export class EvolutionTimeoutError extends Error {
  constructor() {
    super("Evolution API excedió el tiempo de espera");
    this.name = "EvolutionTimeoutError";
  }
}

function required(value: string | undefined, name: string) {
  const trimmed = value?.trim();
  if (!trimmed) throw new EvolutionConfigurationError(`${name} no está configurada`);
  return trimmed;
}

function endpoint(apiUrl: string, instance: string) {
  try {
    return new URL(`message/sendText/${encodeURIComponent(instance)}`, `${apiUrl.replace(/\/+$/, "")}/`).toString();
  } catch {
    throw new EvolutionConfigurationError("EVOLUTION_API_URL no es una URL válida");
  }
}

export function createEvolutionClient(options: EvolutionClientOptions): EvolutionClient {
  const apiUrl = required(options.apiUrl, "EVOLUTION_API_URL");
  const apiKey = required(options.apiKey, "EVOLUTION_API_KEY");
  const instance = required(options.instance, "EVOLUTION_INSTANCE");
  const request = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;

  return {
    async sendText({ number, text }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await request(endpoint(apiUrl, instance), {
          method: "POST",
          headers: { apikey: apiKey, "content-type": "application/json" },
          body: JSON.stringify({ number, text }),
          signal: controller.signal,
        });
        if (!response.ok) throw new EvolutionRequestError(response.status);
      } catch (error) {
        if (controller.signal.aborted) throw new EvolutionTimeoutError();
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export function createEvolutionClientFromEnvironment(): EvolutionClient {
  return createEvolutionClient({
    apiUrl: process.env.EVOLUTION_API_URL ?? "",
    apiKey: process.env.EVOLUTION_API_KEY ?? "",
    instance: process.env.EVOLUTION_INSTANCE ?? "",
  });
}
