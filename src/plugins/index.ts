/**
 * @file src/plugins/index.ts
 * @version 2026-08-28
 * @description Компонует Payload plugins и AI source/release/integration gates.
 */

import { formBuilderPlugin } from "@payloadcms/plugin-form-builder";
import { seoPlugin } from "@payloadcms/plugin-seo";
import { Plugin } from "payload";
import { GenerateTitle, GenerateURL } from "@payloadcms/plugin-seo/types";
import {
  FixedToolbarFeature,
  HeadingFeature,
  lexicalEditor,
} from "@payloadcms/richtext-lexical";
import { ecommercePlugin } from "@payloadcms/plugin-ecommerce";
import { realizeAIPlugin } from "@realize/payload-ai-control";

import { stripeAdapter } from "@payloadcms/plugin-ecommerce/payments/stripe";

import { Page, Product } from "@/payload-types";
import { getServerSideURL } from "@/utilities/getURL";
import { ProductsCollection } from "@/collections/Products";
import { adminOrPublishedStatus } from "@/access/adminOrPublishedStatus";
import { adminOnlyFieldAccess } from "@/access/adminOnlyFieldAccess";
import { customerOnlyFieldAccess } from "@/access/customerOnlyFieldAccess";
import { isAdmin } from "@/access/isAdmin";
import { isDocumentOwner } from "@/access/isDocumentOwner";
import { checkRole } from "@/access/utilities";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOKS_SIGNING_SECRET;

const realizeAI = realizeAIPlugin({
  access: {
    canApproveRelease: ({ req }) =>
      Boolean(req.user && checkRole(["admin"], req.user)),
    canManageData: ({ req }) =>
      Boolean(req.user && checkRole(["admin"], req.user)),
    canManageIntegrations: ({ req }) =>
      Boolean(req.user && checkRole(["admin"], req.user)),
    canUseChat: ({ req }) =>
      Boolean(req.user && checkRole(["admin"], req.user)),
    canViewRuns: ({ req }) =>
      Boolean(req.user && checkRole(["admin"], req.user)),
  },
  admin: {
    group: "AI & Delivery",
    integrationsRoute: "/integrations",
    route: "/ai",
  },
  enabled: process.env.REALIZE_AI_ENABLED === "true",
  execution: {
    enabled: process.env.REALIZE_AI_EXECUTION_ENABLED === "true",
    repositoryRoot: process.env.REALIZE_AI_WORKSPACE_ROOT || process.cwd(),
    signingSecretEnv: "REALIZE_AI_EXECUTION_SIGNING_SECRET",
  },
  integrations: {
    encryptionKeyEnv: "REALIZE_INTEGRATIONS_ENCRYPTION_KEY",
  },
  preview: {
    enabled: process.env.REALIZE_AI_PREVIEW_ENABLED === "true",
    ttlSeconds: Number(process.env.REALIZE_AI_PREVIEW_TTL_SECONDS || 21_600),
  },
  release: {
    enabled: process.env.REALIZE_AI_RELEASE_ENABLED === "true",
    ttlSeconds: Number(process.env.REALIZE_AI_RELEASE_TTL_SECONDS || 86_400),
  },
  sourcePromotion: {
    enabled: process.env.REALIZE_AI_SOURCE_PROMOTION_ENABLED === "true",
  },
  runtime: {
    controlPlaneTokenEnv: "REALIZE_AI_CONTROL_PLANE_TOKEN",
    controlPlaneURL: process.env.REALIZE_AI_CONTROL_PLANE_URL || undefined,
    mode:
      process.env.REALIZE_AI_RUNTIME_MODE === "local-development"
        ? "local-development"
        : "central-control-plane",
    model: process.env.REALIZE_AI_MODEL || undefined,
  },
  userCollection: "users",
});

const generateTitle: GenerateTitle<Product | Page> = ({ doc }) => {
  return doc?.title
    ? `${doc.title} | Realize E-Commerce`
    : "Realize E-Commerce";
};

const generateURL: GenerateURL<Product | Page> = ({ doc }) => {
  const url = getServerSideURL();

  return doc?.slug ? `${url}/${doc.slug}` : url;
};

export const plugins: Plugin[] = [
  seoPlugin({
    generateTitle,
    generateURL,
  }),
  formBuilderPlugin({
    fields: {
      payment: false,
    },
    formSubmissionOverrides: {
      access: {
        delete: isAdmin,
        read: isAdmin,
        update: isAdmin,
      },
      admin: {
        group: "Content",
      },
    },
    formOverrides: {
      access: {
        delete: isAdmin,
        read: isAdmin,
        update: isAdmin,
        create: isAdmin,
      },
      admin: {
        group: "Content",
      },
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          if ("name" in field && field.name === "confirmationMessage") {
            return {
              ...field,
              editor: lexicalEditor({
                features: ({ rootFeatures }) => {
                  return [
                    ...rootFeatures,
                    FixedToolbarFeature(),
                    HeadingFeature({
                      enabledHeadingSizes: ["h1", "h2", "h3", "h4"],
                    }),
                  ];
                },
              }),
            };
          }
          return field;
        });
      },
    },
  }),
  ecommercePlugin({
    access: {
      adminOnlyFieldAccess,
      adminOrPublishedStatus,
      customerOnlyFieldAccess,
      isAdmin,
      isDocumentOwner,
    },
    customers: {
      slug: "users",
    },
    orders: {
      ordersCollectionOverride: ({ defaultCollection }) => ({
        ...defaultCollection,
        fields: [
          ...defaultCollection.fields,
          {
            name: "accessToken",
            type: "text",
            unique: true,
            index: true,
            admin: {
              position: "sidebar",
              readOnly: true,
            },
            hooks: {
              beforeValidate: [
                ({ value, operation }) => {
                  if (operation === "create" || !value) {
                    return crypto.randomUUID();
                  }
                  return value;
                },
              ],
            },
          },
        ],
      }),
    },
    payments: {
      paymentMethods:
        stripeSecretKey && stripePublishableKey && stripeWebhookSecret
          ? [
              stripeAdapter({
                secretKey: stripeSecretKey,
                publishableKey: stripePublishableKey,
                webhookSecret: stripeWebhookSecret,
              }),
            ]
          : [],
    },
    products: {
      productsCollectionOverride: ProductsCollection,
    },
  }),
  ...(process.env.REALIZE_AI_COMPILE_TIME_OMIT === "true" ? [] : [realizeAI]),
];
