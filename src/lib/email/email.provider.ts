import type { EmailOptions, EmailProvider } from "./email.types.js";

export class FakeEmailProvider implements EmailProvider {
  readonly name = "fake";
  sent: EmailOptions[] = [];

  async send(options: EmailOptions): Promise<void> {
    this.sent.push(options);
  }

  clear(): void {
    this.sent = [];
  }

  getLast(): EmailOptions | undefined {
    return this.sent[this.sent.length - 1];
  }
}

let provider: EmailProvider | null = null;

export function setEmailProvider(p: EmailProvider): void {
  provider = p;
}

export function getEmailProvider(): EmailProvider {
  if (!provider) throw new Error("Email provider not configured");
  return provider;
}

export function resetEmailProvider(): void {
  provider = null;
}
