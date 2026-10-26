// Usage: node --env-file=.env tools/kit-ids.js
const key = process.env.KIT_API_KEY;
if (!key) {
  console.error("KIT_API_KEY is missing. Run with: node --env-file=.env tools/kit-ids.js");
  process.exit(1);
}

for (const resource of ["tags", "forms"]) {
  const response = await fetch(`https://api.kit.com/v4/${resource}`, {
    headers: { "X-Kit-Api-Key": key },
  });

  if (!response.ok) {
    console.error(`${resource}: Kit returned ${response.status}. Check your API key.`);
    continue;
  }

  const data = await response.json();
  const list = data[resource] ?? [];
  console.log(`\n${resource.toUpperCase()}:`);
  for (const item of list) console.log(`  ${item.id}  ${item.name}`);
}