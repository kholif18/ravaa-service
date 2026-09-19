import { prisma } from "../../db/index.js";
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/types";

const RP_NAME = "Ravaa";
const RP_ID = process.env.WEBAUTHN_RP_ID || (process.env.NODE_ENV === "production" ? "ravaa.my.id" : "localhost");
const ORIGIN = process.env.WEBAUTHN_ORIGIN || (process.env.NODE_ENV === "production" ? "https://account.ravaa.my.id" : "http://localhost:5173");

const challengeStore = new Map<string, string>(); // userId -> challenge

export async function getRegistrationOptions(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  const existing = await prisma.webAuthnCredential.findMany({ where: { userId } });
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(user.id),
    userName: user.username,
    userDisplayName: user.displayName || user.username,
    attestationType: "none",
    excludeCredentials: existing.map(c => ({ id: c.credentialId, type: "public-key" as const })),
    authenticatorSelection: { userVerification: "preferred" },
  });
  challengeStore.set(userId, options.challenge);
  return options;
}

export async function verifyRegistration(userId: string, body: RegistrationResponseJSON, deviceName?: string) {
  const expectedChallenge = challengeStore.get(userId);
  if (!expectedChallenge) throw new Error("No challenge");
  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  } as any);
  if (!verification.verified || !verification.registrationInfo) throw new Error("Verification failed");
  const { credential } = verification.registrationInfo;
  const credId = credential.id;
  await prisma.webAuthnCredential.create({
    data: {
      userId,
      credentialId: credId,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: BigInt(credential.counter || 0),
      deviceName: deviceName || "Passkey",
    },
  });
  challengeStore.delete(userId);
  return { verified: true };
}

export async function getAuthenticationOptions(identifier?: string) {
  let allowCredentials: { id: string; type: "public-key" }[] | undefined;
  if (identifier) {
    const user = await prisma.user.findFirst({ where: { OR: [{ email: identifier }, { username: identifier }] } });
    if (user) {
      const creds = await prisma.webAuthnCredential.findMany({ where: { userId: user.id } });
      allowCredentials = creds.map(c => ({ id: c.credentialId, type: "public-key" as const }));
    }
  }
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials,
    userVerification: "preferred",
  });
  const key = identifier || "login";
  challengeStore.set(key, options.challenge);
  return options;
}

export async function verifyAuthentication(identifier: string, body: AuthenticationResponseJSON) {
  const user = await prisma.user.findFirst({ where: { OR: [{ email: identifier }, { username: identifier }] } });
  if (!user) throw new Error("User not found");
  const cred = await prisma.webAuthnCredential.findUnique({ where: { credentialId: body.id } });
  if (!cred || cred.userId !== user.id) throw new Error("Credential not found");
  const expectedChallenge = challengeStore.get(identifier) || challengeStore.get("login");
  if (!expectedChallenge) throw new Error("No challenge");
  const verification = await verifyAuthenticationResponse({
    response: body as any,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: cred.credentialId,
      publicKey: Buffer.from(cred.publicKey, "base64url"),
      counter: Number(cred.counter),
    } as any,
  } as any);
  if (!verification.verified) throw new Error("Verification failed");
  await prisma.webAuthnCredential.update({ where: { id: cred.id }, data: { counter: BigInt(verification.authenticationInfo.newCounter) } });
  challengeStore.delete(identifier);
  challengeStore.delete("login");
  return user;
}

export async function listCredentials(userId: string) {
  return prisma.webAuthnCredential.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export async function deleteCredential(userId: string, credId: string) {
  const cred = await prisma.webAuthnCredential.findUnique({ where: { id: credId } });
  if (!cred || cred.userId !== userId) throw new Error("Not found");
  await prisma.webAuthnCredential.delete({ where: { id: credId } });
}
