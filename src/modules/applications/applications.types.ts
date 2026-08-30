import type { Application, ApplicationScope, UserApplicationAccess } from "@prisma/client";

export type SafeApplication = Omit<Application, "clientSecretHash">;

export type ApplicationWithSecret = SafeApplication & {
  clientSecret: string;
};

export type ApplicationScopeInfo = ApplicationScope;

export type UserApplicationAccessInfo = UserApplicationAccess;

export type CreateApplicationInput = {
  name: string;
  slug: string;
  redirectUris?: string[];
};

export type UpdateApplicationInput = {
  name?: string;
  redirectUris?: string[];
  status?: "active" | "inactive" | "suspended" | "disabled";
};

export type CreateScopeInput = {
  scope: string;
  description?: string;
};

export type GrantAccessInput = {
  userId: string;
  scopes: string[];
};

export type RotateSecretResult = {
  clientSecret: string;
};
