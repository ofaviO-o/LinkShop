import { redirect } from "next/navigation";

type ProductsAliasPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ProductsAliasPage({ searchParams }: ProductsAliasPageProps) {
  const resolvedParams = await searchParams;
  const nextParams = new URLSearchParams();

  Object.entries(resolvedParams).forEach(([key, value]) => {
    const single = getSingleParam(value);

    if (single) {
      nextParams.set(key, single);
    }
  });

  redirect(`/buscar${nextParams.toString() ? `?${nextParams.toString()}` : ""}`);
}
