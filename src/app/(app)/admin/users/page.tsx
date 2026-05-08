import { prisma } from "@/lib/prisma";
import { getSuperadminContextForPage } from "@/lib/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UsersList } from "@/components/users-list";

export default async function UsersPage() {
  const ctx = (await getSuperadminContextForPage())!;
  const users = await prisma.user.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users ({users.length})</CardTitle>
        <CardDescription>
          Promote a user to <strong>superadmin</strong> (presales manager) so they can manage templates,
          monitor usage, and configure standards. Demote when no longer in that role.
          The system never lets you demote the last remaining superadmin — promote a replacement first.
          Multi-user invite flow comes in a follow-up MVP; for now anyone who signs up at /sign-in joins
          this tenant as a "user" by default.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <UsersList
          initial={users.map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
            createdAt: u.createdAt.toISOString(),
          }))}
          currentUserId={ctx.user.id}
        />
      </CardContent>
    </Card>
  );
}
