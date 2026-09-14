/**
 * @file src/blocks/Content/Component.tsx
 * @version 1.0.0
 * @date 2026-09-14
 * @description Отображает колонки страницы с generated контрактом ID блока.
 */
import { cn } from "@/utilities/cn";
import React from "react";
import { RichText } from "@/components/RichText";
import type { ContentBlock as ContentBlockProps } from "@/payload-types";

import { CMSLink } from "../../components/Link";

export const ContentBlock: React.FC<
  ContentBlockProps & {
    className?: string;
  }
> = (props) => {
  const { columns } = props;

  const colsSpanClasses = {
    full: "12",
    half: "6",
    oneThird: "4",
    twoThirds: "8",
  };

  return (
    <div className="container my-16">
      <div className="grid grid-cols-4 lg:grid-cols-12 gap-y-8 gap-x-16">
        {columns &&
          columns.length > 0 &&
          columns.map((col, index) => {
            const { enableLink, link, richText, size } = col;

            return (
              <div
                className={cn(
                  `col-span-4 lg:col-span-${colsSpanClasses[size!]}`,
                  {
                    "md:col-span-2": size !== "full",
                  },
                )}
                key={index}
              >
                {richText && <RichText data={richText} enableGutter={false} />}

                {enableLink && <CMSLink {...link} />}
              </div>
            );
          })}
      </div>
    </div>
  );
};
