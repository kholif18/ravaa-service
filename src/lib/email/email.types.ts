export type EmailOptions = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailProvider = {
  send(options: EmailOptions): Promise<void>;
  readonly name: string;
};

export type VerificationEmailData = {
  to: string;
  displayName: string | null;
  verificationUrl: string;
  expiresHours: number;
};
