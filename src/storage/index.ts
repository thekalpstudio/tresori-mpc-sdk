import type { KeyStore } from '../types';

export class LocalStorageKeyStore implements KeyStore {
  private prefix: string;

  constructor(prefix = 'kalp_mpc_') {
    this.prefix = prefix;
  }

  async get(key: string): Promise<string | null> {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    return localStorage.getItem(this.prefix + key);
  }

  async set(key: string, value: string): Promise<void> {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('localStorage is not available');
    }
    localStorage.setItem(this.prefix + key, value);
  }

  async remove(key: string): Promise<void> {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    localStorage.removeItem(this.prefix + key);
  }
}

export class InMemoryKeyStore implements KeyStore {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }
}
