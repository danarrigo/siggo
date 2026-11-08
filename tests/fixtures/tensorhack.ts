export type TensorHackFixture = { id: string; name: string; deadline: string };
export const tensorHackEntries: TensorHackFixture[] = [
  { id: "devpost-finance-fixture", name: "Fictional Finance Hack", deadline: "2035-12-01" },
  { id: "devpost-games-fixture", name: "Fictional Game Hack", deadline: "2035-12-02" },
];
export function tensorHackPage(
  items = tensorHackEntries,
  official: { id: string; url: string }[] = [],
) {
  const record = `f:${JSON.stringify(["$", "$L1", null, { items }])}\n`;
  const stream = JSON.stringify([1, record]).replaceAll("<", "\\u003c");
  const linked = official.map(({ id, url }) => ({
    "@type": "ListItem",
    item: { url: `https://tensorhack.com/hackathons/${id}`, significantLink: url },
  }));
  return `<h1>Upcoming hackathons</h1><script>self.__next_f.push(${stream})</script><script type="application/ld+json">${JSON.stringify([{ "@type": "CollectionPage", mainEntity: { "@type": "ItemList", itemListElement: linked } }])}</script>${items.map((item) => `<a href="/hackathons/${item.id}">Listing</a>`).join("")}`;
}
