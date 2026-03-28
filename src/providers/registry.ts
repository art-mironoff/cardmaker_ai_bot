import { CardProvider } from "./types.js";

const providers = new Map<string, CardProvider>();
let currentProviderName: string | null = null;

export function registerProvider(provider: CardProvider): void {
  providers.set(provider.name, provider);
}

export function getProvider(): CardProvider {
  if (!currentProviderName) {
    throw new Error("Провайдер не установлен");
  }
  const provider = providers.get(currentProviderName);
  if (!provider) {
    throw new Error(`Провайдер "${currentProviderName}" не найден`);
  }
  return provider;
}

export function switchProvider(name: string): boolean {
  if (!providers.has(name)) {
    return false;
  }
  currentProviderName = name;
  return true;
}

export function getCurrentProviderName(): string | null {
  return currentProviderName;
}

export function getAvailableProviders(): string[] {
  return Array.from(providers.keys());
}
