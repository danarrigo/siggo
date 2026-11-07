"use client";

import { useState } from "react";
import Image from "next/image";
import type { Competition } from "@/lib/model";
import { competitionImageUrl, kagglePreviewPrefix } from "@/lib/competition-images";

const sourceInitials = {
  kaggle: "KG",
  evalai: "EA",
  drivendata: "DD",
  aicrowd: "AC",
  mlh: "MLH",
  zindi: "ZD",
  codabench: "CB",
  codalab: "CL",
  devpost: "DP",
  manual: "YOU",
};

export function CompetitionCover({
  item,
  className = "",
  eager = false,
  sizes = "(max-width: 620px) 96px, (max-width: 1000px) 120px, 152px",
}: {
  item: Competition;
  className?: string;
  eager?: boolean;
  sizes?: string;
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const candidate = competitionImageUrl(item.image?.url);
  const source = candidate && failedImage !== candidate ? candidate : null;
  const kind = source ? (item.image?.kind ?? "cover") : "placeholder";
  // Follow Kaggle's public signed-CDN redirect in the browser, not in the image proxy.
  const kagglePreview = source?.startsWith(kagglePreviewPrefix) ?? false;
  return (
    <div
      className={`competition-cover cover-${kind} ${kagglePreview ? "cover-kaggle-preview" : ""} ${className}`}
      data-testid="competition-cover"
      data-visual-kind={kind}
    >
      {source ? (
        <Image
          key={source}
          src={source}
          alt={`Organizer artwork for ${item.title}`}
          fill
          sizes={sizes}
          loading={eager ? "eager" : "lazy"}
          unoptimized={kagglePreview}
          referrerPolicy="no-referrer"
          onError={() => setFailedImage(source)}
        />
      ) : (
        <div className="cover-placeholder-content" aria-hidden="true">
          <span className="cover-monogram">{sourceInitials[item.source]}</span>
          <span className="cover-empty-label">No image</span>
        </div>
      )}
    </div>
  );
}
