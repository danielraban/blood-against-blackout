"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useSliceLoader() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlGh = params.get("gh");
  const urlCity = params.get("city");

  const replaceSliceUrl = useCallback(
    (hash: string, citySlug?: string | null) => {
      const next = new URLSearchParams(params.toString());
      next.set("gh", hash);
      if (citySlug === null) next.delete("city");
      else if (citySlug) next.set("city", citySlug);
      next.delete("lat");
      next.delete("lng");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  return { urlGh, urlCity, params, replaceSliceUrl };
}
