/**
 * @file src/collections/Users/index.ts
 * @version 1.1.0
 * @date 2026-10-19
 * @description Настраивает пользователей и защищает аккаунт владельца от других администраторов.
 */
import type { CollectionConfig } from "payload";

import { protectPlatformOwner } from "@/access/platformOwner.policy";
import { adminOnly } from "@/access/adminOnly";
import { adminOnlyFieldAccess } from "@/access/adminOnlyFieldAccess";
import { publicAccess } from "@/access/publicAccess";
import { adminOrSelf } from "@/access/adminOrSelf";
import { checkRole } from "@/access/utilities";

import { ensureFirstUserIsAdmin } from "./hooks/ensureFirstUserIsAdmin";

export const Users: CollectionConfig = {
  slug: "users",
  access: {
    admin: ({ req: { user } }) => checkRole(["admin"], user),
    create: publicAccess,
    delete: protectPlatformOwner(adminOnly),
    read: adminOrSelf,
    unlock: protectPlatformOwner(adminOnly),
    update: protectPlatformOwner(adminOrSelf),
  },
  admin: {
    group: "Users",
    defaultColumns: ["name", "email", "roles"],
    useAsTitle: "name",
  },
  auth: {
    tokenExpiration: 1209600,
  },
  fields: [
    {
      name: "accessManagement",
      type: "ui",
      admin: {
        components: {
          Field:
            "/src/components/admin/access-tokens/UserAccessLink.component#UserAccessLink",
        },
      },
    },
    {
      name: "name",
      type: "text",
    },
    {
      name: "roles",
      type: "select",
      access: {
        create: adminOnlyFieldAccess,
        read: adminOnlyFieldAccess,
        update: adminOnlyFieldAccess,
      },
      defaultValue: ["customer"],
      hasMany: true,
      hooks: {
        beforeChange: [ensureFirstUserIsAdmin],
      },
      options: [
        {
          label: "admin",
          value: "admin",
        },
        {
          label: "customer",
          value: "customer",
        },
      ],
    },
    {
      name: "orders",
      type: "join",
      collection: "orders",
      on: "customer",
      admin: {
        allowCreate: false,
        defaultColumns: ["id", "createdAt", "total", "currency", "items"],
      },
    },
    {
      name: "cart",
      type: "join",
      collection: "carts",
      on: "customer",
      admin: {
        allowCreate: false,
        defaultColumns: ["id", "createdAt", "total", "currency", "items"],
      },
    },
    {
      name: "addresses",
      type: "join",
      collection: "addresses",
      on: "customer",
      admin: {
        allowCreate: false,
        defaultColumns: ["id"],
      },
    },
  ],
  versions: false,
};
