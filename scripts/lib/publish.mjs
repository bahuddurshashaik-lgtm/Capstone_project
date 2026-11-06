import { storyPageTitle, storyToStorageHtml, indexToStorageHtml } from './stories.mjs';

export function planPublish(data, parentTitle) {
  return [
    { title: parentTitle, html: indexToStorageHtml(data), isParent: true },
    ...data.stories.map((story) => ({ title: storyPageTitle(story), html: storyToStorageHtml(story), isParent: false }))
  ];
}

export async function publishStories(client, data, { dryRun = false } = {}) {
  const pages = planPublish(data, client.config.parentTitle);
  if (dryRun) return pages.map((page) => ({ title: page.title, action: 'would publish' }));

  const homeId = await client.getSpaceHomeId();
  const [parentPage, ...childPages] = pages;
  const parent = await client.upsertPage({ title: parentPage.title, html: parentPage.html, parentId: homeId });
  const results = [{ title: parentPage.title, action: parent.action, id: parent.id }];
  for (const page of childPages) {
    const result = await client.upsertPage({ title: page.title, html: page.html, parentId: parent.id });
    results.push({ title: page.title, action: result.action, id: result.id });
  }
  return results;
}
