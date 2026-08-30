import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.log("Skipping admin bootstrap: INITIAL_ADMIN_EMAIL or INITIAL_ADMIN_PASSWORD not set");
    return;
  }

  const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (existingUser) {
    if (existingUser.role !== "ADMIN") {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { role: "ADMIN" },
      });
      console.log(`Updated user ${adminEmail} to ADMIN role`);
    } else {
      console.log(`User ${adminEmail} is already an admin`);
    }
    return;
  }

  const passwordHash = await hashPassword(adminPassword);

  await prisma.user.create({
    data: {
      email: adminEmail,
      username: adminEmail.split("@")[0],
      passwordHash,
      displayName: "Admin",
      status: "active",
      role: "ADMIN",
    },
  });

  console.log(`Created admin user: ${adminEmail}`);
}

main()
  .catch((e) => {
    console.error("Admin bootstrap failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
