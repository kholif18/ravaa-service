import "dotenv/config";
import { prisma } from "../src/db/index.js";
import { hashPassword } from "../src/lib/password.js";
import { Prisma } from "@prisma/client";

// Deterministic IDs for seed data (so upsert is stable across resets)
const SEED_IDS = {
  admin: "00000000-0000-4000-a000-000000000001",
  demo: "00000000-0000-4000-a000-000000000002",
  appDrive: "00000000-0000-4000-a000-000000000011",
  appNote: "00000000-0000-4000-a000-000000000012",
};

async function hash(p: string) {
  return hashPassword(p);
}

async function upsertUser(opts: {
  id: string;
  email: string;
  username: string;
  displayName: string;
  password: string;
  role: "USER" | "ADMIN";
}) {
  const passwordHash = await hash(opts.password);
  const data = {
    id: opts.id,
    email: opts.email.toLowerCase().trim(),
    username: opts.username.toLowerCase().trim(),
    displayName: opts.displayName,
    passwordHash,
    role: opts.role as any,
    status: "active" as const,
    emailVerifiedAt: new Date(),
    failedLoginCount: 0,
    lockedUntil: null,
    recoveryEmail: null,
    recoveryPhone: null,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    twoFactorBackupCodes: [] as string[],
  };

  // Use upsert by email (unique) — but we also want deterministic id for fresh inserts
  // First try to find by email, then update or create with explicit id
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    // Preserve user personalizations (displayName, username, recovery, avatar) jika sudah ada
    // Hanya reset hal kritis: password (agar login predictable), role, status, verified, lock
    // Ini menjaga data user dipertahankan saat seed di-run ulang (migrasi ALTER TABLE, reset, dll)
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        // username/displayName hanya di-update jika masih default atau kosong — preservasi custom value
        // Untuk admin, kita tetap sync username dari env jika berbeda dari existing, tapi jangan overwrite displayName custom?
        // Saat ini: keep existing username/displayName agar tidak menghapus edit profile user
        passwordHash: data.passwordHash,
        role: data.role,
        status: "active",
        emailVerifiedAt: existing.emailVerifiedAt ?? data.emailVerifiedAt,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    return updated;
  }

  // Also check by id in case email changed but id collision
  const byId = await prisma.user.findUnique({ where: { id: opts.id } });
  if (byId) {
    // id taken but different email — just create with new uuid instead
    const created = await prisma.user.create({
      data: {
        email: data.email,
        username: data.username,
        displayName: data.displayName,
        passwordHash: data.passwordHash,
        role: data.role,
        status: "active",
        emailVerifiedAt: data.emailVerifiedAt,
      },
    });
    return created;
  }

  const created = await prisma.user.create({ data });
  return created;
}

async function upsertApplication(opts: {
  id: string;
  name: string;
  slug: string;
  redirectUris?: string[];
}) {
  const secret = `seed_secret_${opts.slug}`;
  // hash like applications.service does (sha256 hex)
  const { createHash } = await import("node:crypto");
  const clientSecretHash = createHash("sha256").update(secret).digest("hex");
  const clientId = `${opts.slug}_seed_${opts.id.slice(0, 8)}`;

  const existing = await prisma.application.findUnique({ where: { slug: opts.slug } });
  if (existing) {
    return prisma.application.update({
      where: { id: existing.id },
      data: {
        name: opts.name,
        redirectUris: opts.redirectUris ?? [],
        status: "active",
      },
    });
  }

  // try by id
  const byId = await prisma.application.findUnique({ where: { id: opts.id } });
  if (byId) {
    return byId;
  }

  return prisma.application.create({
    data: {
      id: opts.id,
      name: opts.name,
      slug: opts.slug,
      clientId,
      clientSecretHash,
      redirectUris: opts.redirectUris ?? [],
      status: "active",
    },
  });
}

async function main() {
  console.log("🌱 Seeding Ravaa Service...");

  const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || "admin@ravaa.my.id").trim();
  const adminPassword = (process.env.INITIAL_ADMIN_PASSWORD || "Secret123").trim();
  const adminUsername = (process.env.INITIAL_ADMIN_USERNAME || adminEmail.split("@")[0] || "admin").trim().toLowerCase();

  const admin = await upsertUser({
    id: SEED_IDS.admin,
    email: adminEmail,
    username: adminUsername,
    displayName: "Ravaa Admin",
    password: adminPassword,
    role: "ADMIN",
  });
  // Set storageLimit for admin (10GB) and ensure persisted
  await prisma.user.update({ where: { id: admin.id }, data: { storageLimit: BigInt(10737418240) } }).catch(()=>{});
  console.log(`  ✓ Admin: ${admin.email} / ${admin.username} (role: ${admin.role})`);

  // Demo user — always seeded unless SEED_DEMO_USER=false
  const seedDemo = (process.env.SEED_DEMO_USER ?? "true") !== "false";
  let demo: any = null;
  if (seedDemo) {
    demo = await upsertUser({
      id: SEED_IDS.demo,
      email: "demo@ravaa.my.id",
      username: "demo",
      displayName: "Demo User",
      password: "demo12345",
      role: "USER",
    });
    await prisma.user.update({ where: { id: demo.id }, data: { storageLimit: BigInt(5368709120) } }).catch(()=>{});
    console.log(`  ✓ Demo : ${demo.email} / ${demo.username} (password: demo12345)`);
  }

  // Sample applications — for testing GET /api/v1/me/applications and admin UI
  const seedApps = (process.env.SEED_SAMPLE_APPS ?? "true") !== "false";
  if (seedApps) {
    const drive = await upsertApplication({
      id: SEED_IDS.appDrive,
      name: "Ravaa Drive",
      slug: "ravaa-drive",
      redirectUris: ["http://localhost:5174/callback", "http://localhost:3000/callback"],
    });
    console.log(`  ✓ App  : ${drive.name} (${drive.slug})`);

    const note = await upsertApplication({
      id: SEED_IDS.appNote,
      name: "Ravaa Note",
      slug: "ravaa-note",
      redirectUris: ["http://localhost:5175/callback"],
    });
    console.log(`  ✓ App  : ${note.name} (${note.slug})`);

    // Create scopes for apps if missing
    const scopesToSeed = [
      { applicationId: drive.id, scope: "drive:read", description: "Read files" },
      { applicationId: drive.id, scope: "drive:write", description: "Write files" },
      { applicationId: drive.id, scope: "session:introspect", description: "Introspect Ravaa sessions (server-to-server)" },
      { applicationId: drive.id, scope: "authorization:read", description: "Read authorization (server-to-server)" },
      { applicationId: note.id, scope: "notes:read", description: "Read notes" },
      { applicationId: note.id, scope: "notes:write", description: "Write notes" },
    ];
    for (const s of scopesToSeed) {
      const exists = await prisma.applicationScope.findUnique({
        where: { applicationId_scope: { applicationId: s.applicationId, scope: s.scope } },
      });
      if (!exists) {
        await prisma.applicationScope.create({ data: s });
        console.log(`    · scope ${s.scope} for ${s.applicationId.slice(0, 8)}`);
      }
    }

    // Give demo user access to drive (so GET /me/applications returns something)
    if (demo) {
      const existingAccess = await prisma.userApplicationAccess.findUnique({
        where: { userId_applicationId: { userId: demo.id, applicationId: drive.id } },
      });
      if (!existingAccess) {
        await prisma.userApplicationAccess.create({
          data: {
            userId: demo.id,
            applicationId: drive.id,
            scopes: ["drive:read", "drive:write"],
          },
        });
        console.log(`    · granted demo → drive`);
      }
      // Also give admin access to note for variety
      const adminAccess = await prisma.userApplicationAccess.findUnique({
        where: { userId_applicationId: { userId: admin.id, applicationId: note.id } },
      });
      if (!adminAccess) {
        await prisma.userApplicationAccess.create({
          data: {
            userId: admin.id,
            applicationId: note.id,
            scopes: ["notes:read"],
          },
        });
        console.log(`    · granted admin → note`);
      }
    }
  }

  // Permissions catalogue — seed a few common permissions if not exists
  const perms = [
    { resource: "drive", action: "read", description: "Read drive files" },
    { resource: "drive", action: "write", description: "Write drive files" },
    { resource: "notes", action: "read", description: "Read notes" },
    { resource: "notes", action: "write", description: "Write notes" },
  ];
  for (const p of perms) {
    const exists = await prisma.permission.findUnique({
      where: { resource_action: { resource: p.resource, action: p.action } },
    });
    if (!exists) {
      await prisma.permission.create({ data: p });
      console.log(`  ✓ Perm : ${p.resource}:${p.action}`);
    }
  }

  console.log("✅ Seeding complete.");
  console.log("");
  console.log("   Akun tersedia:");
  console.log(`   - Admin → ${adminEmail} / ${adminPassword}  (ADMIN)`);
  if (seedDemo) console.log(`   - Demo  → demo@ravaa.my.id / demo12345  (USER)`);
  console.log("");
  console.log("   Login di http://localhost:5173/login");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("   code:", e.code, "meta:", e.meta);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
