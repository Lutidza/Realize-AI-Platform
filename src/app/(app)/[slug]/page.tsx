/**
 * @file src/app/(app)/[slug]/page.tsx
 * @version 1.0.0
 * @date 2026-09-11
 * @description Отображает CMS-страницу и metadata через защищённое чтение документа.
 */

import type { Metadata } from "next";

import { RenderBlocks } from "@/blocks/RenderBlocks";
import { RenderHero } from "@/heros/RenderHero";
import { generateMeta } from "@/utilities/generateMeta";
import configPromise from "@payload-config";
import { getPayload } from "payload";
import { findPreviewDocumentBySlug } from "@/utilities/preview/findPreviewDocumentBySlug.service";
import React from "react";

import { notFound } from "next/navigation";

export async function generateStaticParams() {
  if (process.env.REALIZE_BUILD_WITHOUT_DATABASE === "true") return [];

  const payload = await getPayload({ config: configPromise });
  const pages = await payload.find({
    collection: "pages",
    draft: false,
    limit: 1000,
    overrideAccess: false,
    pagination: false,
    select: {
      slug: true,
    },
  });

  const params = pages.docs
    ?.filter((doc) => {
      return doc.slug !== "home";
    })
    .map(({ slug }) => {
      return { slug };
    });

  return params;
}

type Args = {
  params: Promise<{
    slug?: string;
  }>;
};

export default async function Page({ params }: Args) {
  const { slug = "home" } = await params;

  const page = await findPreviewDocumentBySlug({
    collection: "pages",
    slug,
  });

  if (!page) {
    return notFound();
  }

  const { hero, layout } = page;

  return (
    <article className="pt-16 pb-24">
      <RenderHero {...hero} />
      <RenderBlocks blocks={layout} />
    </article>
  );
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  if (process.env.REALIZE_BUILD_WITHOUT_DATABASE === "true") return {};

  const { slug = "home" } = await params;

  const page = await findPreviewDocumentBySlug({
    collection: "pages",
    slug,
  });

  return generateMeta({ doc: page });
}
