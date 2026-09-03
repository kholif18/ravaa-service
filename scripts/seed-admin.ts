import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";

const prisma = new PrismaClient();

async function main() {
  // Fallback ke default jika env kosong — agar selalu ada admin setelah reset
  const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || "admin@ravaa.my.id").trim();
  const adminPassword = (process.env.INITIAL_ADMIN_PASSWORD || "Secret123").trim();
  const adminUsername = (process.env.INITIAL_ADMIN_USERNAME || adminEmail.split("@")[0] || "admin").trim().toLowerCase();

  console.log(`Seeding admin: ${adminEmail} / ${adminUsername}`);

  const existingByEmail = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existingByEmail) {
    const passwordHash = await hashPassword(adminPassword);
    await prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        username: adminUsername,
        passwordHash,
        role: "ADMIN",
        status: "active",
        emailVerifiedAt: existingByEmail.emailVerifiedAt ?? new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    console.log(`Updated existing admin ${adminEmail} → ADMIN + password reset`);
    return;
  }

  // Cek by username juga
  const existingByUsername = await prisma.user.findUnique({ where: { username: adminUsername } });
  if (existingByUsername) {
    await prisma.user.update({
      where: { id: existingByUsername.id },
      data: { role: "ADMIN", status: "active" },
    });
    console.log(`Promoted existing user ${adminUsername} to ADMIN`);
    return;
  }

  const passwordHash = await hashPassword(adminPassword);

  await prisma.user.create({
    data: {
      email: adminEmail,
      username: adminUsername,
      passwordHash,
      displayName: "Ravaa Admin",
      status: "active",
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    },
  });

  console.log(`Created admin user: ${adminEmail} (username: ${adminUsername})`);
  console.log(`Login: ${adminEmail} / ${adminPassword}`);
}

main()
  .catch((e) => {
    console.error("Admin bootstrap failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
