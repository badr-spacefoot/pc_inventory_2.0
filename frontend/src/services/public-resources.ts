export interface WeatherSnapshot {
  collectedAt: string | undefined;
  isDay: boolean;
  temperature: number | undefined;
  weatherCode: number | undefined;
}

export interface WeatherRequest {
  latitude: number;
  longitude: number;
  temperatureUnit: "celsius" | "fahrenheit";
}

export class ResourceRequestError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = "ResourceRequestError";
  }
}

interface ResourceRequestOptions {
  cache?: RequestCache;
  retries?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface WeatherResponse {
  current?: {
    is_day?: number;
    temperature_2m?: number;
    time?: string;
    weather_code?: number;
  };
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds));

export class PublicResourceService {
  constructor(private readonly fetchImplementation: typeof fetch = fetch.bind(globalThis)) {}

  private async request<T>(
    url: string | URL,
    parser: (response: Response) => Promise<T>,
    options: ResourceRequestOptions = {},
  ): Promise<T> {
    const retries = Math.max(0, options.retries ?? 1);
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = globalThis.setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);

    try {
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const response = await this.fetchImplementation(url, {
            ...(options.cache ? { cache: options.cache } : {}),
            method: "GET",
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new ResourceRequestError(`HTTP ${response.status}`, response.status);
          }
          return await parser(response);
        } catch (error) {
          if (controller.signal.aborted || attempt >= retries) throw error;
          await wait(150 * (attempt + 1));
        }
      }
      throw new ResourceRequestError("Resource request failed");
    } finally {
      globalThis.clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  async getJson<T>(url: string | URL, options: ResourceRequestOptions = {}): Promise<T> {
    return this.request(url, (response) => response.json() as Promise<T>, options);
  }

  async getText(url: string | URL, options: ResourceRequestOptions = {}): Promise<string> {
    return this.request(url, (response) => response.text(), options);
  }

  async getWeather(request: WeatherRequest, signal?: AbortSignal): Promise<WeatherSnapshot> {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(request.latitude));
    url.searchParams.set("longitude", String(request.longitude));
    url.searchParams.set("current", "temperature_2m,weather_code,is_day");
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("temperature_unit", request.temperatureUnit);
    const data = await this.getJson<WeatherResponse>(url, {
      ...(signal ? { signal } : {}),
      timeoutMs: 8_000,
    });
    return {
      temperature: data.current?.temperature_2m,
      weatherCode: data.current?.weather_code,
      isDay: Boolean(data.current?.is_day),
      collectedAt: data.current?.time,
    };
  }
}
